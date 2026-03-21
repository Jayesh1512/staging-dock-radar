import fs from 'fs';
import path from 'path';
import { withBrowserPage } from '@/lib/browser/puppeteerClient';

export type DjiVendorKind =
  | 'retail_store'
  | 'authorized_dealer'
  | 'enterprise_dealer'
  | 'agriculture_dealer'
  | 'professional_dealer'
  | 'delivery_dealer';

export type DjiVendor = {
  kind: DjiVendorKind;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceContinent: string | null;
  sourceRegionCode: string | null;
};

export type DjiScrapeOptions = {
  mode: 'sample' | 'all';
  maxCountriesPerContinent?: number;
  includeKinds?: DjiVendorKind[];
};

function resolveRepoRoot(): string {
  const cwdRoot = process.cwd();
  const cwdCandidate = path.join(cwdRoot, 'data', 'dji-where-to-buy-country-codes.json');
  if (fs.existsSync(cwdCandidate)) return cwdRoot;

  // File: <repoRoot>/src/lib/dji/whereToBuyScraper.ts
  const dirnameRoot = path.resolve(__dirname, '../../..');
  const dirnameCandidate = path.join(dirnameRoot, 'data', 'dji-where-to-buy-country-codes.json');
  if (fs.existsSync(dirnameCandidate)) return dirnameRoot;

  // Last resort: use cwd so relative paths still behave.
  return cwdRoot;
}

const REPO_ROOT = resolveRepoRoot();
const DATA_DIR = path.join(REPO_ROOT, 'data');
const COUNTRY_CODES_FILE = path.join(DATA_DIR, 'dji-where-to-buy-country-codes.json');

// Asia selection from the DJI UI dropdown is flaky under Puppeteer in this environment,
// so we seed Asia with a practical default set. You can expand it by re-running with your own country list
// (UI currently does "dropdown-derived" for non-Asia continents, and this list for Asia).
const DEFAULT_ASIA_REGION_CODES = [
  'CN',
  'HK',
  'MO',
  'TW',
  'IN',
  'JP',
  'KR',
  'SG',
  'MY',
  'TH',
  'ID',
  'PH',
  'VN',
  'BN',
  'LK',
  'PK',
  'BD',
  'AE',
  'SA',
  'TR',
];

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length ? s : null;
}

function asNullableNumber(v: unknown): number | null {
  if (typeof v !== 'number') return null;
  if (!Number.isFinite(v)) return null;
  return v;
}

function toCoordsPair(googleCoord: unknown): { latitude: number | null; longitude: number | null } {
  if (!Array.isArray(googleCoord) || googleCoord.length < 2) return { latitude: null, longitude: null };
  const lat = asNullableNumber(googleCoord[0]);
  const lon = asNullableNumber(googleCoord[1]);
  return { latitude: lat, longitude: lon };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson<T>(url: string, retries = 4): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'DockRadar/1.0 (dji-where-to-buy-scraper)',
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        const status = res.status;
        // DJI frequently rate-limits scrapers; retry with backoff for common transient codes.
        if (status === 403 || status === 429 || status === 500 || status === 502 || status === 503) {
          lastErr = new Error(`DJI API HTTP ${status} (attempt ${attempt + 1}/${retries + 1}) for ${url}`);
          const base = 900 * Math.pow(2, attempt); // 900ms, 1800ms, 3600ms...
          const jitter = Math.floor(Math.random() * 350);
          await sleep(base + jitter);
          continue;
        }

        throw new Error(`DJI API HTTP ${status} for ${url}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      const base = 600 * Math.pow(2, attempt);
      const jitter = Math.floor(Math.random() * 300);
      await sleep(base + jitter);
    }
  }

  const msg = lastErr instanceof Error ? lastErr.message : 'Unknown fetchJson error';
  throw new Error(msg);
}

async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  fn: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const results: TResult[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index] as TItem, index);
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
  await Promise.all(workers);
  return results;
}

function normalizeWebsite(website: string | null): string | null {
  if (!website) return null;
  // DJI often returns "www.example.com" without scheme.
  if (/^https?:\/\//i.test(website)) return website;
  return `https://${website.replace(/^\/*/, '')}`;
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  // Avoid empty strings with whitespace only.
  return phone.trim().length ? phone.trim() : null;
}

function uniqBy<T>(items: T[], keyFn: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const i of items) {
    const k = keyFn(i);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(i);
  }
  return out;
}

