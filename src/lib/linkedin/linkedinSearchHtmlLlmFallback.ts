import { JSDOM } from "jsdom";
import { llmComplete } from "@/lib/llm";
import {
  type LinkedInExtractedPost,
  mapLinkedInExtractedPostsToArticles,
} from "@/lib/linkedin/linkedinCollectMap";
import type { Article } from "@/lib/types";

const SYSTEM_PROMPT = `You extract LinkedIn *content search* results from HTML that was heavily minified (mostly text and links).

Rules:
- Each item is one feed update / post / shared article card — not navigation, not "Sign in", not job ads if clearly not a post.
- postContent: the full visible post text (headline + body). Join lines sensibly. Omit UI chrome like "Follow", "Subscribe", reaction counts.
- authorName: person or company name shown as the poster.
- authorUrl: absolute https://www.linkedin.com/... profile or company URL when present; else omit or empty string.
- publishedAtStr: relative time as shown (e.g. "2d •", "3w", "1mo") or short phrase; empty if unknown.
- postUrl: canonical post URL — prefer https://www.linkedin.com/feed/update/urn:li:activity:NUMBER/ or /pulse/... or /posts/... ; must be unique per post. If only a relative path, prefix https://www.linkedin.com
- Skip duplicates (same postUrl or same postContent).
- Return at most 40 posts, best / most complete first.

Output **only** valid JSON:
{"posts":[{"postContent":"string","authorName":"string","authorUrl":"string","publishedAtStr":"string","postUrl":"string"}]}

Use empty string for unknown optional fields. postContent and postUrl are required for each post you keep.`;

/**
 * Drop scripts, styles, SVGs, and almost all attributes; keep href + activity URNs.
 * Restricts to the main search results region when possible to save tokens.
 */
export function minifyLinkedInSearchHtmlForLlm(html: string, maxChars = 120_000): string {
  let dom: { window: { document: Document } };
  try {
    dom = new JSDOM(html) as { window: { document: Document } };
  } catch {
    return "";
  }
  const doc = dom.window.document;
  const root =
    doc.querySelector(".search-results-container") ??
    doc.querySelector('[data-view-name="search-entity-result-universal-template"]')?.closest("main") ??
    doc.querySelector("main") ??
    doc.body;

  if (!root) return "";

  root
    .querySelectorAll("script, style, svg, noscript, link, meta, iframe, picture, template")
    .forEach((el: Element) => el.remove());

  root.querySelectorAll("*").forEach((el: Element) => {
    const tag = el.tagName.toLowerCase();
    if (tag === "a") {
      const href = el.getAttribute("href");
      [...el.attributes].forEach((a) => el.removeAttribute(a.name));
      if (href && !href.startsWith("javascript:")) {
        el.setAttribute("href", href.length > 500 ? href.slice(0, 500) : href);
      }
      return;
    }
    const urn = el.getAttribute("data-urn") || el.getAttribute("data-entity-urn");
    [...el.attributes].forEach((a) => el.removeAttribute(a.name));
    if (urn) el.setAttribute("data-urn", urn.length > 200 ? urn.slice(0, 200) : urn);
  });

  let out = root.innerHTML.replace(/\s+/g, " ").replace(/></g, ">\n<").trim();
  if (out.length > maxChars) {
    out = `${out.slice(0, maxChars)}\n<!-- truncated -->`;
  }
  return out;
}

function normalizeLlmPosts(raw: unknown): LinkedInExtractedPost[] {
  if (!raw || typeof raw !== "object" || !("posts" in raw)) return [];
  const posts = (raw as { posts?: unknown }).posts;
  if (!Array.isArray(posts)) return [];

  const out: LinkedInExtractedPost[] = [];
  for (const p of posts) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const postContent = typeof o.postContent === "string" ? o.postContent.trim() : "";
    let postUrl = typeof o.postUrl === "string" ? o.postUrl.trim() : "";
    if (postUrl.startsWith("/")) postUrl = `https://www.linkedin.com${postUrl}`;
    if (!postContent || !postUrl) continue;

    out.push({
      postContent,
      authorName: typeof o.authorName === "string" ? o.authorName.trim() : undefined,
      authorUrl: typeof o.authorUrl === "string" ? o.authorUrl.trim() : undefined,
      publishedAtStr: typeof o.publishedAtStr === "string" ? o.publishedAtStr.trim() : undefined,
      postUrl,
    });
  }
  return out;
}

export type LlmFallbackOptions = {
  keyword: string;
  runId: string;
  /** Minified or raw HTML chunk */
  html: string;
  maxPosts?: number;
};

/**
 * When DOM selectors break, ask the LLM to recover posts from minified HTML.
 */
export async function extractLinkedInArticlesFromHtmlViaLlm(
  options: LlmFallbackOptions,
): Promise<Article[]> {
  const { keyword, runId, html, maxPosts = 40 } = options;
  if (!html.trim()) return [];

  const userPrompt = `Search keyword context: "${keyword}"

Minified HTML from the LinkedIn content search results page follows. Extract feed posts per the schema.

--- HTML START ---
${html}
--- HTML END ---`;

  const rawText = await llmComplete(SYSTEM_PROMPT, userPrompt);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    console.warn("[linkedin-llm-fallback] LLM returned non-JSON");
    return [];
  }

  let posts = normalizeLlmPosts(parsed);
  if (posts.length > maxPosts) posts = posts.slice(0, maxPosts);

  const articles = mapLinkedInExtractedPostsToArticles(posts, runId);
  console.log(`[linkedin-llm-fallback] recovered ${articles.length} article(s) for keyword "${keyword}"`);
  return articles;
}
