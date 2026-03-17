import type { Article } from './types';

const GOOGLE_NEWS_RSS_BASE = 'https://news.google.com/rss/search';

/** Maps UI country names → Google News edition parameters */
export const COUNTRY_TO_EDITION: Record<string, { gl: string; ceid: string }> = {
  US:             { gl: 'US', ceid: 'US:en' },
  Canada:         { gl: 'CA', ceid: 'CA:en' },
  Brazil:         { gl: 'BR', ceid: 'BR:en' },
  Mexico:         { gl: 'MX', ceid: 'MX:en' },
  UK:             { gl: 'GB', ceid: 'GB:en' },
  Germany:        { gl: 'DE', ceid: 'DE:en' },
  France:         { gl: 'FR', ceid: 'FR:en' },
  Italy:          { gl: 'IT', ceid: 'IT:en' },
  India:          { gl: 'IN', ceid: 'IN:en' },
  Singapore:      { gl: 'SG', ceid: 'SG:en' },
  Japan:          { gl: 'JP', ceid: 'JP:en' },
  Australia:      { gl: 'AU', ceid: 'AU:en' },
  'South Korea':  { gl: 'KR', ceid: 'KR:en' },
  UAE:            { gl: 'AE', ceid: 'AE:en' },
  'Saudi Arabia': { gl: 'SA', ceid: 'SA:en' },
  'South Africa': { gl: 'ZA', ceid: 'ZA:en' },
};

/** Raw article as fetched from Google News RSS before transformation */
export interface RawArticle {
  title: string;
  url: string;
  normalized_url: string;
  snippet: string | null;
  publisher: string | null;
  published_at: string | null;
  source: 'google_news';
  /** Which keyword search produced this article — used for cross-keyword dedup */
  keyword: string;
  /** Google News gl code this article came from */
  region: string;
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

/** Extract text content of an XML tag, handling CDATA and plain text */
function extractXmlTag(xml: string, tag: string): string | null {
  // CDATA variant: <tag><![CDATA[content]]></tag>
  const cdataMatch = xml.match(
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'),
  );
  if (cdataMatch) return cdataMatch[1].trim();

  // Plain text variant: <tag>content</tag> (URL-safe chars only — for <link>)
  const plainMatch = xml.match(
    new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i'),
  );
  return plainMatch ? plainMatch[1].trim() : null;
}

/** Parse RSS pubDate ("Sun, 15 Mar 2026 10:00:00 GMT") to ISO 8601 */
function parseRssDate(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Parse RSS XML string into RawArticle array */
function parseRssItems(xml: string, keyword: string, region: string): RawArticle[] {
  const items: RawArticle[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const title = extractXmlTag(itemXml, 'title') ?? '';
    const link = extractXmlTag(itemXml, 'link') ?? '';
    const pubDate = extractXmlTag(itemXml, 'pubDate');
    const publisher = extractXmlTag(itemXml, 'source');

    if (!title || !link) continue;

    items.push({
      title,
      url: link,
      normalized_url: normalizeUrl(link),
      snippet: null, // Google News RSS descriptions are HTML fragments — skipped for now
      publisher,
      published_at: parseRssDate(pubDate),
      source: 'google_news',
      keyword,
      region,
    });
  }

  return items;
}

/**
 * Fetches Google News RSS for one keyword + region edition.
 *
 * Notes:
 * - Keyword is wrapped in quotes for phrase search.
 * - tbs=qdr:dN is the primary date filter (same as Google News web UI).
 *   A secondary safety-net date filter is applied in the API route.
 * - Google News RSS returns ~10-20 items per request (no num param).
 * - No API key required.
 */
/** Optional absolute date range for historical campaign searches */
export interface DateRange {
  /** YYYY-MM-DD */
  start_date: string;
  /** YYYY-MM-DD */
  end_date: string;
}

export async function searchGoogleNewsRss(
  keyword: string,
  edition: { gl: string; ceid: string },
  filterDays: number,
  dateRange?: DateRange,
): Promise<RawArticle[]> {
  // Campaign mode: use after:/before: operators in query for historical windows
  // Regular mode: use tbs=qdr:dN for relative "last N days" filter
  const q = dateRange
    ? `"${keyword}" after:${dateRange.start_date} before:${dateRange.end_date}`
    : `"${keyword}"`;

  const params = new URLSearchParams({
    q,
    hl: 'en',
    gl: edition.gl,
    ceid: edition.ceid,
    ...(dateRange ? {} : { tbs: `qdr:d${filterDays}` }),
  });

  const url = `${GOOGLE_NEWS_RSS_BASE}?${params.toString()}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DockRadar/1.0; +https://flytbase.com)',
        Accept: 'application/rss+xml, text/xml, */*',
      },
      cache: 'no-store',
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[google-news-rss] HTTP ${res.status} for "${keyword}" (${edition.gl})`);
      return [];
    }

    const xml = await res.text();
    return parseRssItems(xml, keyword, edition.gl);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[google-news-rss] Failed for "${keyword}" (${edition.gl}): ${reason}`);
    return [];
  }
}

/** Maps a RawArticle to the canonical Article type, assigning a generated id */
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
