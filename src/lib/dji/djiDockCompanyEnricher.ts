import { searchGoogle, type SerperResult } from '@/lib/google-search/serper';
import { crawlUrl } from '@/lib/google-search/crawl-homepage';
import { normalizeCompanyName } from '@/lib/company-normalize';
import { requireSupabase } from '@/lib/supabase';
import { JSDOM } from 'jsdom';

type EnricherCountryInput = string;

const ISO_2_TO_CANONICAL_COUNTRY: Record<string, string> = {
  FR: 'France',
  DE: 'Germany',
  UK: 'UK',
  AU: 'Australia',
  US: 'US',
  IN: 'India',
  AE: 'UAE',
  SA: 'Saudi Arabia',
  NL: 'Netherlands',
  IT: 'Italy',
  ES: 'Spain',
  SG: 'Singapore',
  JP: 'Japan',
  KR: 'South Korea',
  BR: 'Brazil',
};

const CANONICAL_COUNTRY_TO_ISO_2: Record<string, string> = Object.fromEntries(
  Object.entries(ISO_2_TO_CANONICAL_COUNTRY).map(([iso2, canonical]) => [canonical, iso2]),
) as Record<string, string>;

function isLikelyIso2Country(input: string): boolean {
  return /^[A-Za-z]{2}$/.test(input.trim());
}

function inferCanonicalCountryName(companyCountry: EnricherCountryInput): string {
  const raw = (companyCountry ?? '').trim();
  if (!raw) return '';

  if (isLikelyIso2Country(raw)) {
    return ISO_2_TO_CANONICAL_COUNTRY[raw.toUpperCase()] ?? raw.toUpperCase();
  }

  // Prefer the canonical display name used elsewhere in Dock Radar.
  // If the user provides "United Kingdom" / "South Korea" etc, we keep the value as-is.
  return raw;
}

function inferSerperCountryCode(companyCountry: EnricherCountryInput): string {
  const raw = (companyCountry ?? '').trim();
  if (!raw) return 'US';

  if (isLikelyIso2Country(raw)) return raw.toUpperCase();

  const canonical = inferCanonicalCountryName(raw);
  return CANONICAL_COUNTRY_TO_ISO_2[canonical] ?? raw.slice(0, 2).toUpperCase();
}

function ensureHttpUrl(url: string): string {
  const raw = (url ?? '').trim();
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

// Strict regex (no LLM): match "DJI Dock", "DJI-Dock 2", etc.
// Note: we only rely on what `crawlUrl` extracts (body text, trimmed).
const DJI_DOCK_REGEX = /dji\s*[-\s]*dock(?:\s*[23])?/i;

function mentionsDjiDock(text: string): { hit: boolean; match: string | null } {
  const m = text.match(DJI_DOCK_REGEX);
  return { hit: Boolean(m), match: m?.[0] ?? null };
}

function countDjiDockMatches(text: string): number {
  if (!text) return 0;
  const matches = text.match(/dji\s*[-\s]*dock(?:\s*[23])?/gi);
  return matches?.length ?? 0;
}

function rootHomepageUrl(url: string): string | null {
  try {
    const u = new URL(ensureHttpUrl(url));
    return `${u.origin}/`;
  } catch {
    return null;
  }
}

const HTML_TIMEOUT_MS = 9000;
async function fetchHtml(url: string): Promise<{ ok: true; url: string; html: string } | { ok: false; url: string; error: string }> {
  const u = ensureHttpUrl(url);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTML_TIMEOUT_MS);
    const res = await fetch(u, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DockRadar/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en,fr;q=0.9',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, url: u, error: `HTTP ${res.status}` };
    const html = await res.text();
    return { ok: true, url: u, html };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const errorType = message.includes('abort') ? 'timeout' : message;
    return { ok: false, url: u, error: errorType };
  }
}

function extractLinkedInCompanyUrlFromHtml(html: string, baseUrl: string): string | null {
  try {
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const anchors = Array.from(doc.querySelectorAll('a[href]')) as HTMLAnchorElement[];

    const candidates: string[] = [];
    for (const a of anchors) {
      const href = (a.getAttribute('href') ?? '').trim();
      if (!href) continue;

      let abs: string;
      try {
        abs = new URL(href, baseUrl).toString();
      } catch {
        continue;
      }

      // Company profile patterns.
      if (!/https?:\/\/([a-z]{2,3}\.)?linkedin\.com\//i.test(abs)) continue;
      if (/linkedin\.com\/company\//i.test(abs) || /linkedin\.com\/showcase\//i.test(abs)) {
        candidates.push(abs);
      }
    }

    if (candidates.length === 0) return null;

    // Prefer canonical company URLs (shortest path, no query).
    const normalized = candidates.map((u) => {
      try {
        const url = new URL(u);
        url.hash = '';
        // keep path, drop tracking queries
        url.search = '';
        return url.toString();
      } catch {
        return u;
      }
    });

    normalized.sort((a, b) => a.length - b.length);
    return normalized[0];
  } catch {
    return null;
  }
}

function extractTopSnippetAroundMatch(text: string, match: string | null): string | null {
  if (!match) return null;
  const idx = text.search(DJI_DOCK_REGEX);
  if (idx < 0) return null;
  const radius = 120;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + radius);
  return text.substring(start, end);
}