async function loadCountryCodesByContinent(): Promise<Record<string, string[]>> {
  try {
    const raw = fs.readFileSync(COUNTRY_CODES_FILE, 'utf8');
    const parsed = JSON.parse(raw) as {
      continents?: Record<string, string[]>;
    };

    if (!parsed.continents) throw new Error('Missing continents in cache file');
    return {
      ...parsed.continents,
      ...(parsed.continents.Asia ? {} : { Asia: DEFAULT_ASIA_REGION_CODES }),
    };
  } catch {
    // If the cache file isn't present (fresh deploy), extract the working continents once
    // from DJI's UI dropdown, then save to `data/` for subsequent runs.
    const extracted = await withBrowserPage(async (page) => {
      await page.goto('https://www.dji.com/global/where-to-buy/retail-stores', { waitUntil: 'domcontentloaded' });

      const continents = await page.evaluate(() => {
        const sel = Array.from(document.querySelectorAll('select'))[0];
        if (!sel) return [] as Array<{ value: string; text: string }>;
        return Array.from(sel.options)
          .map((o) => ({ value: o.value, text: (o.textContent || '').trim() }))
          .filter((x) => x.value);
      });

      const target = continents.filter((c) => c.value !== 'Asia');
      const result: Record<string, string[]> = {};

      for (const c of target) {
        let options: string[] = [];
        for (let attempt = 1; attempt <= 4; attempt++) {
          await page.evaluate((cont) => {
            const continentSel = Array.from(document.querySelectorAll('select'))[0] as HTMLSelectElement | undefined;
            if (!continentSel) return;
            continentSel.value = cont;
            continentSel.dispatchEvent(new Event('change', { bubbles: true }));
          }, c.value);

          const start = Date.now();
          while (Date.now() - start < 15000) {
            options = await page.evaluate(() => {
              const countrySel = Array.from(document.querySelectorAll('select'))[1] as HTMLSelectElement | undefined;
              if (!countrySel) return [];
              return Array.from(countrySel.options).filter((o) => o.value).map((o) => o.value);
            });
            if (options.length > 0) break;
            await new Promise((r) => setTimeout(r, 500));
          }

          if (options.length > 0) break;
        }

        result[c.text] = Array.from(new Set(options)).sort();
      }

      return result;
    });

    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(
      COUNTRY_CODES_FILE,
      JSON.stringify({ generatedAt: new Date().toISOString(), continents: extracted }, null, 2),
      'utf8',
    );

    return {
      ...extracted,
      Asia: DEFAULT_ASIA_REGION_CODES,
    };
  }
}

type PartnersPartner = {
  token?: string;
  name?: string;
  state?: string | null;
  city?: string | null;
  district?: string | null;
  address?: string | null;
  google_lon?: number | null;
  google_lat?: number | null;
  contact_number?: string | null;
  email?: string | null;
  wechat?: string | null;
  website?: string | null;
  business_hour?: string | null;
  region_code?: string | null;
  region?: string | null;
  categories?: string[];
};

type PartnersPageResponse = {
  message: string | null;
  data?: {
    partners?: PartnersPartner[];
    total_pages?: number;
  };
  success: boolean;
  status: number;
};

