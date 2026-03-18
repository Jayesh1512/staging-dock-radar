import { NextRequest, NextResponse } from "next/server";
import {
  withBrowserPage,
  loadServiceCookies,
  scrollPage,
} from "../../../lib/browser/puppeteerClient";
import { insertRun, insertArticles } from "@/lib/db";
import type { Article, ArticleSource, Run } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

async function fetchLinkedInPosts(keyword: string, runId: string): Promise<Article[]> {
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

    // Scroll down for ~10–15 seconds
    await scrollPage(page, 10, 1000);

    // Expand all "see more" buttons in posts
    await page.$$eval("button, span", (elements) => {
      elements.forEach((el) => {
        const text = el.textContent?.trim().toLowerCase() || "";
        if (text === "see more") {
          (el as HTMLElement).click();
        }
      });
    });

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
        const authorEl =
          node.querySelector<HTMLElement>('a[href*="/in/"][data-field="actor-link"]') ??
          node.querySelector<HTMLElement>(".update-components-actor__name") ??
          node.querySelector<HTMLElement>(".feed-shared-actor__name") ??
          node.querySelector<HTMLElement>('.update-components-actor__title span[dir="ltr"]') ??
          node.querySelector<HTMLElement>('.app-aware-link > span[dir="ltr"]');

        const authorName = (authorEl?.innerText || authorEl?.textContent || "").trim().split("\n")[0];

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
        const permalink =
          node.querySelector<HTMLAnchorElement>('a[href*="activity"]') ??
          node.querySelector<HTMLAnchorElement>('a[href*="/feed/update/"]') ??
          node.querySelector<HTMLAnchorElement>(".update-components-actor__meta-link");

        if (permalink?.href) {
          postUrl = permalink.href.split("?")[0];
          if (postUrl.startsWith("/")) {
            postUrl = `https://www.linkedin.com${postUrl}`;
          }
        }

        extracted.push({
          authorName,
          postContent,
          publishedAtStr,
          postUrl,
        });
      });

      return extracted;
    });

    // Map to canonical Article type with parsed dates in Node.js context
    const ts = Date.now();
    const articles: Article[] = rawPosts.map((post: any, i: number) => ({
      id: `li_${runId}_${ts}_${i}`,
      run_id: runId,
      source: "linkedin",
      // Use the first ~120 chars of post content as the title so the LLM has a real signal.
      // Falls back to "LinkedIn Post" only when content is empty.
      title: post.postContent
        ? post.postContent.replace(/\s+/g, ' ').trim().slice(0, 120)
        : (post.authorName ? `${post.authorName} – LinkedIn post` : 'LinkedIn Post'),
      url: post.postUrl || `https://www.linkedin.com/search/results/content/?keywords=${runId}`,
      normalized_url: post.postUrl || `li_${runId}_${ts}_${i}`,
      snippet: post.postContent,
      publisher: post.authorName || "LinkedIn",
      published_at: parseLinkedInRelativeDate(post.publishedAtStr),
      created_at: new Date().toISOString(),
    }));

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
      const articles = await fetchLinkedInPosts(k.trim(), runId);
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
      dedup_removed: (allArticles.length - dateFiltered.length) + (dateFiltered.length - uniqueArticles.length),
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };

    let finalArticles = uniqueArticles;
    try {
      await insertRun(run);
      const { insertedCount, idMap } = await insertArticles(uniqueArticles);
      
      // ── Remap IDs to handle cross-run duplicates ──────────────────────────
      // If an article already existed in DB from a previous run, use the existing ID.
      // This is CRITICAL to avoid FK violations in scored_articles later.
      finalArticles = uniqueArticles.map(a => ({
        ...a,
        id: idMap.get(a.id) ?? a.id
      }));

      console.log(`[/api/collect-linkedin] DB: run ${runId}, ${insertedCount} new articles persisted, ${idMap.size} remapped`);
    } catch (dbErr) {
      console.error('[/api/collect-linkedin] DB write failed:', dbErr);
    }

    return NextResponse.json(
      {
        keywords: keywords,
        count: finalArticles.length,
        articles: finalArticles,
        runId,
        stats: {
          totalFetched: allArticles.length,
          afterDateFilter: dateFiltered.length,
          afterDedup: uniqueArticles.length,
          afterScoreFilter: uniqueArticles.length,
          stored: uniqueArticles.length,
          dedupRemoved: dateFiltered.length - uniqueArticles.length,
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


