import type { Article } from "@/lib/types";
import { normalizeUrl } from "@/lib/google-news-rss";

/** Shape produced by DOM scraping or LLM HTML fallback */
export type LinkedInExtractedPost = {
  authorName?: string;
  authorUrl?: string;
  postContent?: string;
  publishedAtStr?: string;
  postUrl?: string;
};

function collapseWhitespace(s: string): string {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function truncate(s: string, max: number): string {
  const str = String(s || "");
  return str.length <= max ? str : str.slice(0, max);
}

export function parseLinkedInRelativeDate(timeStr: string): string {
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

export function mapLinkedInExtractedPostsToArticles(
  posts: LinkedInExtractedPost[],
  runId: string,
): Article[] {
  const ts = Date.now();
  const createdAt = new Date().toISOString();

  return posts
    .map((post, i) => {
      const url: string = post.postUrl || "";
      const normalized = url ? normalizeUrl(url) : `linkedin_${runId}_${ts}_${i}`.toLowerCase();
      const content = collapseWhitespace(post.postContent || "");
      const author = collapseWhitespace(post.authorName || "") || null;
      const publisherUrl: string | undefined = post.authorUrl ? String(post.authorUrl) : undefined;
      const snippet = content ? truncate(content, 1000) : null;
      const title = content
        ? truncate(content, 140)
        : author
          ? `${author} – LinkedIn post`
          : "LinkedIn Post";

      return {
        id: `li_${runId}_${ts}_${i}`,
        run_id: runId,
        source: "linkedin" as const,
        title,
        url: url || "https://www.linkedin.com/",
        publisher_url: publisherUrl,
        normalized_url: normalized,
        snippet,
        publisher: author ?? "LinkedIn",
        published_at: parseLinkedInRelativeDate(post.publishedAtStr || ""),
        created_at: createdAt,
      };
    })
    .filter((a) => !!a.url && !!a.normalized_url && !!a.snippet);
}
