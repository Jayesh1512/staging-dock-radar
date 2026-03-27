import type { SerperVerifyResult } from './types';

/**
 * Run `site:domain "DJI Dock"` via Serper.
 * Returns whether the website mentions DJI Dock and matching pages.
 * Cost: 1 Serper credit.
 */
export async function runSerperVerify(
  domain: string,
  apiKey: string,
): Promise<SerperVerifyResult> {
  const query = `site:${domain} "DJI Dock"`;

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: 10 }),
    });

    if (!res.ok) {
      return { found: false, hits: 0, variant: null, best_url: null, mentions: [], error: `Serper ${res.status}` };
    }

    const data = await res.json();
    const organic: Array<{ link: string; title: string; snippet: string }> = data.organic ?? [];

    const mentions = organic.map(r => ({
      url: r.link,
      title: r.title,
      snippet: r.snippet,
    }));

    // Detect Dock variant from all text
    const allText = mentions.map(m => `${m.title} ${m.snippet}`).join(' ');
    const variants: string[] = [];
    if (/dock\s*3/i.test(allText)) variants.push('Dock 3');
    if (/dock\s*2/i.test(allText)) variants.push('Dock 2');
    if (/dock\s*1\b/i.test(allText)) variants.push('Dock 1');
    if (mentions.length > 0 && variants.length === 0) variants.push('Dock (generic)');

    // Best evidence URL: prefer URLs with "dock" in path
    const dockPathUrl = mentions.find(m => /dock/i.test(m.url));
    const best_url = dockPathUrl?.url ?? mentions[0]?.url ?? null;

    return {
      found: mentions.length > 0,
      hits: mentions.length,
      variant: variants.join(', ') || null,
      best_url,
      mentions,
      error: null,
    };
  } catch (err) {
    return {
      found: false,
      hits: 0,
      variant: null,
      best_url: null,
      mentions: [],
      error: err instanceof Error ? err.message : 'fetch failed',
    };
  }
}
