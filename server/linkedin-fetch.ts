import fs from "fs";
import path from "path";
import { withBrowserPage, loadServiceCookies, scrollPage } from "../src/lib/browser/puppeteerClient";

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

    await page.goto(searchUrl, { waitUntil: "networkidle2" });

    await scrollPage(page, 10, 1000);

    await page.$$eval('button, span', (elements) => {
      elements.forEach((el) => {
        const text = el.textContent?.trim().toLowerCase() || "";
        if (text === "see more") {
          (el as HTMLElement).click();
        }
      });
    });

    const html = await page.content();

    const tmpDir = path.join(process.cwd(), "tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
    const htmlPath = path.join(tmpDir, `linkedin-search-${Date.now()}.html`);
    fs.writeFileSync(htmlPath, html, "utf8");

    const posts: LinkedInPost[] = await page.evaluate(() => {
      const articleNodes = document.querySelectorAll<HTMLElement>("article");
      const extracted: LinkedInPost[] = [];

      articleNodes.forEach((article) => {
        const textEl =
          article.querySelector<HTMLElement>('[data-test-id="feed-update-text"], span.break-words, div.break-words');
        const postContent = textEl?.innerText?.trim() ?? "";
        if (!postContent) return;

        const authorEl =
          article.querySelector<HTMLElement>('a[href*="/in/"][data-field="actor-link"]') ??
          article.querySelector<HTMLElement>(
            "span.update-components-actor__name, span.feed-shared-actor__name"
          );
        const authorName = authorEl?.innerText?.trim() ?? null;

        const timeEl =
          article.querySelector<HTMLElement>("time") ??
          article.querySelector<HTMLElement>(
            'span.update-components-actor__sub-description span[aria-hidden="true"]'
          );
        const publishedAt = timeEl?.innerText?.trim() ?? null;

        let postUrl: string | null = null;
        const permalink =
          article.querySelector<HTMLAnchorElement>('a[href*="activity"]') ??
          article.querySelector<HTMLAnchorElement>('a[href*="/feed/update/"]');
        if (permalink?.href) {
          postUrl = permalink.href.split("?")[0];
        }

        extracted.push({
          authorName,
          postContent,
          publishedAt,
          postUrl,
        });
      });

      return extracted;
    });

    return posts;
  });
}

async function main() {
  const keyword = process.argv[2];
  if (!keyword) {
    console.error("Usage: ts-node server/linkedin-fetch.ts \"your keyword\"");
    process.exit(1);
  }

  const posts = await fetchLinkedInPosts(keyword);

  const outputPath = path.join(process.cwd(), "linkedin-posts.json");
  fs.writeFileSync(outputPath, JSON.stringify(posts, null, 2), "utf8");

  console.log(`Saved ${posts.length} posts to ${outputPath}`);
}

main().catch((err) => {
  console.error("LinkedIn fetch failed:", err);
  process.exit(1);
});

