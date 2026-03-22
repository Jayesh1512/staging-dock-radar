import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  withBrowserPage,
  loadServiceCookies,
  humanPause,
  preparePageForHumanUse,
  scrollPage,
} from "../../../lib/browser/puppeteerClient";
import type { Article, Run } from "@/lib/types";
import { insertArticles, insertRun } from "@/lib/db";
import { mapLinkedInExtractedPostsToArticles } from "@/lib/linkedin/linkedinCollectMap";
import {
  extractLinkedInArticlesFromHtmlViaLlm,
  minifyLinkedInSearchHtmlForLlm,
} from "@/lib/linkedin/linkedinSearchHtmlLlmFallback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEARCH_RESULT_CARD = "div.search-results-container div.feed-shared-update-v2";

export type LinkedInScrapePace = "standard" | "quick30s";

async function fetchLinkedInPosts(
  keyword: string,
  runId: string,
  scrollSeconds: number,
  /** Must cover scroll + navigation + human-like pauses. POST handler usually overrides this. */
  browserTimeoutMs: number = 240_000,
  /** Opening each post in a new tab is slow and often trips the overall timeout (yielding 0 articles). Default 0 = search HTML only. */
  hydrateMax: number = 0,
  /** `quick30s`: shorter pauses, capped scroll — targets ~30s per keyword (fewer posts). */
  pace: LinkedInScrapePace = "standard",
  /** When DOM extraction yields no articles, minify HTML and use LLM (requires LLM API keys). */
  llmFallbackEnabled: boolean = true,
  /** Cap posts returned by the LLM fallback (same order of magnitude as maxArticles for the run). */
  maxArticles: number = 40,
): Promise<Article[]> {
  const browserWork = withBrowserPage(async (page) => {
    const quick = pace === "quick30s";
    const pause = (base: number, jitter = 0) =>
      quick
        ? humanPause(Math.max(80, Math.floor(base * 0.22)), Math.max(0, Math.floor(jitter * 0.22)))
        : humanPause(base, jitter);

    await loadServiceCookies(page, "linkedin");
    await pause(500, 900);

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

    await pause(2000, 2500);

    // Content search is client-rendered; without this, evaluate often runs before cards exist → 0 posts.
    try {
      await page.waitForSelector(SEARCH_RESULT_CARD, { timeout: quick ? 18_000 : 50_000 });
    } catch {
      console.warn(
        "[collect-linkedin] no search result cards in time — session may be logged out or blocked",
      );
    }
    await pause(1800, 2200);

    const effectiveScrolls = quick ? Math.min(Math.max(0, scrollSeconds), 6) : Math.max(0, scrollSeconds);
    await scrollPage(page, effectiveScrolls, quick ? 450 : 1600, {
      jitterMs: quick ? 320 : 1400,
      settleMs: 0,
    });
    await pause(1400, 2600);

    // Expand truncated text (prefer known LinkedIn toggles; avoid generic "…more" links)
    await pause(500, 900);
    await page
      .$$eval(
        ".feed-shared-inline-show-more-text__see-more-less-toggle.see-more, button.see-more",
        (elements) => {
          elements.forEach((el) => (el as HTMLElement).click());
        },
      )
      .catch(() => {});
    await page.$$eval("button, span", (elements) => {
      elements.forEach((el) => {
        const t = (el.textContent?.trim().toLowerCase() || "").replace(/\u2026/g, "");
        const label = (el.getAttribute("aria-label") || "").toLowerCase();
        if (t === "see more" || label.includes("see more")) (el as HTMLElement).click();
      });
    });
    await pause(900, 1600);

    // Save the raw HTML in /data for debugging + offline parsing
    const html = await page.content();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeKeyword = keyword.replace(/[^\w-]+/g, "_").slice(0, 50) || "linkedin";
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const htmlPath = path.join(dataDir, `linkedin-search-${safeKeyword}-${timestamp}.html`);
    fs.writeFileSync(htmlPath, html, "utf8");

    // Extract posts into structured data (scope to main SERP — avoids sidebar / duplicate li+article nodes)
    const rawPosts = await page.evaluate((rootSel: string) => {
      const postNodes = document.querySelectorAll<HTMLElement>(rootSel);
      const extracted: any[] = [];

      postNodes.forEach((node) => {
        // CONTENT — commentary, optional LinkedIn-native article preview (title/subtitle)
        const textEl =
          node.querySelector<HTMLElement>('[data-test-id="feed-update-text"]') ??
          node.querySelector<HTMLElement>(".update-components-update-v2__commentary span.break-words") ??
          node.querySelector<HTMLElement>(".update-components-update-v2__commentary") ??
          node.querySelector<HTMLElement>(".feed-shared-update-v2__description .break-words") ??
          node.querySelector<HTMLElement>(".feed-shared-inline-show-more-text span.break-words") ??
          node.querySelector<HTMLElement>("span.break-words") ??
          node.querySelector<HTMLElement>("div.break-words") ??
          node.querySelector<HTMLElement>(".feed-shared-update-v2__commentary");

        let postContent = (textEl?.innerText || textEl?.textContent || "").trim();
        if (!postContent) {
          const title = node
            .querySelector<HTMLElement>(".update-components-article-first-party__title")
            ?.innerText?.trim();
          const subtitle = node
            .querySelector<HTMLElement>(".update-components-article-first-party__subtitle")
            ?.innerText?.trim();
          if (title) postContent = subtitle ? `${title} — ${subtitle}` : title;
        }
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
          // - /pulse/... (LinkedIn articles)
          const isPost =
            href.includes("/feed/update/") ||
            href.includes("urn:li:activity:") ||
            href.includes("/posts/") ||
            href.includes("/pulse/") ||
            /linkedin\.com\/pulse\//i.test(href);
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
    }, SEARCH_RESULT_CARD);

    // Hydrate: open each post permalink and extract the canonical post text (optional; slow).
    const hydrateLimit = Math.max(0, Math.min(30, hydrateMax));
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
        await pause(2200, 3800);
        const postPage = await browser.newPage();
        await preparePageForHumanUse(postPage);
        postPage.setDefaultNavigationTimeout(45000);
        await pause(400, 800);
        await postPage.goto(post.postUrl, { waitUntil: "domcontentloaded" });
        await pause(1200, 2000);

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

        await pause(300, 700);
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

    let articles: Article[] = mapLinkedInExtractedPostsToArticles(hydratedPosts, runId);

    if (
      articles.length === 0 &&
      llmFallbackEnabled &&
      process.env.LINKEDIN_LLM_HTML_FALLBACK !== "0"
    ) {
      try {
        const lean = minifyLinkedInSearchHtmlForLlm(html);
        if (lean.length > 200) {
          const recovered = await extractLinkedInArticlesFromHtmlViaLlm({
            keyword,
            runId,
            html: lean,
            maxPosts: maxArticles,
          });
          if (recovered.length > 0) articles = recovered;
        }
      } catch (e) {
        console.warn(
          "[collect-linkedin] LLM HTML fallback failed:",
          e instanceof Error ? e.message : e,
        );
      }
    }

    return articles;
  });

  // Race the browser work against a timeout — returns [] if browser exceeds the limit
  try {
    return await Promise.race([
      browserWork,
      new Promise<Article[]>((_, reject) =>
        setTimeout(() => reject(new Error(`Browser timeout after ${browserTimeoutMs}ms`)), browserTimeoutMs)
      ),
    ]);
  } catch (err) {
    const msg = (err as Error).message;
    console.warn(
      `[collect-linkedin] ${msg} for keyword "${keyword}" — returning empty (if this mentions timeout, increase browserTimeoutMs; default is now 3 minutes)`
    );
    return [];
  }
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
    const scrollSeconds: number = typeof body.scrollSeconds === "number" ? body.scrollSeconds : 25;
    const linkedin30SecScrape = body.linkedin30SecScrape === true;
    const linkedinLlmFallback = body.linkedinLlmFallback !== false;
    const hydrateMax: number = linkedin30SecScrape
      ? 0
      : typeof body.hydrateMax === "number"
        ? body.hydrateMax
        : 0;
    const pace: LinkedInScrapePace = linkedin30SecScrape ? "quick30s" : "standard";
    const browserTimeoutMs: number =
      typeof body.browserTimeoutMs === "number"
        ? body.browserTimeoutMs
        : linkedin30SecScrape
          ? 48_000
          : hydrateMax > 0
            ? Math.max(360_000, scrollSeconds * 1000 + hydrateMax * 45_000)
            : Math.max(240_000, 55_000 + scrollSeconds * 3_500);

    if (keywords.length === 0) {
      return NextResponse.json(
        { error: "keywords array or keyword string is required" },
        { status: 400 }
      );
    }

    const allArticles: Article[] = [];
    const runId = `run_li_${new Date().toISOString().replace(/[:.TZ-]/g, '').slice(0, 15)}`;

    for (let ki = 0; ki < keywords.length; ki++) {
      const k = keywords[ki];
      if (!k.trim()) continue;
      if (ki > 0) {
        await (linkedin30SecScrape ? humanPause(500, 450) : humanPause(4500, 5500));
      }
      console.log(`[/api/collect-linkedin] Fetching for keyword: ${k.trim()}`);
      const articles = await fetchLinkedInPosts(
        k.trim(),
        runId,
        scrollSeconds,
        browserTimeoutMs,
        hydrateMax,
        pace,
        linkedinLlmFallback,
        maxArticles,
      );
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


