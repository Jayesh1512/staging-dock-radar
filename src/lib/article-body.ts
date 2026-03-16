/**
 * URL resolution and article body fetching.
 *
 * resolveUrl() is source-aware:
 *   - news_api / trade_rss / community_forum  → direct URLs, no resolution needed
 *   - google_news                             → CBMi base64 decode (Strategy A), then HTTP fallback
 *   - alert_rss                               → extract from ?q= param (Strategy B), then HTTP fallback
 *   - linkedin / facebook / unknown           → HTTP redirect fallback only (Strategy C)
 *
 * fetchArticleBody() calls resolveUrl() then fetches body text for LLM scoring.
 */

import type { ArticleSource } from './types';

// ─── Helpers ───────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractOgUrl(html: string): string | null {
  const match =
    html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i);
  return match?.[1] ?? null;
}

export function extractOgImage(html: string): string | null {
  const match =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  return match?.[1] ?? null;
}

/** Domains that indicate a URL is still a wrapper and needs further resolution */
const WRAPPER_DOMAINS = ['news.google.com', 'google.com/url'];

function isWrapperUrl(url: string): boolean {
  return WRAPPER_DOMAINS.some((d) => url.includes(d));
}

// ─── Strategy A: Google News CBMi base64 decode ────────────────────────────

/**
 * Decodes a Google News RSS URL to the real article URL.
 * Google News encodes the article URL in a base64 protobuf path segment (CBMi...).
 * No HTTP request needed — pure decoding.
 */
export function decodeGoogleNewsUrl(url: string): string | null {
  try {
    const match = url.match(/news\.google\.com(?:\/rss)?\/articles\/(CBMi[^?#&\s]+)/);
    if (!match) return null;

    let encoded = match[1];
    encoded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = encoded + '=='.slice((encoded.length + 2) % 4);
    const bytes = Buffer.from(padded, 'base64');

    // Search for https:// or http:// in the decoded bytes
    for (const prefix of ['https://', 'http://']) {
      const marker = Buffer.from(prefix);
      const pos = bytes.indexOf(marker);
      if (pos === -1) continue;

      let end = bytes.length;
      for (let i = pos; i < bytes.length; i++) {
        const b = bytes[i];
        if (b === 0 || b < 0x20) { end = i; break; }
      }

      const decoded = bytes.slice(pos, end).toString('utf-8');
      new URL(decoded); // throws if invalid
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Core: source-aware URL resolution ────────────────────────────────────

/**
 * Resolves a wrapper/redirect URL to the real article URL.
 * Returns the original URL unchanged if resolution fails or isn't needed.
 */
export async function resolveUrl(url: string, source?: ArticleSource): Promise<string> {
  // Sources that always return direct article URLs — no resolution needed
  if (
    source === 'news_api' ||
    source === 'trade_rss' ||
    source === 'community_forum'
  ) {
    return url;
  }

  // Strategy A: Google News CBMi base64 decode (zero network, most reliable)
  if (source === 'google_news' || url.includes('news.google.com')) {
    const decoded = decodeGoogleNewsUrl(url);
    if (decoded) return decoded;
    // Decode failed — fall through to HTTP strategies
  }

  // Strategy B: Google Alerts / redirect wrapper — extract URL from ?q= query param
  // Google Alerts wraps links as: https://www.google.com/url?q=ACTUAL_URL&...
  if (source === 'alert_rss' || url.includes('google.com/url')) {
    try {
      const q = new URL(url).searchParams.get('q');
      if (q && q.startsWith('http') && !isWrapperUrl(q)) return q;
    } catch { /* malformed URL — fall through */ }
  }

  // Strategy C: HTTP redirect follow + og:url + HTML href parsing
  // Use a real browser UA — Googlebot causes Google to serve its SPA instead of redirecting
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    clearTimeout(timeout);

    if (!res.ok) return url;

    // C1: HTTP redirect resolved to a non-wrapper URL
    if (res.url && res.url !== url && !isWrapperUrl(res.url)) return res.url;

    // C2: og:url meta tag in HTML
    const html = await res.text();
    const ogUrl = extractOgUrl(html);
    if (ogUrl && !isWrapperUrl(ogUrl)) return ogUrl;

    // C3: First non-Google article href found in the HTML
    // Google News pages embed the real article URL in an <a href="..."> element
    const hrefMatch = html.match(
      /href="(https?:\/\/(?!(?:www\.)?google\.[a-z])[^"]{20,})"/,
    );
    if (hrefMatch?.[1] && !isWrapperUrl(hrefMatch[1])) return hrefMatch[1];
  } catch {
    // Timeout or network error — return original
  }

  return url;
}

// ─── fetchArticleBody ──────────────────────────────────────────────────────

/**
 * Resolves the article URL and fetches body text for LLM use.
 * @param maxWords - Word limit for the returned text. Default 500 for scoring.
 *                   Pass undefined to fetch the full article (used by enrichment).
 */
export async function fetchArticleBody(
  url: string,
  source?: ArticleSource,
  maxWords = 500,
): Promise<{ text: string; resolvedUrl: string }> {
  // Step 1: Resolve the URL (source-aware)
  const resolvedUrl = await resolveUrl(url, source);

  // Step 2: Fetch body text from the resolved URL
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(resolvedUrl, {
      signal: controller.signal,
      headers: {
        // Googlebot UA — most news sites serve full content to Googlebot
        'User-Agent':
          'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    clearTimeout(timeout);

    if (!res.ok) return { text: '', resolvedUrl };

    const html = await res.text();
    const words = stripHtml(html).split(/\s+/);
    const text = maxWords ? words.slice(0, maxWords).join(' ') : words.join(' ');
    return { text, resolvedUrl };
  } catch {
    return { text: '', resolvedUrl };
  }
}
