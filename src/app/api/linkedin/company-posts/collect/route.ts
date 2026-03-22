import { NextRequest, NextResponse } from "next/server";
import type { Page } from "puppeteer";
import { normalizeUrl } from "@/lib/google-news-rss";
import { insertArticles, insertRun, requireSupabase } from "@/lib/db";
import type { Article, Run } from "@/lib/types";
import {
  withBrowserPage,
  humanPause,
  loadServiceCookies,
} from "@/lib/browser/puppeteerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function collapseWhitespace(s: string): string {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function truncate(s: string, max: number): string {
  const str = String(s || "");
  return str.length <= max ? str : str.slice(0, max);
}

function parseLinkedInRelativeDate(timeStr: string): string {
  if (!timeStr) return new Date().toISOString();

  const now = new Date();
  const lower = timeStr.toLowerCase().trim();
  const match = lower.match(/^(\d+)\s*(h|d|w|mo|m|y)/);
  if (!match) return now.toISOString();

  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === "h") now.setHours(now.getHours() - value);
  else if (unit === "d") now.setDate(now.getDate() - value);
  else if (unit === "w") now.setDate(now.getDate() - value * 7);
  else if (unit === "mo" || unit === "m") now.setMonth(now.getMonth() - value);
  else if (unit === "y") now.setFullYear(now.getFullYear() - value);

  return now.toISOString();
}

type RawCompanyPost = {
  authorName: string;
  authorUrl: string;
  postContent: string;
  publishedAtStr: string;
  postUrl: string;
};