async function scrapePartnersCategory(args: {
  kind: DjiVendorKind;
  category: string;
  businessLevelEq?: string;
  continents: Record<string, string[]>;
  mode: DjiScrapeOptions['mode'];
  maxCountriesPerContinent?: number;
}): Promise<DjiVendor[]> {
  const { kind, category, businessLevelEq, continents, mode, maxCountriesPerContinent } = args;

  const targets: Array<{ continent: string; regionCode: string }> = [];
  for (const [continent, codes] of Object.entries(continents)) {
    const limited = mode === 'sample' && typeof maxCountriesPerContinent === 'number'
      ? codes.slice(0, maxCountriesPerContinent)
      : codes;
    for (const rc of limited) {
      targets.push({ continent, regionCode: rc });
    }
  }

  const perPage = 20; // reduces pagination requests while staying within API limits
  const concurrency = 2; // reduce rate-limit risk on full runs

  return (await mapWithConcurrency(targets, concurrency, async ({ continent, regionCode }) => {
    // Partners endpoint is paginated and may be empty for many countries.
    try {
      const base = new URL('https://www-api.dji.com/global/api/where-to-buy/partners');
      base.searchParams.set('category', category);
      base.searchParams.set('continent', continent);
      base.searchParams.set('page', '1');
      base.searchParams.set('per_page', String(perPage));
      base.searchParams.set('region_code_eq', regionCode);
      if (businessLevelEq) base.searchParams.set('business_level_eq', businessLevelEq);

      const first = await fetchJson<PartnersPageResponse>(base.toString());
      const partners = first.data?.partners ?? [];
      const totalPages = first.data?.total_pages ?? 0;

      const pageResults: PartnersPartner[] = [...partners];
      const maxPagesForMode = mode === 'sample' ? Math.min(totalPages, 3) : totalPages;
      for (let page = 2; page <= maxPagesForMode; page++) {
        const u = new URL(base.toString());
        u.searchParams.set('page', String(page));
        const res = await fetchJson<PartnersPageResponse>(u.toString());
        pageResults.push(...(res.data?.partners ?? []));
      }

      const mapped: DjiVendor[] = pageResults
        .filter(p => typeof p.name === 'string' && p.name.trim().length > 0)
        .map(p => ({
          kind,
          name: p.name as string,
          address: asNonEmptyString(p.address) ?? null,
          city: asNonEmptyString(p.city ?? null),
          state: asNonEmptyString(p.state ?? null),
          country: asNonEmptyString(p.region ?? p.region_code ?? null),
          phone: normalizePhone(asNonEmptyString(p.contact_number ?? null)),
          email: asNonEmptyString(p.email ?? null),
          website: normalizeWebsite(asNonEmptyString(p.website ?? null)),
          latitude: asNullableNumber(p.google_lat ?? null),
          longitude: asNullableNumber(p.google_lon ?? null),
          sourceContinent: continent,
          sourceRegionCode: regionCode,
        }));

      return mapped;
    } catch {
      // Don't fail the whole scrape because one country/range was rate-limited.
      console.warn('[dji where-to-buy] country scrape failed', { kind, continent, regionCode });
      return [];
    }
  })).flat();
}

type AgricultureMapsResponse = {
  success: boolean;
  status: number;
  data?: Array<{
    area?: string | null;
    country_code?: string | null;
    country_name?: string | null;
    mg_distributors?: Array<{
      name?: string;
      email?: string | null;
      website?: string | null;
      address?: string | null;
      tel?: string | null;
      state?: string | null;
      city?: string | null;
      google_coord?: number[] | null;
    }>;
  }>;
};

async function scrapeAgricultureMaps(args: {
  continents: Record<string, string[]>;
  mode: DjiScrapeOptions['mode'];
  maxCountriesPerContinent?: number;
}): Promise<DjiVendor[]> {
  const { continents, mode, maxCountriesPerContinent } = args;

  const targets: Array<{ countryCode: string; sourceContinent: string }> = [];
  for (const [continent, codes] of Object.entries(continents)) {
    const limited = mode === 'sample' && typeof maxCountriesPerContinent === 'number'
      ? codes.slice(0, maxCountriesPerContinent)
      : codes;
    for (const rc of limited) targets.push({ countryCode: rc, sourceContinent: continent });
  }

  const concurrency = 4;
  return (await mapWithConcurrency(targets, concurrency, async ({ countryCode, sourceContinent }) => {
    try {
      const url = `https://www-api.dji.com/global/api/where-to-buy/agriculture-dealer-maps?area=${countryCode.toLowerCase()}`;
      const data = await fetchJson<AgricultureMapsResponse>(url);
      const distributors = data.data?.flatMap(d => d.mg_distributors ?? []) ?? [];

      return distributors.map(d => {
        const coords = toCoordsPair(d.google_coord);
        return {
          kind: 'agriculture_dealer' as const,
          name: d.name ?? 'Unknown',
          address: asNonEmptyString(d.address) ?? null,
          city: asNonEmptyString(d.city ?? null),
          state: asNonEmptyString(d.state ?? null),
          country: asNonEmptyString(data.data?.[0]?.country_name ?? null) ?? null,
          phone: normalizePhone(asNonEmptyString(d.tel ?? null)),
          email: asNonEmptyString(d.email ?? null),
          website: normalizeWebsite(asNonEmptyString(d.website ?? null)),
          latitude: coords.latitude,
          longitude: coords.longitude,
          sourceContinent,
          sourceRegionCode: countryCode,
        };
      }).filter(v => v.name && v.name.trim().length > 0);
    } catch {
      console.warn('[dji where-to-buy] agriculture country scrape failed', { sourceContinent, countryCode });
      return [];
    }
  })).flat();
}

