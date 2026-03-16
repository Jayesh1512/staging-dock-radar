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
  const { document } = dom.window;

  const articleNodes = document.querySelectorAll<HTMLElement>("article");
  const extracted: LinkedInPost[] = [];

  articleNodes.forEach((article) => {
    const textEl =
      article.querySelector<HTMLElement>('[data-test-id="feed-update-text"], span.break-words, div.break-words');
    const postContent = textEl?.textContent?.trim() ?? "";
    if (!postContent) return;

    const authorEl =
      article.querySelector<HTMLElement>('a[href*="/in/"][data-field="actor-link"]') ??
      article.querySelector<HTMLElement>(
        "span.update-components-actor__name, span.feed-shared-actor__name"
      );
    const authorName = authorEl?.textContent?.trim() ?? null;

    const timeEl =
      article.querySelector<HTMLElement>("time") ??
      article.querySelector<HTMLElement>(
        'span.update-components-actor__sub-description span[aria-hidden="true"]'
      );
    const publishedAt = timeEl?.textContent?.trim() ?? null;

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