async function safeScrollPage(page: Page, seconds: number, delayMs: number): Promise<void> {
  const loops = Math.max(0, Math.floor(seconds));
  for (let i = 0; i < loops; i++) {
    try {
      // Randomize scroll distance (70-130% of viewport) to look human
      await page.evaluate(() => {
        const jitter = 0.7 + Math.random() * 0.6;
        window.scrollBy(0, Math.floor(window.innerHeight * jitter));
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // LinkedIn sometimes triggers an internal route change while scrolling.
      // Continue after giving the page a chance to settle.
      if (/Execution context was destroyed/i.test(message)) {
        await page.waitForFunction(() => document.readyState === "complete", {
          timeout: 10_000,
        }).catch(() => undefined);
      } else {
        throw err;
      }
    }
    // Random delay between scrolls (0.8x-1.5x of base delay)
    const jitteredDelay = Math.floor(delayMs * (0.8 + Math.random() * 0.7));
    await new Promise((r) => setTimeout(r, jitteredDelay));
  }
}

async function fetchCompanyPosts(
  companySlug: string,
  maxPostsPerCompany: number,
  scrollSeconds: number,
  headless: boolean = true,
): Promise<RawCompanyPost[]> {
  return withBrowserPage(async (page) => {
    await loadServiceCookies(page, "linkedin");
    await humanPause(500, 900);
    page.setDefaultNavigationTimeout(60000);

    const companyPostsUrl = `https://www.linkedin.com/company/${encodeURIComponent(companySlug)}/posts/`;
    await page.goto(companyPostsUrl, { waitUntil: "domcontentloaded" });
    await humanPause(2000, 2500);
    await safeScrollPage(page, scrollSeconds, 1600);
    await humanPause(1200, 2200);

    await page.$$eval("button, span", (elements) => {
      elements.forEach((el) => {
        const text = el.textContent?.trim().toLowerCase() || "";
        if (text === "see more") (el as HTMLElement).click();
      });
    });

    const rawPosts = await page.evaluate(() => {
      const postNodes = document.querySelectorAll<HTMLElement>(
        "div.feed-shared-update-v2, li.artdeco-card, article",
      );
      const extracted: RawCompanyPost[] = [];

      postNodes.forEach((node) => {
        const textEl =
          node.querySelector<HTMLElement>('[data-test-id="feed-update-text"]') ??
          node.querySelector<HTMLElement>("span.break-words") ??
          node.querySelector<HTMLElement>("div.break-words") ??
          node.querySelector<HTMLElement>(".feed-shared-update-v2__commentary");
        const postContent = (textEl?.innerText || textEl?.textContent || "").trim();
        if (!postContent) return;

        const authorLinkEl =
          node.querySelector<HTMLAnchorElement>('a[href*="/company/"][data-field="actor-link"]') ??
          node.querySelector<HTMLAnchorElement>('a[href*="/company/"]') ??
          node.querySelector<HTMLAnchorElement>('a[href*="/in/"][data-field="actor-link"]') ??
          node.querySelector<HTMLAnchorElement>('a[href*="/in/"]');

        const authorEl =
          authorLinkEl ??
          node.querySelector<HTMLElement>(".update-components-actor__name") ??
          node.querySelector<HTMLElement>(".feed-shared-actor__name");
        const authorName = (authorEl?.innerText || authorEl?.textContent || "")
          .trim()
          .split("\n")[0];

        let authorUrl = "";
        const href = authorLinkEl?.getAttribute("href") || "";
        if (href) {
          authorUrl = href.startsWith("/") ? `https://www.linkedin.com${href}` : href;
          authorUrl = authorUrl.split("?")[0];
        }

        const timeEl =
          node.querySelector<HTMLElement>("time") ??
          node.querySelector<HTMLElement>(
            '.update-components-actor__sub-description span[aria-hidden="true"]',
          ) ??
          node.querySelector<HTMLElement>(".update-components-actor__sub-description");
        const publishedAtStr = (timeEl?.innerText || timeEl?.textContent || "")
          .trim()
          .split("\n")[0];

        let postUrl = "";
        const anchors = Array.from(node.querySelectorAll<HTMLAnchorElement>("a[href]"));
        const candidate = anchors.find((a) => {
          const h = a.getAttribute("href") || "";
          if (!h) return false;
          const isPost =
            h.includes("/feed/update/") ||
            h.includes("urn:li:activity:") ||
            h.includes("/posts/") ||
            h.includes("/pulse/");
          if (!isPost) return false;
          if (h.includes("/in/") || h.includes("/company/")) return false;
          return true;
        });

        const candidateHref = candidate?.getAttribute("href") || "";
        if (candidateHref) {
          postUrl = candidateHref.startsWith("/")
            ? `https://www.linkedin.com${candidateHref}`
            : candidateHref;
          postUrl = postUrl.split("?")[0];
        }
        if (!postUrl) {
          const urn =
            node.getAttribute("data-urn") ||
            node.getAttribute("data-entity-urn") ||
            node.querySelector<HTMLElement>("[data-urn]")?.getAttribute("data-urn") ||
            node.querySelector<HTMLElement>("[data-entity-urn]")?.getAttribute("data-entity-urn") ||
            "";
          const match = String(urn).match(/urn:li:activity:\d+/);
          if (match?.[0]) postUrl = `https://www.linkedin.com/feed/update/${match[0]}/`;
        }

        extracted.push({
          authorName,
          authorUrl,
          postContent,
          publishedAtStr,
          postUrl,
        });
      });

      return extracted;
    });

    return rawPosts
      .filter((p) => p.postUrl && p.postContent)
      .slice(0, Math.max(1, maxPostsPerCompany));
  }, { headless });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const companySlugs: string[] = Array.isArray(body.companySlugs)
      ? body.companySlugs
      : typeof body.companySlug === "string"
        ? [body.companySlug]
        : [];
    const filterDays: number = typeof body.filterDays === "number" ? body.filterDays : 0;
    const maxArticles: number = typeof body.maxArticles === "number" ? body.maxArticles : 60;
    const maxPostsPerCompany: number =
      typeof body.maxPostsPerCompany === "number" ? body.maxPostsPerCompany : 30;
    const scrollSeconds: number = typeof body.scrollSeconds === "number" ? body.scrollSeconds : 45;
    const headless: boolean = body.headless !== false;
    const batchTag: string = typeof body._batchTag === "string" ? body._batchTag : "";

    const cleanSlugs = companySlugs
      .map((s) => {
        const raw = String(s || "").trim();
        // Accept full LinkedIn URLs — extract just the company slug
        const urlMatch = raw.match(/linkedin\.com\/company\/([^/?#]+)/i);
        if (urlMatch?.[1]) return decodeURIComponent(urlMatch[1]).toLowerCase();
        return raw.replace(/^\/+|\/+$/g, "").toLowerCase();
      })
      .filter(Boolean);

    if (cleanSlugs.length === 0) {
      return NextResponse.json(
        { error: "companySlugs array or companySlug string is required" },
        { status: 400 },
      );
    }

    const runId = `run_li_company_${new Date().toISOString().replace(/[:.TZ-]/g, "").slice(0, 15)}`;
    const ts = Date.now();
    const createdAt = new Date().toISOString();

    const RE_DJI = /\bdji\b/i;
    const RE_DJI_DOCK = /dji\s*dock/i;
    const RE_DOCK = /\bdock\b/i;
    const RE_DIAB = /drone.in.a.box/i;
    const allRaw: RawCompanyPost[] = [];
    type CompanyStat = { slug: string; postsFound: number; dockMatches: number; djiCount: number; dockCount: number; diabCount: number };
    const perCompany: CompanyStat[] = [];
    for (let ci = 0; ci < cleanSlugs.length; ci++) {
      const slug = cleanSlugs[ci];
      const posts = await fetchCompanyPosts(slug, maxPostsPerCompany, scrollSeconds, headless);
      allRaw.push(...posts);
      const texts = posts.map((p) => p.postContent);
      const dockMatches = texts.filter((t) => RE_DJI_DOCK.test(t)).length;
      const djiCount = texts.filter((t) => RE_DJI.test(t)).length;
      const dockCount = texts.filter((t) => RE_DOCK.test(t)).length;
      const diabCount = texts.filter((t) => RE_DIAB.test(t)).length;
      perCompany.push({ slug, postsFound: posts.length, dockMatches, djiCount, dockCount, diabCount });
      if (ci < cleanSlugs.length - 1) {
        await humanPause(4000, 5000);
      }
    }

    const allArticles: Article[] = allRaw.map((post, i) => {
      const url = post.postUrl || "https://www.linkedin.com/";
      const normalized = post.postUrl ? normalizeUrl(post.postUrl) : `linkedin_${runId}_${ts}_${i}`.toLowerCase();
      const content = collapseWhitespace(post.postContent || "");
      const author = collapseWhitespace(post.authorName || "") || null;
      const snippet = content ? truncate(content, 3000) : null;
      const title = content ? truncate(content, 140) : author ? `${author} - LinkedIn post` : "LinkedIn Post";

      return {
        id: `li_company_${runId}_${ts}_${i}`,
        run_id: runId,
        source: "linkedin",
        title,
        url,
        publisher_url: post.authorUrl || undefined,
        normalized_url: normalized,
        snippet,
        publisher: author ?? "LinkedIn",
        published_at: parseLinkedInRelativeDate(post.publishedAtStr),
        created_at: createdAt,
      };
    });

    const dateFiltered =
      filterDays === 0
        ? allArticles
        : allArticles.filter((a) => {
            if (!a.published_at) return false;
            const cutoff = new Date(Date.now() - filterDays * 86_400_000);
            return new Date(a.published_at) >= cutoff;
          });

    const uniqueMap = new Map<string, Article>();
    for (const article of dateFiltered) {
      if (!uniqueMap.has(article.normalized_url)) uniqueMap.set(article.normalized_url, article);
    }
    const uniqueArticles = Array.from(uniqueMap.values()).slice(0, maxArticles);

    // Only store articles that mention relevant keywords — prevents DB bloat
    // from irrelevant company posts (birthday celebrations, hiring, etc.)
    const RELEVANCE_RE = /\b(dji|dock|drone.in.a.box|bvlos|flighthub|autonomous\s*drone|remote\s*ops|remote\s*operation)\b/i;
    const articlesToStore = uniqueArticles.filter((a) => {
      const text = [a.title, a.snippet].filter(Boolean).join(" ");
      return RELEVANCE_RE.test(text);
    });

    const run: Run = {
      id: runId,
      keywords: cleanSlugs.map((slug) => `company:${slug}`),
      sources: ["linkedin"],
      regions: [],
      filter_days: filterDays,
      min_score: 40,
      max_articles: maxArticles,
      status: "completed",
      articles_fetched: allArticles.length,
      articles_stored: articlesToStore.length,
      dedup_removed: allArticles.length - uniqueArticles.length,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };

    let finalArticles = uniqueArticles;
    try {
      await insertRun(run);
      const { idMap } = await insertArticles(articlesToStore);
      if (idMap.size > 0) {
        finalArticles = uniqueArticles.map((a) => ({ ...a, id: idMap.get(a.id) ?? a.id }));
      }
    } catch (dbErr) {
      console.error(
        "[/api/linkedin/company-posts/collect] DB write failed (non-fatal):",
        dbErr instanceof Error ? dbErr.message : dbErr,
      );
    }

    // ── Save scan log (non-fatal) ──
    try {
      const db = requireSupabase();
      const logTs = new Date().toISOString();

      // Try full insert first, then progressively strip missing columns
      const baseRows = perCompany.map(({ slug, postsFound }) => ({
        slug,
        posts_scraped: postsFound,
        run_id: runId,
        scanned_at: logTs,
      }));

      // Build extra fields that may not exist yet
      const extraFields: Record<string, unknown>[] = perCompany.map((pc) => ({
        dock_matches: pc.dockMatches,
        dji_count: pc.djiCount,
        dock_count: pc.dockCount,
        diab_count: pc.diabCount,
        batch: batchTag || null,
      }));

      // Attempt with all columns
      const fullRows = baseRows.map((row, i) => ({ ...row, ...extraFields[i] }));
      const { error: err1 } = await db.from("dji_resellers_linkedin_scan_log").insert(fullRows);

      if (err1) {
        console.error("[scan-log] full insert failed:", err1.message, "— trying minimal insert");
        // Fallback: just the base columns (slug, posts_scraped, run_id, scanned_at)
        const { error: err2 } = await db.from("dji_resellers_linkedin_scan_log").insert(baseRows);
        if (err2) {
          console.error("[scan-log] minimal insert also failed:", err2.message);
        } else {
          console.log("[scan-log] saved with minimal columns (run ALTER TABLE to add dock_matches + batch)");
        }
      }
    } catch (logErr) {
      console.error(
        "[/api/linkedin/company-posts/collect] scan-log write failed (non-fatal):",
        logErr instanceof Error ? logErr.message : logErr,
      );
    }

    return NextResponse.json({
      companySlugs: cleanSlugs,
      count: finalArticles.length,
      articles: finalArticles,
      runId,
      stats: {
        totalFetched: allArticles.length,
        afterDateFilter: dateFiltered.length,
        afterDedup: uniqueArticles.length,
        afterScoreFilter: uniqueArticles.length,
        stored: uniqueArticles.length,
        dedupRemoved: allArticles.length - uniqueArticles.length,
        scoreFilterRemoved: 0,
      },
      perCompany,
      keywords: cleanSlugs.map((slug) => `company:${slug}`),
      regions: [],
      filterDays,
    });
  } catch (err) {
    console.error("[/api/linkedin/company-posts/collect] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "LinkedIn company posts collection failed" },
      { status: 500 },
    );
  }
}
