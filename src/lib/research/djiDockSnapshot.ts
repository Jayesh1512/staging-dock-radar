import { CORE_8_REGIONS } from '@/lib/constants';
import { COUNTRY_TO_EDITION, searchGoogleNewsRss } from '@/lib/google-news-rss';

export const DJI_DOCK_SNAPSHOT_KEYWORD = 'DJI Dock';

/** Maps `CORE_8_REGIONS` labels → ScraperAPI `country_code` */
const CORE_8_TO_SCRAPERAPI_COUNTRY: Record<(typeof CORE_8_REGIONS)[number], string> = {
  US: 'us',
  UK: 'uk',
  France: 'fr',
  Australia: 'au',
  Italy: 'it',
  Singapore: 'sg',
  UAE: 'ae',
  Brazil: 'br',
};

/** Same eight markets as `CORE_8_REGIONS` (US, UK, France, Australia, Italy, Singapore, UAE, Brazil). */
export const SCRAPERAPI_COUNTRY_CODES = CORE_8_REGIONS.map((r) => CORE_8_TO_SCRAPERAPI_COUNTRY[r]);

const SCRAPER_CODE_TO_REGION_LABEL: Record<string, string> = Object.fromEntries(
  CORE_8_REGIONS.map((r) => [CORE_8_TO_SCRAPERAPI_COUNTRY[r], r]),
);

/**
 * Heuristic: count distinct LinkedIn activities in content-search HTML (`urn:li:activity:<id>`).
 * Same activity may appear multiple times in markup; IDs are deduped. Login / auth-wall pages → 0.
 */
export function countLinkedInPostsFromSearchHtml(html: string): number {
  const seen = new Set<string>();
  const re = /urn:li:activity:(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    seen.add(m[1]!);
  }
  return seen.size;
}

export type GoogleNewsSnapshotRow = {
  title: string;
  url: string;
  published_at: string | null;
  region: string;
  snippet: string | null;
};

export type LinkedInSnapshotRow = {
  country_code: string;
  /** Core-8 label (e.g. US, France) for display */
  region_label: string;
  linkedin_search_url: string;
  ok: boolean;
  error?: string;
  /** Distinct activity URNs detected in HTML (heuristic). */
  posts_detected: number;
  html_preview: string;
  total_bytes: number;
  truncated: boolean;
};

const MAX_HTML_PREVIEW_CHARS = 48_000;

async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

function linkedinContentSearchUrl(keyword: string): string {
  return `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(keyword)}&origin=GLOBAL_SEARCH_HEADER`;
}

/**
 * Phase 1: Google News RSS for the keyword across every distinct edition in `COUNTRY_TO_EDITION`,
 * last calendar day (`qdr:d1`). Deduped by normalized URL.
 */
export async function fetchAllGoogleNewsDjiDock24h(): Promise<GoogleNewsSnapshotRow[]> {
  const editionMap = new Map<string, { gl: string; ceid: string }>();
  for (const region of Object.keys(COUNTRY_TO_EDITION)) {
    const edition = COUNTRY_TO_EDITION[region];
    if (edition && !editionMap.has(edition.gl)) {
      editionMap.set(edition.gl, edition);
    }
  }
  const editions = [...editionMap.values()];

  const tasks = editions.map(
    (edition) => () => searchGoogleNewsRss(DJI_DOCK_SNAPSHOT_KEYWORD, edition, 1),
  );
  const rawBatches = await runWithConcurrency(tasks, 5);
  const flat = rawBatches.flat();

  const seen = new Set<string>();
  const rows: GoogleNewsSnapshotRow[] = [];
  for (const raw of flat) {
    if (seen.has(raw.normalized_url)) continue;
    seen.add(raw.normalized_url);
    rows.push({
      title: raw.title,
      url: raw.url,
      published_at: raw.published_at,
      region: raw.region,
      snippet: raw.snippet,
    });
  }
  return rows;
}

async function scrapeLinkedInOneCountry(
  apiKey: string,
  keyword: string,
  country_code: string,
): Promise<LinkedInSnapshotRow> {
  const targetUrl = linkedinContentSearchUrl(keyword);
  const apiUrl = new URL('http://api.scraperapi.com/');
  apiUrl.searchParams.set('api_key', apiKey);
  apiUrl.searchParams.set('url', targetUrl);
  apiUrl.searchParams.set('country_code', country_code);

  try {
    const res = await fetch(apiUrl.toString(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(120_000),
      headers: { Accept: 'text/html,*/*' },
    });
    const html = await res.text();
    const total_bytes = Buffer.byteLength(html, 'utf8');
    const posts_detected = countLinkedInPostsFromSearchHtml(html);
    const truncated = html.length > MAX_HTML_PREVIEW_CHARS;
    const html_preview = truncated
      ? `${html.slice(0, MAX_HTML_PREVIEW_CHARS)}\n\n… [truncated for display; ${total_bytes} bytes total]`
      : html;

    return {
      country_code,
      region_label: SCRAPER_CODE_TO_REGION_LABEL[country_code] ?? country_code.toUpperCase(),
      linkedin_search_url: targetUrl,
      ok: res.ok,
      error: res.ok ? undefined : `HTTP ${res.status}`,
      posts_detected,
      html_preview,
      total_bytes,
      truncated,
    };
  } catch (e) {
    return {
      country_code,
      region_label: SCRAPER_CODE_TO_REGION_LABEL[country_code] ?? country_code.toUpperCase(),
      linkedin_search_url: targetUrl,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      posts_detected: 0,
      html_preview: '',
      total_bytes: 0,
      truncated: false,
    };
  }
}

/**
 * Phase 2: LinkedIn content search HTML via ScraperAPI, one request per country code.
 * Raw HTML only — no parsing or scoring.
 */
export async function fetchLinkedInViaScraperapiAllCountries(
  apiKey: string,
  keyword: string,
): Promise<LinkedInSnapshotRow[]> {
  const codes = [...SCRAPERAPI_COUNTRY_CODES];
  const tasks = codes.map(
    (country_code) => () => scrapeLinkedInOneCountry(apiKey, keyword, country_code),
  );
  const rows = await runWithConcurrency(tasks, 4);
  const orderIndex = new Map(SCRAPERAPI_COUNTRY_CODES.map((c, i) => [c, i]));
  rows.sort((a, b) => (orderIndex.get(a.country_code) ?? 0) - (orderIndex.get(b.country_code) ?? 0));
  return rows;
}