function unionArray<T>(a: T[] | null | undefined, b: T[]): T[] {
  const set = new Set<T>([...(a ?? []), ...(b ?? [])]);
  return Array.from(set);
}

function pickWebsiteCandidate(rootUrl: string | null, topUrl: string): string {
  return rootUrl ?? topUrl;
}

export interface EnrichDjiDockCompanyInput {
  companyName: string;
  companyCountry: string; // Prefer ISO-2 (FR/DE/UK...) but we also accept canonical names
  pages?: number; // keep default small
  /** When false, skip writes to discovered_companies (enrichment + QA can use multi_sources only). Default true. */
  persistToDiscovered?: boolean;
}

export interface EnrichDjiDockCompanyResult {
  companyName: string;
  companyCountryInput: string;
  normalizedCompanyName: string;
  canonicalCountryName: string;

  serperQuery: string;
  serperCountryCode: string;
  topResult: { title: string; link: string; snippet: string; position: number } | null;

  crawledTop: { ok: boolean; url: string; charCount: number; timeMs: number } | null;
  crawledRoot: { ok: boolean; url: string; charCount: number; timeMs: number } | null;
  djiDockRegex: {
    top: { hit: boolean; count: number; match: string | null; snippet: string | null };
    root: { hit: boolean; count: number; match: string | null; snippet: string | null };
    anyHit: boolean;
  };
  linkedin: { found: string | null; source: 'top' | 'root' | null };

  /** Best-effort company site: root homepage from top SERP URL, else the top result URL */
  websiteCandidate: string | null;

  storedToDiscoveredCompany: boolean;
  discoveredCompany?: {
    normalized_name: string;
    display_name: string;
    website: string | null;
    countries: string[];
    signal_types: string[];
    mention_count: number;
    linkedin: string | null;
  };
}

