/**
 * Internet-wide DJI Dock QA using Serper (same intent as /api/verify-dock-mention):
 * - site:domain "DJI Dock" on the company website
 * - optional: LinkedIn company posts mentioning DJI Dock
 */

export interface DockMentionHit {
  url: string;
  title: string;
  snippet: string;
}

export interface DockQaInternetResult {
  domain: string;
  web_mentions: DockMentionHit[];
  linkedin_mentions: DockMentionHit[];
  dock_found: boolean;
  total_hits: number;
  keywords_matched: string[];
  /** Human-readable, e.g. "DJI Dock 2, DJI Dock 3" */
  dock_models_line: string | null;
  error: string | null;
}

/** Valid keywords per docs/DEVELOPMENT_GUIDE.md §9 */
export function extractDjiDockKeywordsFromText(text: string): string[] {
  const out = new Set<string>();
  const s = text;

  if (/dji\s*dock\s*3/i.test(s)) out.add('DJI Dock 3');
  if (/dji\s*dock\s*2/i.test(s)) out.add('DJI Dock 2');
  if (/dji\s*dock\s*1/i.test(s)) out.add('DJI Dock 1');
  if (/dji\s*dock\b/i.test(s)) out.add('DJI Dock');

  const dock3 = [...s.matchAll(/dock\s*3/gi)];
  for (const m of dock3) {
    const i = m.index ?? 0;
    const window = s.slice(Math.max(0, i - 30), Math.min(s.length, i + 30));
    if (/dji/i.test(window)) out.add('Dock 3');
  }
  const dock2 = [...s.matchAll(/dock\s*2/gi)];
  for (const m of dock2) {
    const i = m.index ?? 0;
    const window = s.slice(Math.max(0, i - 30), Math.min(s.length, i + 30));
    if (/dji/i.test(window)) out.add('Dock 2');
  }

  return Array.from(out);
}

export function formatDockModelsLine(keywords: string[]): string | null {
  if (keywords.length === 0) return null;
  const order = ['DJI Dock 1', 'DJI Dock 2', 'DJI Dock 3', 'DJI Dock', 'Dock 2', 'Dock 3'];
  const sorted = [...new Set(keywords)].sort(
    (a, b) => order.indexOf(a) - order.indexOf(b) || a.localeCompare(b),
  );
  return sorted.join(', ');
}

async function serperSearch(
  apiKey: string,
  q: string,
  num = 10,
): Promise<{ organic: { link: string; title: string; snippet: string }[]; error: string | null }> {
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q, num }),
    });
    if (!res.ok) {
      return { organic: [], error: `Serper HTTP ${res.status}` };
    }
    const data = (await res.json()) as { organic?: { link: string; title: string; snippet: string }[] };
    return { organic: data.organic ?? [], error: null };
  } catch (e) {
    return { organic: [], error: e instanceof Error ? e.message : 'Serper fetch failed' };
  }
}

export async function checkLinkedInDockMentions(
  linkedinUrl: string | null | undefined,
  apiKey: string,
): Promise<{ mentions: DockMentionHit[]; error: string | null }> {
  if (!linkedinUrl?.trim()) return { mentions: [], error: null };
  const match = linkedinUrl.match(/linkedin\.com\/company\/([^/?]+)/i);
  if (!match) return { mentions: [], error: null };

  const slug = match[1];
  const q = `site:linkedin.com/company/${slug} "DJI Dock"`;
  const { organic, error } = await serperSearch(apiKey, q, 5);
  if (error) return { mentions: [], error };

  const mentions: DockMentionHit[] = organic.map((r) => ({
    url: r.link,
    title: r.title,
    snippet: r.snippet,
  }));
  return { mentions, error: null };
}

/**
 * Serper: site:domain "DJI Dock" across indexed pages for that host.
 */
export async function runDockQaInternetScan(
  domain: string,
  linkedinUrl: string | null | undefined,
  apiKey: string,
): Promise<DockQaInternetResult> {
  const d = domain.trim().toLowerCase().replace(/^www\./, '');
  if (!d) {
    return {
      domain: '',
      web_mentions: [],
      linkedin_mentions: [],
      dock_found: false,
      total_hits: 0,
      keywords_matched: [],
      dock_models_line: null,
      error: 'empty domain',
    };
  }

  const q = `site:${d} "DJI Dock"`;
  const { organic, error: webErr } = await serperSearch(apiKey, q, 10);

  const webMentions: DockMentionHit[] = (organic ?? []).map((r) => ({
    url: r.link,
    title: r.title,
    snippet: r.snippet,
  }));

  const li = await checkLinkedInDockMentions(linkedinUrl, apiKey);
  const linkedinMentions = li.mentions;

  const allText = [...webMentions, ...linkedinMentions]
    .map((m) => `${m.title} ${m.snippet}`)
    .join(' ');

  const keywords_matched = extractDjiDockKeywordsFromText(allText);
  const total_hits = webMentions.length + linkedinMentions.length;
  const dock_found = total_hits > 0;

  return {
    domain: d,
    web_mentions: webMentions,
    linkedin_mentions: linkedinMentions,
    dock_found,
    total_hits,
    keywords_matched,
    dock_models_line: formatDockModelsLine(keywords_matched),
    error: webErr ?? li.error ?? null,
  };
}
