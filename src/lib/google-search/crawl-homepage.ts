/**
 * Lightweight homepage crawler using jsdom.
 * Fetches a URL, extracts visible text, caps at 1000 chars.
 */

import { JSDOM } from 'jsdom';

export interface CrawlResult {
  url: string;
  ok: boolean;
  text: string;       // extracted text, up to 1000 chars
  charCount: number;
  timeMs: number;
  error?: string;
}

const TIMEOUT_MS = 8000;
const MAX_CHARS = 1000;

/**
 * Fetch a URL and extract visible text content.
 */
export async function crawlUrl(url: string): Promise<CrawlResult> {
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DockRadar/1.0)',
        'Accept': 'text/html',
        'Accept-Language': 'en,fr;q=0.9',
      },
      redirect: 'follow',
    });

    clearTimeout(timer);

    if (!res.ok) {
      return {
        url,
        ok: false,
        text: '',
        charCount: 0,
        timeMs: Date.now() - start,
        error: `HTTP ${res.status}`,
      };
    }

    const html = await res.text();
    const text = extractText(html);

    return {
      url,
      ok: true,
      text,
      charCount: text.length,
      timeMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const errorType = message.includes('abort') ? 'timeout' : message;
    return {
      url,
      ok: false,
      text: '',
      charCount: 0,
      timeMs: Date.now() - start,
      error: errorType,
    };
  }
}

/**
 * Extract visible text from HTML, stripping scripts/styles/nav/footer.
 * Returns up to MAX_CHARS characters.
 */
function extractText(html: string): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // Remove non-content elements
  const removeSelectors = ['script', 'style', 'noscript', 'nav', 'footer', 'header', 'iframe', 'svg'];
  for (const sel of removeSelectors) {
    doc.querySelectorAll(sel).forEach((el: Element) => el.remove());
  }

  // Get text from body
  const body = doc.querySelector('body');
  if (!body) return '';

  const rawText = body.textContent ?? '';

  // Clean up whitespace: collapse multiple spaces/newlines
  const cleaned = rawText
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.substring(0, MAX_CHARS);
}

/**
 * Crawl multiple URLs with concurrency control.
 */
export async function crawlUrls(
  urls: string[],
  concurrency: number = 3,
  onResult?: (result: CrawlResult, index: number, total: number) => void,
): Promise<CrawlResult[]> {
  const results: CrawlResult[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < urls.length) {
      const i = nextIndex++;
      const result = await crawlUrl(urls[i]);
      results[i] = result;
      onResult?.(result, i, urls.length);

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker());
  await Promise.all(workers);

  return results;
}
