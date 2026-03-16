import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  withBrowserPage,
  loadServiceCookies,
  scrollPage,
} from "../../../lib/browser/puppeteerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LinkedInPost = {
  authorName: string | null;
  postContent: string;
  publishedAt: string | null;
  postUrl: string | null;
};

async function fetchLinkedInPosts(keyword: string): Promise<LinkedInPost[]> {
  return withBrowserPage(async (page) => {
    await loadServiceCookies(page, "linkedin");

    const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(
      `"${keyword}"`
    )}&origin=GLOBAL_SEARCH_HEADER`;

    // Relax navigation timing to reduce flaky timeouts from LinkedIn
    page.setDefaultNavigationTimeout(60000);

    // 3. let the website load (be less strict than full network idle)
    try {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
    } catch (err) {
      // If DOMContentLoaded still times out, continue anyway; scrolling + extraction
      // may still work with partially loaded content.
      console.warn("[collect-linkedin] page.goto timeout, continuing with best-effort content");
    }

    // 4. scroll down for ~10–15 seconds
    await scrollPage(page, 10, 1000);

    // expand all "see more" buttons in posts
    await page.$$eval("button, span", (elements) => {
      elements.forEach((el) => {
        const text = el.textContent?.trim().toLowerCase() || "";
        if (text === "see more") {
          (el as HTMLElement).click();
        }
      });
    });

    // 5: download the entire HTML and store it in the data folder
    const html = await page.content();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeKeyword = keyword.replace(/[^\w-]+/g, "_").slice(0, 50) || "linkedin";
    const htmlFileName = `linkedin-search-${safeKeyword}-${timestamp}.html`;
    const dataDir = path.join(process.cwd(), "data");
    const htmlPath = path.join(dataDir, htmlFileName);

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(htmlPath, html, "utf8");

    // 6: work off the loaded HTML (DOM), extract posts into structured JSON
    const posts: LinkedInPost[] = await page.evaluate(() => {
      // Use broader selectors for LinkedIn posts
      const postNodes = document.querySelectorAll<HTMLElement>(
        "div.feed-shared-update-v2, li.artdeco-card, article"
      );
      const extracted: LinkedInPost[] = [];

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
        
        const publishedAt = (timeEl?.innerText || timeEl?.textContent || "").trim().split("\n")[0];

        // URL
        let postUrl: string | null = null;
        const permalink =
          node.querySelector<HTMLAnchorElement>('a[href*="activity"]') ??
          node.querySelector<HTMLAnchorElement>('a[href*="/feed/update/"]') ??
          node.querySelector<HTMLAnchorElement>(".update-components-actor__meta-link");
        
        if (permalink?.href) {
          postUrl = permalink.href.split("?")[0];
          // If absolute URL is needed and it's relative
          if (postUrl.startsWith("/")) {
            postUrl = `https://www.linkedin.com${postUrl}`;
          }
        }

        extracted.push({
          authorName: authorName || null,
          postContent,
          publishedAt: publishedAt || null,
          postUrl,
        });
      });

      return extracted;
    });

    // 7. "Delete" the HTML: nothing is persisted; we drop the string and just return JSON
    return posts;
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const keyword: string | undefined = body.keyword ?? body.keywords?.[0];

    if (!keyword || typeof keyword !== "string" || !keyword.trim()) {
      return NextResponse.json(
        { error: "keyword (string) or keywords[0] is required" },
        { status: 400 }
      );
    }

    const k = keyword.trim();
    const posts = await fetchLinkedInPosts(k);

    const stats = {
      totalFetched: posts.length,
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `linkedin-collect-${timestamp}.json`;
    const outDir = path.join(process.cwd(), "data");
    const outPath = path.join(outDir, fileName);

    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const filePayload = {
      keyword: k,
      stats,
      posts,
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(outPath, JSON.stringify(filePayload, null, 2), "utf8");

    return NextResponse.json(
      {
        keyword: k,
        count: posts.length,
        posts,
        stats,
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

