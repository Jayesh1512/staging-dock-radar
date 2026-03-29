import type { SerperVerifyResult } from './types';

/**
 * Classify evidence relevance from URL path + snippet text.
 *   direct       = product page, shop, solution, install, deploy
 *   indirect     = comparison, review, alternative, vs
 *   mention_only = blog, news, or generic mention
 */
export type EvidenceRelevance = 'direct' | 'indirect' | 'mention_only';

function classifyRelevance(url: string, snippet: string): EvidenceRelevance {
  const lUrl = url.toLowerCase();
  const lSnip = snippet.toLowerCase();

  // Direct signals: product/shop/solution pages or dock-specific URLs
  if (/\/(product|produit|shop|store|buy|solution|deploy|install|gamme|combo)/.test(lUrl)) return 'direct';
  if (/\/dji-dock|\/dock-[23]|\/matrice.*dock/.test(lUrl)) return 'direct';
  if (/\b(price|buy|order|shop|add to cart|ajouter|panier|acheter|€|\$|combo)\b/.test(lSnip)) return 'direct';

  // Indirect: comparison or review content
  if (/\b(vs\b|versus|alternative|competitor|compared|comparison|review)\b/.test(lSnip)) return 'indirect';

  return 'mention_only';
}

/**
 * Pick overall relevance from all mentions (highest wins).
 */
function bestRelevance(mentions: Array<{ url: string; snippet: string }>): EvidenceRelevance {
  let best: EvidenceRelevance = 'mention_only';
  for (const m of mentions) {
    const r = classifyRelevance(m.url, m.snippet);
    if (r === 'direct') return 'direct';
    if (r === 'indirect') best = 'indirect';
  }
  return best;
}

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
      return { found: false, hits: 0, variant: null, best_url: null, relevance: 'mention_only', mentions: [], error: `Serper ${res.status}` };
    }

    const data = await res.json();
    const organic: Array<{ link: string; title: string; snippet: string }> = data.organic ?? [];

    const mentions = organic.map(r => ({
      url: r.link,
      title: r.title,
      snippet: r.snippet,
    }));

    // Detect DJI Dock variant from all text
    // IMPORTANT: Must be DJI-specific — "Dock 3" alone could be a shipping dock.
    // We require either "DJI" nearby or "DJI Dock N" as a phrase.
    const allText = mentions.map(m => `${m.title} ${m.snippet}`).join(' ');
    const variants: string[] = [];
    // Match "DJI Dock 3", "DJI Dock-3", "Dock 3" only if "DJI" appears in same snippet
    if (/dji\s*dock\s*3|dji[^.]{0,30}dock\s*3/i.test(allText)) variants.push('Dock 3');
    if (/dji\s*dock\s*2|dji[^.]{0,30}dock\s*2/i.test(allText)) variants.push('Dock 2');
    if (/dji\s*dock\s*1\b|dji[^.]{0,30}dock\s*1\b/i.test(allText)) variants.push('Dock 1');
    // If we have hits (query was "DJI Dock") but no specific model, label as generic DJI Dock
    if (mentions.length > 0 && variants.length === 0) variants.push('DJI Dock');

    // Best evidence URL: prefer product/shop pages, then URLs with "dock" in path
    const productUrl = mentions.find(m => classifyRelevance(m.url, m.snippet) === 'direct');
    const dockPathUrl = mentions.find(m => /dock/i.test(m.url));
    const best_url = productUrl?.url ?? dockPathUrl?.url ?? mentions[0]?.url ?? null;

    // Classify overall relevance
    const relevance = bestRelevance(mentions.map(m => ({ url: m.url, snippet: m.snippet })));

    return {
      found: mentions.length > 0,
      hits: mentions.length,
      variant: variants.join(', ') || null,
      best_url,
      relevance,
      mentions,
      error: null,
    };
  } catch (err) {
    return {
      found: false,
      hits: 0,
      variant: null,
      best_url: null,
      relevance: 'mention_only',
      mentions: [],
      error: err instanceof Error ? err.message : 'fetch failed',
    };
  }
}
