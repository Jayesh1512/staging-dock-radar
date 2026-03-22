import type { Article } from './types';

/**
 * Raw article structure from NewsAPI before transformation.
 * Kept for `mapToArticle` and legacy rows with `source: 'newsapi'`.
 */
export interface RawArticle {
  title: string;
  url: string;
  normalized_url: string;
  snippet: string | null;
  publisher: string | null;
  published_at: string | null;
  source: 'newsapi';
  keyword: string;
  region?: string;
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

export interface DateRange {
  start_date: string;
  end_date: string;
}

/**
 * NewsAPI is not used; `NEWSAPI_KEY` is ignored. Returns no articles.
 */
export async function searchNewsAPI(
  keyword: string,
  filterDays: number,
  language?: string,
  dateRange?: DateRange,
  pageSize?: number,
): Promise<RawArticle[]> {
  void keyword;
  void filterDays;
  void language;
  void dateRange;
  void pageSize;
  return [];
}

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