type DeliveryMapsResponse = {
  success: boolean;
  status: number;
  data?: Array<{
    name?: string;
    tel?: string | null;
    email?: string | null;
    address?: string | null;
    google_coord?: number[] | null;
  }>;
};

async function scrapeDeliveryMaps(args: {
  continents: Record<string, string[]>;
  mode: DjiScrapeOptions['mode'];
  maxCountriesPerContinent?: number;
}): Promise<DjiVendor[]> {
  const { continents, mode, maxCountriesPerContinent } = args;

  const targets: Array<{ countryCode: string; sourceContinent: string }> = [];
  for (const [continent, codes] of Object.entries(continents)) {
    const limited = mode === 'sample' && typeof maxCountriesPerContinent === 'number'
      ? codes.slice(0, maxCountriesPerContinent)
      : codes;
    for (const rc of limited) targets.push({ countryCode: rc, sourceContinent: continent });
  }

  const concurrency = 4;
  return (await mapWithConcurrency(targets, concurrency, async ({ countryCode, sourceContinent }) => {
    try {
      const url = `https://www-api.dji.com/global/api/where-to-buy/delivery-dealer-maps?area=${countryCode.toLowerCase()}`;
      const data = await fetchJson<DeliveryMapsResponse>(url);
      const dealers = data.data ?? [];

      return dealers.map(d => {
        const coords = toCoordsPair(d.google_coord);
        return {
          kind: 'delivery_dealer' as const,
          name: d.name ?? 'Unknown',
          address: asNonEmptyString(d.address) ?? null,
          city: null,
          state: null,
          country: null,
          phone: normalizePhone(asNonEmptyString(d.tel ?? null)),
          email: asNonEmptyString(d.email ?? null),
          website: null,
          latitude: coords.latitude,
          longitude: coords.longitude,
          sourceContinent,
          sourceRegionCode: countryCode,
        };
      }).filter(v => v.name && v.name.trim().length > 0);
    } catch {
      console.warn('[dji where-to-buy] delivery country scrape failed', { sourceContinent, countryCode });
      return [];
    }
  })).flat();
}

type ProfessionalResponse = {
  success: boolean;
  status: number;
  data?: Array<{
    country_name?: string | null;
    professional_dealers?: Array<{
      area?: string | null;
      name?: string | null;
      address?: string | null;
      phone?: string | null;
      website?: string | null;
    }>;
  }>;
};

