import type { Article } from './types';

const NEWSAPI_BASE = 'https://newsapi.org/v2/everything';

/**
 * Raw article structure from NewsAPI before transformation.
 * Compatible with the Article type after mapping.
 */
export interface RawArticle {
  title: string;
  url: string;
  normalized_url: string;
  snippet: string | null;  // description field
  publisher: string | null; // source.name field
  published_at: string | null;
  source: 'newsapi';
  keyword: string;
  region?: string;
}

/** NewsAPI article object structure */
interface NewsAPIArticle {
  source: {
    id: string | null;
    name: string;
  };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
}

/** NewsAPI response structure */
interface NewsAPIResponse {
  status: string;
  totalResults: number;
  articles: NewsAPIArticle[];
}

/** Strips query params and fragments, lowercases for URL-level dedup */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname + u.pathname).toLowerCase().replace(/\/$/, '');
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Fetches articles from NewsAPI for one keyword.
 *
 * Notes:
 * - Keyword is wrapped in quotes for phrase search.
 * - Uses sortBy=publishedAt to get most recent articles first.
 * - Date filtering uses from/to parameters in ISO 8601 format.
 * - Returns up to pageSize results (max 100 per NewsAPI limits).
 * - Requires NEWSAPI_KEY environment variable.
 */
export interface DateRange {
  /** YYYY-MM-DD */
  start_date: string;
  /** YYYY-MM-DD */
  end_date: string;
}

export async function searchNewsAPI(
  keyword: string,
  filterDays: number,
  language: string = 'en',
  dateRange?: DateRange,
  pageSize: number = 100,
): Promise<RawArticle[]> {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) {
    console.warn('[newsapi] NEWSAPI_KEY environment variable not set');
    return [];
  }

  // Build query with phrase search
  const q = `"${keyword}"`;

  // Build from/to dates
  let fromDate: string | undefined;
  let toDate: string | undefined;

  if (dateRange) {
    // Campaign mode: use explicit date window
    fromDate = dateRange.start_date;
    toDate = dateRange.end_date;
  } else {
    // Regular mode: use relative days from now
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - filterDays * 86_400_000);
    fromDate = cutoffDate.toISOString().split('T')[0];
    toDate = now.toISOString().split('T')[0];
  }

  const params = new URLSearchParams({
    q,
    from: fromDate,
    to: toDate,
    language,
    sortBy: 'publishedAt',
    pageSize: Math.min(pageSize, 100).toString(),
  });

  const url = `${NEWSAPI_BASE}?${params.toString()}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'X-Api-Key': apiKey,
        'User-Agent': 'Mozilla/5.0 (compatible; DockRadar/1.0; +https://flytbase.com)',
      },
      cache: 'no-store',
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
      console.warn(`[newsapi] API error for "${keyword}":`, errorData);
      return [];
    }

    const data: NewsAPIResponse = await res.json();

    if (data.status !== 'ok') {
      console.warn(`[newsapi] API returned status "${data.status}" for "${keyword}"`);
      return [];
    }

    return transformArticles(data.articles, keyword);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[newsapi] Failed for "${keyword}": ${reason}`);
    return [];
  }
}

/**
 * Transform NewsAPI articles to RawArticle format.
 */
function transformArticles(articles: NewsAPIArticle[], keyword: string): RawArticle[] {
  return articles
    .filter((article) => article.url && article.title)
    .map((article) => ({
      title: article.title,
      url: article.url,
      normalized_url: normalizeUrl(article.url),
      snippet: article.description,
      publisher: article.source?.name || null,
      published_at: article.publishedAt || null,
      source: 'newsapi' as const,
      keyword,
    }));
}

/**
 * Maps a RawArticle to the canonical Article type, assigning a generated id.
 * This function is compatible with the one used in google-news-rss.ts.
 */
export function mapToArticle(raw: RawArticle, id: string, runId: string): Article {
  return {
    id,
    run_id: runId,
    source: raw.source,
    title: raw.title,
    url: raw.url,
    normalized_url: raw.normalized_url,
    snippet: raw.snippet,
    publisher: raw.publisher,
    published_at: raw.published_at,
    created_at: new Date().toISOString(),
  };
}
