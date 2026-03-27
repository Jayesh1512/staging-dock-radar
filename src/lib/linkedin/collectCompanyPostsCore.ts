import type { Page } from "puppeteer";
import { normalizeUrl } from "@/lib/google-news-rss";
import type { Article, PipelineStats } from "@/lib/types";
import { withBrowserPage, humanPause, loadServiceCookies } from "@/lib/browser/puppeteerClient";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Types ────────────────────────────────────────────────────────────────────

type RawCompanyPost = {
  authorName: string;
  authorUrl: string;
  postContent: string;
  publishedAtStr: string;
  postUrl: string;
};

export type PageState = "OK" | "LOGIN_WALL" | "CAPTCHA" | "NOT_FOUND" | "AUTH_WALL" | "NO_FEED" | "ERROR" | "SKIPPED_RATE_LIMIT";

export type CompanyStat = {
  slug: string;
  postsFound: number;
  state: PageState;
  dockMatches: number;
  djiCount: number;
  dockCount: number;
  diabCount: number;
};

// ─── Keyword regexes (consistent with B / route.ts) ──────────────────────────

const RE_DJI = /\bdji\b/i;
const RE_DJI_DOCK = /dji\s*dock/i;
const RE_DOCK = /\bdock\b/i;
const RE_DIAB = /drone.in.a.box/i;

// ─── Block detection ─────────────────────────────────────────────────────────

async function detectPageState(page: Page): Promise<PageState> {
  return page.evaluate(() => {
    // LinkedIn login wall
    if (document.querySelector('.join-form, .login-form, [data-test-id="login-form"]'))
      return "LOGIN_WALL" as const;

    // CAPTCHA challenge
    if (document.querySelector('.captcha, #captcha, [data-test-id="challenge"]'))
      return "CAPTCHA" as const;

    // Page not found
    if (document.title.includes("Page not found") || document.querySelector(".not-found-404"))
      return "NOT_FOUND" as const;

    // Auth wall (limited view)
    if (document.querySelector(".upsell-modal, .auth-wall"))
      return "AUTH_WALL" as const;

    // Company page loaded but no feed area
    if (!document.querySelector(".scaffold-layout__main, .org-grid__content-height-enforcer"))
      return "NO_FEED" as const;

    return "OK" as const;
  });
}

// ─── Scroll with viewport jitter + time jitter ───────────────────────────────

