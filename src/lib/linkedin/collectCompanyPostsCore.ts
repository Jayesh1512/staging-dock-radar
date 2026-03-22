import type { Page } from "puppeteer";
import { normalizeUrl } from "@/lib/google-news-rss";
import type { Article, PipelineStats } from "@/lib/types";
import { withBrowserPage, humanPause, loadServiceCookies } from "@/lib/browser/puppeteerClient";

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

async function safeScrollPage(page: Page, seconds: number, delayMs: number, jitterMs: number): Promise<void> {
  const loops = Math.max(0, Math.floor(seconds));
  for (let i = 0; i < loops; i++) {
    try {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
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
    const extra = jitterMs > 0 ? Math.floor(Math.random() * (jitterMs + 1)) : 0;
    await new Promise((r) => setTimeout(r, delayMs + extra));
  }
}

async function fetchCompanyPosts(
  companySlug: string,
  maxPostsPerCompany: number,
  scrollSeconds: number,
): Promise<RawCompanyPost[]> {
  return withBrowserPage(async (page) => {
    await loadServiceCookies(page, "linkedin");
    await humanPause(500, 900);
    page.setDefaultNavigationTimeout(60000);

    const companyPostsUrl = `https://www.linkedin.com/company/${encodeURIComponent(companySlug)}/posts/`;
    await page.goto(companyPostsUrl, { waitUntil: "domcontentloaded" });
    await humanPause(2000, 2500);
    await safeScrollPage(page, scrollSeconds, 1600, 1400);
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
  });
}

export function cleanCompanySlugs(companySlugs: string[]): string[] {
  return companySlugs
    .map((s) => String(s || "").trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
}

/**
 * Same scraping pipeline as POST /api/collect-linkedin/company-posts — no DB writes.
 */
export async function collectLinkedInCompanyPostsFromSlugs(options: {
  companySlugs: string[];
  filterDays: number;
  maxArticles: number;
  maxPostsPerCompany?: number;
  scrollSeconds?: number;
  runId: string;
}): Promise<{
  runId: string;
  cleanSlugs: string[];
  articles: Article[];
  stats: PipelineStats;
  createdAt: string;
}> {
  const {
    filterDays,
    maxArticles,
    maxPostsPerCompany = 25,
    scrollSeconds = 35,
    runId,
  } = options;

  const cleanSlugs = cleanCompanySlugs(options.companySlugs);
  if (cleanSlugs.length === 0) {
    throw new Error("companySlugs array must contain at least one slug");
  }

  const ts = Date.now();
  const createdAt = new Date().toISOString();

  const allRaw: RawCompanyPost[] = [];
  for (let si = 0; si < cleanSlugs.length; si++) {
    const slug = cleanSlugs[si];
    if (si > 0) {
      await humanPause(4000, 5000);
    }
    const posts = await fetchCompanyPosts(slug, maxPostsPerCompany, scrollSeconds);
    allRaw.push(...posts);
  }

  const allArticles: Article[] = allRaw.map((post, i) => {
    const url = post.postUrl || "https://www.linkedin.com/";
    const normalized = post.postUrl ? normalizeUrl(post.postUrl) : `linkedin_${runId}_${ts}_${i}`.toLowerCase();
    const content = collapseWhitespace(post.postContent || "");
    const author = collapseWhitespace(post.authorName || "") || null;
    const snippet = content ? truncate(content, 1000) : null;
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

  const stats: PipelineStats = {
    totalFetched: allArticles.length,
    afterDateFilter: dateFiltered.length,
    afterDedup: uniqueArticles.length,
    afterScoreFilter: uniqueArticles.length,
    stored: uniqueArticles.length,
    dedupRemoved: allArticles.length - uniqueArticles.length,
    scoreFilterRemoved: 0,
  };

  return {
    runId,
    cleanSlugs,
    articles: uniqueArticles,
    stats,
    createdAt,
  };
}
