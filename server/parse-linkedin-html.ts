import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";

type LinkedInPost = {
  authorName: string | null;
  postContent: string;
  publishedAt: string | null;
  postUrl: string | null;
};

function extractPostsFromHtml(html: string): LinkedInPost[] {
  const dom = new JSDOM(html);
  const document = dom.window.document as Document;

  const articleNodes = document.querySelectorAll("article");
  const extracted: LinkedInPost[] = [];

  articleNodes.forEach((article) => {
    const textEl =
      article.querySelector('[data-test-id="feed-update-text"], span.break-words, div.break-words') as HTMLElement | null;
    const postContent = textEl?.textContent?.trim() ?? "";
    if (!postContent) return;

    const authorEl =
      (article.querySelector('a[href*="/in/"][data-field="actor-link"]') as HTMLElement | null) ??
      (article.querySelector(
        "span.update-components-actor__name, span.feed-shared-actor__name"
      ) as HTMLElement | null);
    const authorName = authorEl?.textContent?.trim() ?? null;

    const timeEl =
      (article.querySelector("time") as HTMLElement | null) ??
      (article.querySelector(
        'span.update-components-actor__sub-description span[aria-hidden="true"]'
      ) as HTMLElement | null);
    const publishedAt = timeEl?.textContent?.trim() ?? null;

    let postUrl: string | null = null;
    const permalink =
      (article.querySelector('a[href*="activity"]') as HTMLAnchorElement | null) ??
      (article.querySelector('a[href*="/feed/update/"]') as HTMLAnchorElement | null);
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
}

async function main() {
  const htmlFileArg = process.argv[2];
  if (!htmlFileArg) {
    console.error("Usage: ts-node server/parse-linkedin-html.ts data/your-file.html");
    process.exit(1);
  }

  const htmlPath = path.isAbsolute(htmlFileArg)
    ? htmlFileArg
    : path.join(process.cwd(), htmlFileArg);

  if (!fs.existsSync(htmlPath)) {
    console.error(`HTML file not found: ${htmlPath}`);
    process.exit(1);
  }

  const html = fs.readFileSync(htmlPath, "utf8");
  const posts = extractPostsFromHtml(html);

  const baseName = path.basename(htmlPath, path.extname(htmlPath));
  const outDir = path.dirname(htmlPath);
  const outPath = path.join(outDir, `${baseName}.json`);

  const payload = {
    sourceHtml: path.basename(htmlPath),
    totalFetched: posts.length,
    posts,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Parsed ${posts.length} posts into ${outPath}`);
}

main().catch((err) => {
  console.error("Parse failed:", err);
  process.exit(1);
});