async function safeScrollPage(page: Page, seconds: number, delayMs: number, jitterMs: number): Promise<void> {
  const loops = Math.max(0, Math.floor(seconds));
  for (let i = 0; i < loops; i++) {
    try {
      // Viewport jitter: 70-130% of viewport height (consistent with B)
      await page.evaluate(() => {
        const jitter = 0.7 + Math.random() * 0.6;
        window.scrollBy(0, Math.floor(window.innerHeight * jitter));
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/Execution context was destroyed/i.test(message)) {
        await page.waitForFunction(() => document.readyState === "complete", {
          timeout: 10_000,
        }).catch(() => undefined);
      } else {
        throw err;
      }
    }
    // Time jitter: base delay + random 0-jitterMs
    const extra = jitterMs > 0 ? Math.floor(Math.random() * (jitterMs + 1)) : 0;
    await new Promise((r) => setTimeout(r, delayMs + extra));
  }
}

// ─── Scrape a single company page (uses existing Page — no browser launch) ───

async function scrapeCompanyPosts(
  page: Page,
  companySlug: string,
  maxPostsPerCompany: number,
  scrollSeconds: number,
): Promise<{ posts: RawCompanyPost[]; state: PageState }> {
  const companyPostsUrl = `https://www.linkedin.com/company/${encodeURIComponent(companySlug)}/posts/`;

  await page.goto(companyPostsUrl, { waitUntil: "domcontentloaded" });
  await humanPause(2500, 4000);

  // Check for blocks before investing time in scrolling
  const state = await detectPageState(page);
  if (state !== "OK") {
    console.log(`[company-posts-core] ${companySlug}: page state = ${state}`);
    return { posts: [], state };
  }

  await safeScrollPage(page, scrollSeconds, 1600, 1400);
  await humanPause(1500, 2500);

  // Expand "See more" buttons to get full post text
  await page.$$eval("button, span", (elements) => {
    elements.forEach((el) => {
      const text = el.textContent?.trim().toLowerCase() || "";
      if (text === "see more") (el as HTMLElement).click();
    });
  });

  // Brief pause after expanding
  await humanPause(500, 1000);

  const rawPosts = await page.evaluate(() => {
    const postNodes = document.querySelectorAll<HTMLElement>(
      "div.feed-shared-update-v2, li.artdeco-card, article",
    );
    const extracted: {
      authorName: string;
      authorUrl: string;
      postContent: string;
      publishedAtStr: string;
      postUrl: string;
    }[] = [];

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

  const filtered = rawPosts
    .filter((p) => p.postUrl && p.postContent)
    .slice(0, Math.max(1, maxPostsPerCompany));

  console.log(`[company-posts-core] ${companySlug}: ${filtered.length} posts extracted`);
  return { posts: filtered, state: "OK" };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function cleanCompanySlugs(companySlugs: string[]): string[] {
  return companySlugs
    .map((s) => {
      const raw = String(s || "").trim();
      // Accept full LinkedIn URLs — extract just the company slug
      const urlMatch = raw.match(/linkedin\.com\/company\/([^/?#]+)/i);
      if (urlMatch?.[1]) return decodeURIComponent(urlMatch[1]).toLowerCase();
      return raw.replace(/^\/+|\/+$/g, "").toLowerCase();
    })
    .filter(Boolean);
}

/**
 * Scrape LinkedIn company post pages — single browser session for all companies.
 * Returns articles + per-company stats with block detection.
 *
 * Key differences from the API route (B):
 * - Single browser session (not one per company)
 * - 12-25s inter-company pauses (not 4-5s)
 * - Block detection with consecutive-block abort
 * - Per-company error handling (does not abort on single failure)
 */
export async function collectLinkedInCompanyPostsFromSlugs(options: {
  companySlugs: string[];
  filterDays: number;
  maxArticles: number;
  maxPostsPerCompany?: number;
  scrollSeconds?: number;
  headless?: boolean;
  runId: string;
}): Promise<{
  runId: string;
  cleanSlugs: string[];
  articles: Article[];
  stats: PipelineStats;
  perCompany: CompanyStat[];
  createdAt: string;
}> {
  const {
    filterDays,
    maxArticles,
    maxPostsPerCompany = 30,
    scrollSeconds = 20,
    headless = false,
    runId,
  } = options;

  const cleanSlugs = cleanCompanySlugs(options.companySlugs);
  if (cleanSlugs.length === 0) {
    throw new Error("companySlugs array must contain at least one slug");
  }

  const ts = Date.now();
  const createdAt = new Date().toISOString();
  const allRaw: RawCompanyPost[] = [];
  const perCompany: CompanyStat[] = [];

  console.log(`[company-posts-core] Starting batch: ${cleanSlugs.length} companies, headless=${headless}, scroll=${scrollSeconds}s`);

  await withBrowserPage(async (page) => {
    await loadServiceCookies(page, "linkedin");
    await humanPause(1000, 2000);
    page.setDefaultNavigationTimeout(60000);

    // Session verification — fail fast if cookies are expired
    await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" });
    await humanPause(2000, 3000);
    const sessionValid = await page.evaluate(() => !document.querySelector(".join-form, .login-form"));
    if (!sessionValid) {
      throw new Error("LinkedIn session expired — re-run `npm run linkedin:login` to refresh cookies");
    }
    console.log("[company-posts-core] Session verified OK");

    let consecutiveBlocks = 0;

    for (let si = 0; si < cleanSlugs.length; si++) {
      const slug = cleanSlugs[si];

      // Inter-company pause: 12-25s randomized (first company skips)
      if (si > 0) {
        const pause = 12000 + Math.floor(Math.random() * 13000);
        console.log(`[company-posts-core] Pausing ${Math.round(pause / 1000)}s before ${slug} (${si + 1}/${cleanSlugs.length})`);
        await humanPause(pause, pause + 2000);
      }

      // Per-company error handling — single failure does not abort batch
      let result: { posts: RawCompanyPost[]; state: PageState };
      try {
        result = await scrapeCompanyPosts(page, slug, maxPostsPerCompany, scrollSeconds);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[company-posts-core] ${slug} error: ${msg}`);
        result = { posts: [], state: "ERROR" };
      }

      allRaw.push(...result.posts);

      // Keyword signal counting (same regexes as B)
      const texts = result.posts.map((p) => p.postContent);
      perCompany.push({
        slug,
        postsFound: result.posts.length,
        state: result.state,
        dockMatches: texts.filter((t) => RE_DJI_DOCK.test(t)).length,
        djiCount: texts.filter((t) => RE_DJI.test(t)).length,
        dockCount: texts.filter((t) => RE_DOCK.test(t)).length,
        diabCount: texts.filter((t) => RE_DIAB.test(t)).length,
      });

      console.log(
        `[company-posts-core] ${slug}: ${result.posts.length} posts, state=${result.state}` +
        (result.state === "OK" ? `, dji=${texts.filter((t) => RE_DJI.test(t)).length}, dock=${texts.filter((t) => RE_DOCK.test(t)).length}` : ""),
      );

      // Consecutive block detection — abort remaining if 3 in a row
      if (result.state !== "OK" && result.state !== "NOT_FOUND" && result.state !== "ERROR") {
        consecutiveBlocks++;
        if (consecutiveBlocks >= 3) {
          console.warn(`[company-posts-core] 3 consecutive blocks detected — aborting remaining ${cleanSlugs.length - si - 1} companies`);
          for (let ri = si + 1; ri < cleanSlugs.length; ri++) {
            perCompany.push({
              slug: cleanSlugs[ri],
              postsFound: 0,
              state: "SKIPPED_RATE_LIMIT",
              dockMatches: 0,
              djiCount: 0,
              dockCount: 0,
              diabCount: 0,
            });
          }
          break;
        }
      } else {
        consecutiveBlocks = 0;
      }
    }
  }, { headless });

  // ── Map raw posts to Article format ─────────────────────────────────────────

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
      source: "linkedin" as const,
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

  // ── Date filter + dedup ─────────────────────────────────────────────────────

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

  const stats: PipelineStats = {
    totalFetched: allArticles.length,
    afterDateFilter: dateFiltered.length,
    afterDedup: uniqueArticles.length,
    afterScoreFilter: uniqueArticles.length,
    stored: uniqueArticles.length,
    dedupRemoved: allArticles.length - uniqueArticles.length,
    scoreFilterRemoved: 0,
  };

  const okCount = perCompany.filter((c) => c.state === "OK").length;
  const blockCount = perCompany.filter((c) => c.state !== "OK" && c.state !== "NOT_FOUND").length;
  console.log(
    `[company-posts-core] Batch complete: ${okCount}/${cleanSlugs.length} OK, ${blockCount} blocked/errored, ${allRaw.length} total posts`,
  );

  return {
    runId,
    cleanSlugs,
    articles: uniqueArticles,
    stats,
    perCompany,
    createdAt,
  };
}
