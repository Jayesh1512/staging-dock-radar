import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  withBrowserPage,
  loadServiceCookies,
  scrollPage,
} from "../../../lib/browser/puppeteerClient";
import type { Article, Run } from "@/lib/types";
import { normalizeUrl } from "@/lib/google-news-rss";
import { insertArticles, insertRun } from "@/lib/db";

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
  
  // Extract number and unit (h, d, w, mo, m, y)
  // Handles formats like "16h •", "3w", "1mo", "2d", etc.
  const match = lower.match(/^(\d+)\s*(h|d|w|mo|m|y)/);
  if (!match) return now.toISOString();

  const value = parseInt(match[1]);
  const unit = match[2];

  if (unit === "h") now.setHours(now.getHours() - value);
  else if (unit === "d") now.setDate(now.getDate() - value);
  else if (unit === "w") now.setDate(now.getDate() - value * 7);
  else if (unit === "mo" || unit === "m") now.setMonth(now.getMonth() - value);
  else if (unit === "y") now.setFullYear(now.getFullYear() - value);

  return now.toISOString();
}

async function fetchLinkedInPosts(
  keyword: string,
  runId: string,
  scrollSeconds: number
): Promise<Article[]> {
  return withBrowserPage(async (page) => {
    await loadServiceCookies(page, "linkedin");

    const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(
      `"${keyword}"`
    )}&origin=GLOBAL_SEARCH_HEADER`;

    // Relax navigation timing to reduce flaky timeouts from LinkedIn
    page.setDefaultNavigationTimeout(60000);

    try {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
    } catch (err) {
      console.warn("[collect-linkedin] page.goto timeout, continuing with best-effort content");
    }

    // Scroll down to load more results
    await scrollPage(page, Math.max(0, scrollSeconds), 1000);

    // Expand all "see more" buttons in posts
    await page.$$eval("button, span", (elements) => {
      elements.forEach((el) => {
        const text = el.textContent?.trim().toLowerCase() || "";
        if (text === "see more") {
          (el as HTMLElement).click();
        }
      });
    });

    // Save the raw HTML in /data for debugging + offline parsing
    const html = await page.content();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeKeyword = keyword.replace(/[^\w-]+/g, "_").slice(0, 50) || "linkedin";
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const htmlPath = path.join(dataDir, `linkedin-search-${safeKeyword}-${timestamp}.html`);
    fs.writeFileSync(htmlPath, html, "utf8");

    // Extract posts into structured data
    const rawPosts = await page.evaluate(() => {
      const postNodes = document.querySelectorAll<HTMLElement>(
        "div.feed-shared-update-v2, li.artdeco-card, article"
      );
      const extracted: any[] = [];

      postNodes.forEach((node) => {
        // CONTENT
        const textEl =
          node.querySelector<HTMLElement>('[data-test-id="feed-update-text"]') ??
          node.querySelector<HTMLElement>("span.break-words") ??
          node.querySelector<HTMLElement>("div.break-words") ??
          node.querySelector<HTMLElement>(".feed-shared-update-v2__commentary");

        const postContent = (textEl?.innerText || textEl?.textContent || "").trim();
        if (!postContent) return;

        // AUTHOR
        const authorLinkEl =
          node.querySelector<HTMLAnchorElement>('a[href*="/in/"][data-field="actor-link"]') ??
          node.querySelector<HTMLAnchorElement>('a[href*="/company/"][data-field="actor-link"]') ??
          node.querySelector<HTMLAnchorElement>('a[href*="/in/"]') ??
          node.querySelector<HTMLAnchorElement>('a[href*="/company/"]');

        const authorEl =
          authorLinkEl ??
          node.querySelector<HTMLElement>(".update-components-actor__name") ??
          node.querySelector<HTMLElement>(".feed-shared-actor__name") ??
          node.querySelector<HTMLElement>('.update-components-actor__title span[dir="ltr"]') ??
          node.querySelector<HTMLElement>('.app-aware-link > span[dir="ltr"]');

        const authorName = (authorEl?.innerText || authorEl?.textContent || "").trim().split("\n")[0];
        let authorUrl: string = "";
        if (authorLinkEl?.getAttribute) {
          const href = authorLinkEl.getAttribute("href") || "";
          if (href) {
            authorUrl = href.startsWith("/") ? `https://www.linkedin.com${href}` : href;
            authorUrl = authorUrl.split("?")[0];
          }
        }

        // TIME
        const timeEl =
          node.querySelector<HTMLElement>("time") ??
          node.querySelector<HTMLElement>(
            '.update-components-actor__sub-description span[aria-hidden="true"]'
          ) ??
          node.querySelector<HTMLElement>(".update-components-actor__sub-description");

        const publishedAtStr = (timeEl?.innerText || timeEl?.textContent || "").trim().split("\n")[0];

        // URL
        let postUrl: string = "";
        const anchors = Array.from(node.querySelectorAll<HTMLAnchorElement>("a[href]"));
        const candidate = anchors.find((a) => {
          const href = a.getAttribute("href") || "";
          if (!href) return false;
          // Prefer the real post permalink, not the actor profile.
          // Examples we want:
          // - /feed/update/urn:li:activity:...
          // - /posts/...
          // - /pulse/... (rare)
          const isPost =
            href.includes("/feed/update/") ||
            href.includes("urn:li:activity:") ||
            href.includes("/posts/") ||
            href.includes("/pulse/");
          if (!isPost) return false;
          // Exclude obvious profile/company links that can sometimes include "activity" fragments.
          if (href.includes("/in/") || href.includes("/company/")) return false;
          return true;
        });

        const href = candidate?.getAttribute("href") || "";
        if (href) {
          postUrl = href.startsWith("/") ? `https://www.linkedin.com${href}` : href;
          postUrl = postUrl.split("?")[0];
        }
        // Fallback: LinkedIn search results often include the activity URN on the article node.
        // Build a canonical permalink that opens the post directly.
        if (!postUrl) {
          const urn =
            node.getAttribute("data-urn") ||
            node.getAttribute("data-entity-urn") ||
            node.querySelector<HTMLElement>("[data-urn]")?.getAttribute("data-urn") ||
            node.querySelector<HTMLElement>("[data-entity-urn]")?.getAttribute("data-entity-urn") ||
            "";

          const match = String(urn).match(/urn:li:activity:\d+/);
          if (match?.[0]) {
            postUrl = `https://www.linkedin.com/feed/update/${match[0]}/`;
          }
        }
        // Last-resort: scan node HTML for an activity URN.
        if (!postUrl) {
          const html = node.outerHTML || "";
          const match = html.match(/urn:li:activity:\d+/);
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

    // Hydrate: open each post permalink and extract the canonical post text.
    // Why: search pages sometimes show truncated/quoted text and "url" can otherwise point to publisher.
    // Best-effort: on failure, keep the already-extracted postContent.
    const hydrateLimit = 30; // safety cap to avoid long runs / LinkedIn rate limits
    const browser = page.browser();
    const hydratedPosts: any[] = [];

    for (let i = 0; i < rawPosts.length; i++) {
      const post = rawPosts[i];
      if (!post?.postUrl || typeof post.postUrl !== "string") {
        hydratedPosts.push(post);
        continue;
      }
      if (i >= hydrateLimit) {
        hydratedPosts.push(post);
        continue;
      }

      let hydratedText: string | null = null;
      try {
        const postPage = await browser.newPage();
        postPage.setDefaultNavigationTimeout(45000);
        await postPage.goto(post.postUrl, { waitUntil: "domcontentloaded" });

        // Expand "see more" if present
        await postPage.$$eval("button, span", (elements) => {
          elements.forEach((el) => {
            const text = el.textContent?.trim().toLowerCase() || "";
            if (text === "see more") (el as HTMLElement).click();
          });
        });

        hydratedText = await postPage.evaluate(() => {
          const textEl =
            document.querySelector<HTMLElement>('[data-test-id="feed-update-text"]') ??
            document.querySelector<HTMLElement>("div.feed-shared-update-v2__commentary") ??
            document.querySelector<HTMLElement>("span.break-words") ??
            document.querySelector<HTMLElement>("div.break-words");
          const t = (textEl?.innerText || textEl?.textContent || "").trim();
          return t || null;
        });

        await postPage.close();
      } catch (e) {
        // Non-fatal: keep search text
      }

      hydratedPosts.push({
        ...post,
        postContent: hydratedText && hydratedText.length > (post.postContent?.length ?? 0)
          ? hydratedText
          : post.postContent,
      });
    }

    // Map to canonical Article type with parsed dates in Node.js context
    const ts = Date.now();
    const createdAt = new Date().toISOString();
    const articles: Article[] = hydratedPosts
      .map((post: any, i: number) => {
        const url: string = post.postUrl || "";
        const normalized = url ? normalizeUrl(url) : `linkedin_${runId}_${ts}_${i}`.toLowerCase();
        const content = collapseWhitespace(post.postContent || "");
        const author = collapseWhitespace(post.authorName || "") || null;
        const publisherUrl: string | undefined = post.authorUrl ? String(post.authorUrl) : undefined;

        // IMPORTANT: keep snippet bounded so /api/score prompt doesn't explode and fall back to 0s.
        const snippet = content ? truncate(content, 1000) : null;
        // Keep title short but meaningful (helps LLM signal + UI)
        const title = content
          ? truncate(content, 140)
          : (author ? `${author} – LinkedIn post` : "LinkedIn Post");

        return {
          id: `li_${runId}_${ts}_${i}`,
          run_id: runId,
          source: "linkedin",
          title,
          url: url || "https://www.linkedin.com/",
          publisher_url: publisherUrl,
          normalized_url: normalized,
          snippet,
          publisher: author ?? "LinkedIn",
          published_at: parseLinkedInRelativeDate(post.publishedAtStr),
          created_at: createdAt,
        };
      })
      // Drop any items missing a usable URL+content (these cause noise + dedup issues downstream)
      .filter((a) => !!a.url && !!a.normalized_url && !!a.snippet);

    return articles;
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const keywords: string[] = Array.isArray(body.keywords)
      ? body.keywords
      : body.keyword
        ? [body.keyword]
        : [];
    const filterDays: number = typeof body.filterDays === 'number' ? body.filterDays : 7;
    const maxArticles: number = typeof body.maxArticles === 'number' ? body.maxArticles : 40;
    const scrollSeconds: number = typeof body.scrollSeconds === "number" ? body.scrollSeconds : 180;

    if (keywords.length === 0) {
      return NextResponse.json(
        { error: "keywords array or keyword string is required" },
        { status: 400 }
      );
    }

    const allArticles: Article[] = [];
    const runId = `run_li_${new Date().toISOString().replace(/[:.TZ-]/g, '').slice(0, 15)}`;

    for (const k of keywords) {
      if (!k.trim()) continue;
      console.log(`[/api/collect-linkedin] Fetching for keyword: ${k.trim()}`);
      const articles = await fetchLinkedInPosts(k.trim(), runId, scrollSeconds);
      allArticles.push(...articles);
    }

    // ── Date filter: filterDays=0 means "All" — skip cutoff entirely ────────
    // LinkedIn's relevance-ranked search surfaces old posts (>1 month) when they
    // are the best match; our cutoff is the only thing discarding them.
    // filterDays=0 trusts LinkedIn's ranking and keeps everything.
    let dateFiltered: Article[];
    if (filterDays === 0) {
      dateFiltered = allArticles;
      console.log(`[/api/collect-linkedin] Date filter: All (no cutoff) — ${allArticles.length} articles`);
    } else {
      const cutoff = new Date(Date.now() - filterDays * 86_400_000);
      dateFiltered = allArticles.filter(a => a.published_at ? new Date(a.published_at) >= cutoff : false);
      console.log(`[/api/collect-linkedin] Date filter (${filterDays}d): ${allArticles.length} → ${dateFiltered.length} articles`);
    }
    // ── Deduplicate by normalized_url before insertion ──────────────────────
    const uniqueMap = new Map<string, Article>();
    for (const a of dateFiltered) {
      if (!uniqueMap.has(a.normalized_url)) {
        uniqueMap.set(a.normalized_url, a);
      }
    }
    const uniqueArticles = Array.from(uniqueMap.values()).slice(0, maxArticles);

    const run: Run = {
      id: runId,
      keywords: keywords,
      sources: ['linkedin'],
      regions: [],
      filter_days: filterDays,
      min_score: body.minScore ?? 40,
      max_articles: maxArticles,
      status: 'completed',
      articles_fetched: allArticles.length,
      articles_stored: uniqueArticles.length,
      dedup_removed: allArticles.length - uniqueArticles.length,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };

    // Persist to JSON file (audit/debug) and DB (for downstream pipeline)
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const jsonPath = path.join(
      dataDir,
      `linkedin-collect-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    );
    fs.writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          run,
          stats: {
            totalFetched: allArticles.length,
            afterDateFilter: dateFiltered.length,
            afterDedup: uniqueArticles.length,
            stored: uniqueArticles.length,
          },
          articles: uniqueArticles,
        },
        null,
        2
      ),
      "utf8"
    );

    // DB persistence (non-fatal on failure, consistent with /api/collect behavior)
    let finalArticles = uniqueArticles;
    try {
      await insertRun(run);
      const { insertedCount, idMap } = await insertArticles(uniqueArticles);

      // Remap cross-run duplicates to the DB's canonical IDs
      if (idMap.size > 0) {
        finalArticles = uniqueArticles.map((a) => ({
          ...a,
          id: idMap.get(a.id) ?? a.id,
        }));
        console.log(
          `[/api/collect-linkedin] DB: ${insertedCount} new, ${idMap.size} remapped to existing IDs`
        );
      } else {
        console.log(`[/api/collect-linkedin] DB: ${insertedCount} new articles persisted`);
      }
    } catch (dbErr) {
      console.error(
        "[/api/collect-linkedin] DB write failed (non-fatal):",
        dbErr instanceof Error ? dbErr.message : dbErr
      );
    }

    return NextResponse.json(
      {
        keywords: keywords,
        count: finalArticles.length,
        articles: finalArticles,
        runId,
        stats: {
          totalFetched: allArticles.length,
          afterDateFilter: allArticles.length,
          afterDedup: uniqueArticles.length,
          afterScoreFilter: uniqueArticles.length,
          stored: uniqueArticles.length,
          dedupRemoved: allArticles.length - uniqueArticles.length,
          scoreFilterRemoved: 0,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("LinkedIn collect-linkedin error:", err);
    return NextResponse.json(
      { error: err?.message || "LinkedIn collection failed" },
      { status: 500 }
    );
  }
}