async function scrapeProfessional(args: {
  continents: Record<string, string[]>;
  mode: DjiScrapeOptions['mode'];
  maxCountriesPerContinent?: number;
}): Promise<DjiVendor[]> {
  const { continents, mode, maxCountriesPerContinent } = args;

  const targets: Array<{ continent: string; countryCode: string }> = [];
  for (const [continent, codes] of Object.entries(continents)) {
    const limited = mode === 'sample' && typeof maxCountriesPerContinent === 'number'
      ? codes.slice(0, maxCountriesPerContinent)
      : codes;
    for (const code of limited) targets.push({ continent, countryCode: code });
  }

  const concurrency = 4;
  return (await mapWithConcurrency(targets, concurrency, async ({ continent, countryCode }) => {
    try {
      const apiContinent = continent.includes(' ')
        ? continent.replace(/ /g, '+')
        : continent;
      const url = `https://www-api.dji.com/global/api/where-to-buy/professional-dealers/?continent=${encodeURIComponent(apiContinent)}&country=${countryCode.toLowerCase()}`;
      const data = await fetchJson<ProfessionalResponse>(url);

      const countries = data.data ?? [];
      const records: DjiVendor[] = [];
      for (const c of countries) {
        const country = asNonEmptyString(c.country_name ?? null);
        const dealers = c.professional_dealers ?? [];
        for (const dealer of dealers) {
          const coords = { latitude: null, longitude: null };
          records.push({
            kind: 'professional_dealer',
            name: dealer.name ?? 'Unknown',
            address: asNonEmptyString(dealer.address ?? null),
            city: null,
            state: null,
            country,
            phone: normalizePhone(asNonEmptyString(dealer.phone ?? null)),
            email: null,
            website: normalizeWebsite(asNonEmptyString(dealer.website ?? null)),
            latitude: coords.latitude,
            longitude: coords.longitude,
            sourceContinent: continent,
            sourceRegionCode: countryCode,
          });
        }
      }

      return records.filter(v => v.name && v.name.trim().length > 0);
    } catch {
      console.warn('[dji where-to-buy] professional country scrape failed', { continent, countryCode });
      return [];
    }
  })).flat();
}

export async function scrapeDjiWhereToBuy(options: DjiScrapeOptions): Promise<{
  vendors: DjiVendor[];
  summary: Record<DjiVendorKind, number>;
}> {
  const includeKinds = options.includeKinds ?? [
    'retail_store',
    'authorized_dealer',
    'enterprise_dealer',
    'agriculture_dealer',
    'professional_dealer',
    'delivery_dealer',
  ];

  const countriesByContinent = await loadCountryCodesByContinent();
  const maxCountriesPerContinent = options.maxCountriesPerContinent ?? 5;

  const results: DjiVendor[] = [];

  if (includeKinds.includes('retail_store')) {
    results.push(
      ...(await scrapePartnersCategory({
        kind: 'retail_store',
        category: 'Offline_store',
        continents: countriesByContinent,
        mode: options.mode,
        maxCountriesPerContinent,
      })),
    );
  }

  if (includeKinds.includes('authorized_dealer')) {
    results.push(
      ...(await scrapePartnersCategory({
        kind: 'authorized_dealer',
        category: 'Authorized_DEALER',
        continents: countriesByContinent,
        mode: options.mode,
        maxCountriesPerContinent,
      })),
    );
  }

  if (includeKinds.includes('enterprise_dealer')) {
    results.push(
      ...(await scrapePartnersCategory({
        kind: 'enterprise_dealer',
        category: 'Enterprise',
        businessLevelEq: 'Dealer',
        continents: countriesByContinent,
        mode: options.mode,
        maxCountriesPerContinent,
      })),
    );
  }

  if (includeKinds.includes('agriculture_dealer')) {
    results.push(
      ...(await scrapeAgricultureMaps({
        continents: countriesByContinent,
        mode: options.mode,
        maxCountriesPerContinent,
      })),
    );
  }

  if (includeKinds.includes('professional_dealer')) {
    results.push(
      ...(await scrapeProfessional({
        continents: countriesByContinent,
        mode: options.mode,
        maxCountriesPerContinent,
      })),
    );
  }

  if (includeKinds.includes('delivery_dealer')) {
    results.push(
      ...(await scrapeDeliveryMaps({
        continents: countriesByContinent,
        mode: options.mode,
        maxCountriesPerContinent,
      })),
    );
  }

  const deduped = uniqBy(results, v => `${v.kind}::${v.name}::${v.address ?? ''}::${v.country ?? ''}`);
  const summary = includeKinds.reduce((acc, k) => {
    acc[k] = 0;
    return acc;
  }, {} as Record<DjiVendorKind, number>);

  for (const v of deduped) summary[v.kind] = (summary[v.kind] ?? 0) + 1;

  return { vendors: deduped, summary };
}