export async function enrichDjiDockCompanyFromSerperRegex(
  input: EnrichDjiDockCompanyInput,
  serperApiKey: string,
): Promise<EnrichDjiDockCompanyResult> {
  const companyName = (input.companyName ?? '').trim();
  const companyCountryInput = (input.companyCountry ?? '').trim();
  const pages = Math.max(1, Math.min(3, input.pages ?? 1));
  const persistToDiscovered = input.persistToDiscovered !== false;

  if (!companyName) throw new Error('companyName is required');
  if (!companyCountryInput) throw new Error('companyCountry is required');
  if (!serperApiKey) throw new Error('SERPER_API_KEY is required');

  const normalizedCompanyName = normalizeCompanyName(companyName);
  if (!normalizedCompanyName) throw new Error('Could not normalize companyName');

  const canonicalCountryName = inferCanonicalCountryName(companyCountryInput);
  const serperCountryCode = inferSerperCountryCode(companyCountryInput);

  const serperQuery = `${companyName} ${companyCountryInput} drone`;

  const searchResults = await searchGoogle(
    {
      keyword: serperQuery,
      country: serperCountryCode,
      pages,
      // Broad match: exact phrase on "name + country + drone" almost never appears verbatim on the web.
      exactPhrase: false,
    },
    serperApiKey,
  );

  const top: SerperResult | undefined = searchResults[0];
  const topResult = top
    ? { title: top.title, link: top.link, snippet: top.snippet, position: top.position }
    : null;

  if (!topResult) {
    return {
      companyName,
      companyCountryInput,
      normalizedCompanyName,
      canonicalCountryName,
      serperQuery,
      serperCountryCode,
      topResult: null,
      crawledTop: null,
      crawledRoot: null,
      djiDockRegex: {
        top: { hit: false, count: 0, match: null, snippet: null },
        root: { hit: false, count: 0, match: null, snippet: null },
        anyHit: false,
      },
      linkedin: { found: null, source: null },
      websiteCandidate: null,
      storedToDiscoveredCompany: false,
    };
  }

  const topUrl = ensureHttpUrl(topResult.link);
  const rootUrl = rootHomepageUrl(topUrl);

  const [crawlTop, crawlRoot] = await Promise.all([
    crawlUrl(topUrl),
    rootUrl ? crawlUrl(rootUrl) : Promise.resolve(null),
  ]);

  const [htmlTop, htmlRoot] = await Promise.all([
    fetchHtml(topUrl),
    rootUrl ? fetchHtml(rootUrl) : Promise.resolve(null),
  ]);

  const linkedinFromTop = htmlTop.ok ? extractLinkedInCompanyUrlFromHtml(htmlTop.html, htmlTop.url) : null;
  const linkedinFromRoot = htmlRoot && htmlRoot.ok ? extractLinkedInCompanyUrlFromHtml(htmlRoot.html, htmlRoot.url) : null;
  const linkedinFound = linkedinFromRoot ?? linkedinFromTop ?? null;
  const linkedinSource: 'top' | 'root' | null = linkedinFound
    ? (linkedinFromRoot ? 'root' : 'top')
    : null;

  const topText = crawlTop.ok ? crawlTop.text ?? '' : '';
  const rootText = crawlRoot && crawlRoot.ok ? crawlRoot.text ?? '' : '';

  const topMatch = mentionsDjiDock(topText);
  const rootMatch = mentionsDjiDock(rootText);

  const topCount = countDjiDockMatches(topText);
  const rootCount = countDjiDockMatches(rootText);

  const topSnippet = topMatch.hit ? extractTopSnippetAroundMatch(topText, topMatch.match) : null;
  const rootSnippet = rootMatch.hit ? extractTopSnippetAroundMatch(rootText, rootMatch.match) : null;

  const crawledTop = crawlTop.ok
    ? { ok: true, url: topUrl, charCount: crawlTop.charCount, timeMs: crawlTop.timeMs }
    : { ok: false, url: topUrl, charCount: crawlTop.charCount, timeMs: crawlTop.timeMs };

  const crawledRoot = crawlRoot
    ? (crawlRoot.ok
      ? { ok: true, url: rootUrl!, charCount: crawlRoot.charCount, timeMs: crawlRoot.timeMs }
      : { ok: false, url: rootUrl!, charCount: crawlRoot.charCount, timeMs: crawlRoot.timeMs })
    : null;

  const anyHit = topMatch.hit || rootMatch.hit;
  if (!anyHit) {
    return {
      companyName,
      companyCountryInput,
      normalizedCompanyName,
      canonicalCountryName,
      serperQuery,
      serperCountryCode,
      topResult,
      crawledTop,
      crawledRoot,
      djiDockRegex: {
        top: { hit: false, count: topCount, match: null, snippet: null },
        root: { hit: false, count: rootCount, match: null, snippet: null },
        anyHit: false,
      },
      linkedin: { found: linkedinFound, source: linkedinSource },
      websiteCandidate: pickWebsiteCandidate(rootUrl, topUrl),
      storedToDiscoveredCompany: false,
    };
  }

  if (!persistToDiscovered) {
    return {
      companyName,
      companyCountryInput,
      normalizedCompanyName,
      canonicalCountryName,
      serperQuery,
      serperCountryCode,
      topResult,
      crawledTop,
      crawledRoot,
      djiDockRegex: {
        top: { hit: topMatch.hit, count: topCount, match: topMatch.match, snippet: topSnippet },
        root: { hit: rootMatch.hit, count: rootCount, match: rootMatch.match, snippet: rootSnippet },
        anyHit: true,
      },
      linkedin: { found: linkedinFound, source: linkedinSource },
      websiteCandidate: pickWebsiteCandidate(rootUrl, topUrl),
      storedToDiscoveredCompany: false,
    };
  }

  // ── No longer writing to discovered_companies ──
  // All persistence goes through upsertMultiSourcesFromDockHunter → multi_sources_companies_import
  // The enrichment data (website, linkedin, dock signals) is passed back to the caller
  // which handles the upsert into the master table.

  return {
    companyName,
    companyCountryInput,
    normalizedCompanyName,
    canonicalCountryName,
    serperQuery,
    serperCountryCode,
    topResult,
    crawledTop,
    crawledRoot,
    djiDockRegex: {
      top: { hit: topMatch.hit, count: topCount, match: topMatch.match, snippet: topSnippet },
      root: { hit: rootMatch.hit, count: rootCount, match: rootMatch.match, snippet: rootSnippet },
      anyHit: true,
    },
    linkedin: { found: linkedinFound, source: linkedinSource },
    websiteCandidate: pickWebsiteCandidate(rootUrl, topUrl),
    storedToDiscoveredCompany: false,
    discoveredCompany: undefined,
  };
}

