/**
 * Fetches the first 500 words of an article's body content and resolves
 * the canonical URL (real article URL after any redirects).
 *
 * resolvedUrl resolution strategy:
 *   1. res.url after redirect:follow — works for most direct article URLs
 *   2. og:url meta tag — fallback for Google News pages (served to Googlebot)
 *      which may embed the real article URL in Open Graph metadata
 *   3. Falls back to the original URL if both fail
 *
 * Falls back to empty string + original URL on timeout, paywall, or any error.
 */

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

export async function fetchArticleBody(url: string): Promise<{ text: string; resolvedUrl: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Googlebot UA — most news sites serve full content to Googlebot
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    clearTimeout(timeout);

    if (!res.ok) return { text: '', resolvedUrl: url };

    const html = await res.text();
    const text = stripHtml(html).split(/\s+/).slice(0, 500).join(' ');

    // Strategy 1: HTTP redirect resolved to a non-Google URL
    let resolvedUrl = res.url || url;
    if (!resolvedUrl.includes('news.google.com')) {
      return { text, resolvedUrl };
    }

    // Strategy 2: Still on Google News — try og:url from page HTML
    const ogUrl = extractOgUrl(html);
    if (ogUrl && !ogUrl.includes('news.google.com')) {
      return { text, resolvedUrl: ogUrl };
    }

    return { text, resolvedUrl: url };
  } catch {
    return { text: '', resolvedUrl: url };
  }
}
