import { NextResponse } from 'next/server';
import { cleanCompanyName } from '@/lib/company-name-clean';
import { JSDOM } from 'jsdom';
import {
  apolloCompanySearch,
  apolloOrgEnrich,
  extractDomain,
  hasApolloKey,
  normalizeWebsiteUrl,
} from '@/lib/company-enrichment/apolloSerper';
import { enrichDjiDockCompanyFromSerperRegex } from '@/lib/dji/djiDockCompanyEnricher';
import { runDockQaInternetScan, type DockQaInternetResult } from '@/lib/dji/dockQaInternetScan';
import { upsertMultiSourcesFromDockHunter, websiteToNormalizedDomain } from '@/lib/multi-sources-companies-import';
import { requireSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DEFAULT_SCAN_LIMIT = 50;
const MAX_SCAN_LIMIT = 500;
const MAX_DELAY_MS = 10_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtmlWithTimeout(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DockRadar/1.0)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en,fr;q=0.9',
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
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

      if (!/https?:\/\/([a-z]{2,3}\.)?linkedin\.com\//i.test(abs)) continue;
      if (/linkedin\.com\/company\//i.test(abs) || /linkedin\.com\/showcase\//i.test(abs)) {
        candidates.push(abs);
      }
    }

    if (candidates.length === 0) return null;

    // Prefer canonical company URLs: shortest path, drop tracking.
    const normalized = candidates.map((u) => {
      try {
        const url = new URL(u);
        url.hash = '';
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

/**
 * When APOLLO_API_KEY is set: resolve canonical domain + LinkedIn via Apollo (same idea as CSV pipeline).
 * Prefers Apollo over Serper's #1 Google hit when the row did not supply website/LinkedIn in CSV.
 */
async function mergeApolloWebsiteLinkedin(
  companyName: string,
  csvWebsite: string | null,
  csvLinkedin: string | null,
  serperWebsite: string | null,
  serperLinkedin: string | null,
): Promise<{
  website: string | null;
  linkedin: string | null;
  websiteSource: 'csv' | 'serper' | 'apollo';
  linkedinSource: 'csv' | 'serper' | 'apollo' | 'apollo_org_enrich' | 'website_scan';
}> {
  let website = csvWebsite ?? serperWebsite;
  let linkedin = csvLinkedin ?? serperLinkedin;
  let websiteSource: 'csv' | 'serper' | 'apollo' = csvWebsite ? 'csv' : 'serper';
  let linkedinSource: 'csv' | 'serper' | 'apollo' | 'apollo_org_enrich' | 'website_scan' = csvLinkedin
    ? 'csv'
    : serperLinkedin
      ? 'serper'
      : 'serper';

  if (!hasApolloKey()) return { website, linkedin, websiteSource, linkedinSource };

  const cleaned = cleanCompanyName(companyName);
  let apolloDomain: string | null = null;
  let apolloLi: string | null = null;
  const serperWebsiteOriginal = serperWebsite;
  let usedApolloDomain = false;

  for (const variant of cleaned.variants) {
    try {
      const r = await apolloCompanySearch(variant);
      if (r.domain || r.linkedinUrl) {
        apolloDomain = r.domain ?? null;
        apolloLi = r.linkedinUrl ?? null;
        break;
      }
    } catch {
      /* invalid key / network */
    }
    await sleep(300);
  }

  if (!csvWebsite && apolloDomain) {
    website = normalizeWebsiteUrl(apolloDomain);
    websiteSource = 'apollo';
    usedApolloDomain = true;
  }
  if (!csvLinkedin && apolloLi) {
    linkedin = apolloLi;
    linkedinSource = 'apollo';
  }

  const dom = extractDomain(website);
  if (!csvLinkedin && !linkedin && dom) {
    try {
      const o = await apolloOrgEnrich(dom);
      if (o.linkedinUrl) linkedin = o.linkedinUrl;
      if (o.linkedinUrl) linkedinSource = 'apollo_org_enrich';
    } catch {
      /* ignore */
    }
  }

  // Apollo may return a domain but still no LinkedIn.
  // Fallback: visit the website and look for LinkedIn company/showcase links in the HTML.
  if (!csvLinkedin && !linkedin && website) {
    const websiteUrl = normalizeWebsiteUrl(website);
    if (websiteUrl) {
      const html = await fetchHtmlWithTimeout(websiteUrl, 7000);
      if (html) {
        const liFromSite = extractLinkedInCompanyUrlFromHtml(html, websiteUrl);
        if (liFromSite) linkedin = liFromSite;
        if (liFromSite) linkedinSource = 'website_scan';
      }
    }
  }

  // Guardrail: if Apollo only provided a domain but we still couldn't find LinkedIn,
  // keep the Serper website instead (likely less ambiguous than Apollo for some names).
  if (!csvLinkedin && usedApolloDomain && !apolloLi && !linkedin && serperWebsiteOriginal) {
    website = serperWebsiteOriginal;
    websiteSource = 'serper';
  }

  return { website, linkedin, websiteSource, linkedinSource };
}

type RegistryRow = {
  id: string;
  company_name: string;
  trade_name?: string | null;
  country_code: string;
  website?: string | null;
  linkedin?: string | null;
};

/** Unified row for hunter loop (DB registry or uploaded CSV). */
type WorkRow = {
  /** Response id: registry UUID or `csv-{index}` */
  registry_id: string;
  company_name: string;
  /** Preferred label for display and multi_sources.display_name (trade_name > company_name). */
  display_name: string;
  country_code: string;
  website: string | null;
  linkedin: string | null;
  /** When set, updates country_registered_companies */
  registryUuid: string | null;
  /** When set, CSV line index for multi_sources source_refs */
  csvRowIndex: number | null;
};

type ScanResultRow = {
  registry_id: string;
  company_name: string;
  country_code: string;
  website_before: string | null;
  linkedin_before: string | null;
  website_after: string | null;
  linkedin_after: string | null;
  website_source?: 'csv' | 'serper' | 'apollo';
  linkedin_source?: 'csv' | 'serper' | 'apollo' | 'apollo_org_enrich' | 'website_scan';
  dji_dock_hit: boolean;
  stored_to_discovered_company: boolean;
  serper_top_link: string | null;
  qa_internet: DockQaInternetResult | null;
  stored_to_multi_sources: boolean;
  multi_sources_error?: string | null;
  error?: string;
  analysis: Awaited<ReturnType<typeof enrichDjiDockCompanyFromSerperRegex>> | null;
};

function normCsvRow(raw: Record<string, unknown>): {
  company_name: string;
  country_code: string;
  website: string | null;
  linkedin: string | null;
} | null {
  const m = new Map(
    Object.entries(raw).map(([k, v]) => [
      k.trim().toLowerCase().replace(/\s+/g, '_'),
      typeof v === 'string' ? v.trim() : String(v ?? '').trim(),
    ]),
  );
  const company =
    m.get('company_name') ??
    m.get('company') ??
    m.get('name') ??
    m.get('organisation') ??
    m.get('organization') ??
    '';
  const cc = (m.get('country_code') ?? m.get('country') ?? '').toUpperCase().slice(0, 2);
  if (!company || !/^[A-Z]{2}$/.test(cc)) return null;
  const website = m.get('website') || m.get('url') || '';
  const linkedin = m.get('linkedin') || m.get('linkedin_url') || '';
  return {
    company_name: company,
    country_code: cc,
    website: website ? website : null,
    linkedin: linkedin ? linkedin : null,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as {
      country_code?: string;
      qa_status?: 'pending' | 'approved' | 'rejected' | 'merged' | 'all' | 'raw';
      limit?: number;
      delay_ms?: number;
      enrich?: boolean;
      run_qa_internet?: boolean;
      persist_discovered?: boolean;
      /** When non-empty, skip DB registry and run hunter on these rows instead */
      csv_rows?: Record<string, unknown>[];
    };

    const countryCode = body.country_code?.trim().toUpperCase() || null;
    const qaStatus = body.qa_status ?? 'approved';
    const rawLimit = Number(body.limit);
    const scanLimit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(MAX_SCAN_LIMIT, Math.floor(rawLimit))
      : DEFAULT_SCAN_LIMIT;
    const rawDelay = Number(body.delay_ms);
    const delayMs = Number.isFinite(rawDelay) && rawDelay > 0
      ? Math.min(MAX_DELAY_MS, Math.floor(rawDelay))
      : 0;

    const runEnrich = body.enrich !== false;
    const runQaInternet = body.run_qa_internet !== false;
    const persistDiscovered = body.persist_discovered !== false;

    const serperApiKey = process.env.SERPER_API_KEY?.trim();
    if (!serperApiKey) {
      return NextResponse.json({ error: 'SERPER_API_KEY is not set' }, { status: 500 });
    }

    const db = requireSupabase();
    let qaFilterApplied = qaStatus !== 'all';
    let workRows: WorkRow[] = [];
    let truncatedByLimit = false;
    let csvRowsRaw = 0;
    let csvRowsValid = 0;
    const batchDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const csvInput = Array.isArray(body.csv_rows) ? body.csv_rows : [];
    const MAX_CSV_RAW_ROWS = 5000;
    if (csvInput.length > MAX_CSV_RAW_ROWS) {
      return NextResponse.json(
        { error: `Too many CSV rows (max ${MAX_CSV_RAW_ROWS} per request)` },
        { status: 400 },
      );
    }
    if (csvInput.length > 0) {
      csvRowsRaw = csvInput.length;
      qaFilterApplied = false;
      const parsed: WorkRow[] = [];
      for (let i = 0; i < csvInput.length; i++) {
        const n = normCsvRow(csvInput[i] ?? {});
        if (!n) continue;
        const idx = parsed.length;
        parsed.push({
          registry_id: `csv-${idx}`,
          company_name: n.company_name,
          display_name: n.company_name,
          country_code: n.country_code,
          website: n.website,
          linkedin: n.linkedin,
          registryUuid: null,
          csvRowIndex: idx,
        });
      }
      if (parsed.length === 0) {
        return NextResponse.json(
          {
            error:
              'No valid CSV rows: each row needs company name (company_name / company / name) and country (country_code or country, ISO-2).',
          },
          { status: 400 },
        );
      }
      csvRowsValid = parsed.length;
      truncatedByLimit = parsed.length > scanLimit;
      workRows = parsed.slice(0, scanLimit);
    } else {
      let rows: RegistryRow[] = [];

      for (let attempt = 0; attempt < 2; attempt++) {
        let query = db
          .from('country_registered_companies')
          .select('id, company_name, trade_name, country_code, website, linkedin')
          .order('id', { ascending: true })
          .limit(scanLimit);

        if (countryCode) query = query.eq('country_code', countryCode);
        if (qaFilterApplied) query = query.eq('dock_qa_status', qaStatus);

        const { data, error } = await query;
        if (error) {
          const msg = (error as { message?: string }).message ?? 'Database query failed';
          const qaColumnMissing = msg.includes('column') && (msg.includes('qa_status') || msg.includes('dock_qa_status'));
          if (qaFilterApplied && qaColumnMissing) {
            qaFilterApplied = false;
            continue;
          }
          console.error('[/api/dji/dock-hunter/scan-registry] Query error:', error);
          return NextResponse.json({ error: msg }, { status: 500 });
        }

        rows = (data ?? []) as RegistryRow[];
        break;
      }

      truncatedByLimit = rows.length === scanLimit;
      workRows = rows.map((r) => ({
        registry_id: r.id,
        company_name: r.company_name,
        display_name: (r.trade_name && r.trade_name.trim().length > 0) ? r.trade_name.trim() : r.company_name,
        country_code: r.country_code,
        website: r.website ?? null,
        linkedin: r.linkedin ?? null,
        registryUuid: r.id,
        csvRowIndex: null,
      }));
    }

    const importBatch = csvInput.length > 0
      ? `dock-hunter-csv-${batchDate}`
      : `dock-hunter-${countryCode ?? 'ALL'}-${batchDate}`;

    const results: ScanResultRow[] = [];

    for (let i = 0; i < workRows.length; i++) {
      const row = workRows[i];
      if (delayMs > 0 && i > 0) await sleep(delayMs);

      try {
        let analysis: Awaited<ReturnType<typeof enrichDjiDockCompanyFromSerperRegex>> | null = null;
        let nextWebsite = row.website ?? null;
        let nextLinkedin = row.linkedin ?? null;
        let nextWebsiteSource: 'csv' | 'serper' | 'apollo' | undefined;
        let nextLinkedinSource:
          | 'csv'
          | 'serper'
          | 'apollo'
          | 'apollo_org_enrich'
          | 'website_scan'
          | undefined;

        if (runEnrich) {
          analysis = await enrichDjiDockCompanyFromSerperRegex(
            {
              companyName: row.company_name,
              companyCountry: row.country_code,
              pages: 1,
              persistToDiscovered: persistDiscovered,
            },
            serperApiKey,
          );
          const merged = await mergeApolloWebsiteLinkedin(
            row.company_name,
            row.website,
            row.linkedin,
            analysis.websiteCandidate ?? null,
            analysis.linkedin.found ?? null,
          );
          nextWebsite = merged.website;
          nextLinkedin = merged.linkedin;
          nextWebsiteSource = merged.websiteSource;
          nextLinkedinSource = merged.linkedinSource;
        } else {
          nextWebsite = row.website ?? null;
          nextLinkedin = row.linkedin ?? null;
        }

        if (row.registryUuid) {
          const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (!row.website && nextWebsite) updatePayload.website = nextWebsite;
          if (!row.linkedin && nextLinkedin) updatePayload.linkedin = nextLinkedin;
          if (Object.keys(updatePayload).length > 1) {
            await db.from('country_registered_companies').update(updatePayload).eq('id', row.registryUuid);
          }
        }

        let qaInternet: DockQaInternetResult | null = null;
        let storedToMulti = false;
        let multiErr: string | null = null;

        if (runQaInternet) {
          const domain =
            websiteToNormalizedDomain(nextWebsite ?? undefined) ??
            websiteToNormalizedDomain(analysis?.websiteCandidate ?? undefined);
          if (domain) {
            if (delayMs > 0) await sleep(Math.min(delayMs, 400));
            qaInternet = await runDockQaInternetScan(domain, nextLinkedin, serperApiKey);
            const upsert = await upsertMultiSourcesFromDockHunter(db, {
              displayName: row.display_name,
              countryCode: row.country_code,
              website: nextWebsite,
              linkedin: nextLinkedin,
              importBatch,
              registryId: row.registryUuid ?? undefined,
              csvRowIndex: row.csvRowIndex ?? undefined,
              qa: qaInternet,
            });
            storedToMulti = upsert.ok;
            multiErr = upsert.error ?? null;
          }
        }

        results.push({
          registry_id: row.registry_id,
          company_name: row.company_name,
          country_code: row.country_code,
          website_before: row.website ?? null,
          linkedin_before: row.linkedin ?? null,
          website_after: nextWebsite,
          linkedin_after: nextLinkedin,
          website_source: nextWebsiteSource,
          linkedin_source: nextLinkedinSource,
          dji_dock_hit: analysis?.djiDockRegex.anyHit ?? false,
          stored_to_discovered_company: analysis?.storedToDiscoveredCompany ?? false,
          serper_top_link: analysis?.topResult?.link ?? null,
          qa_internet: qaInternet,
          stored_to_multi_sources: storedToMulti,
          multi_sources_error: multiErr,
          analysis,
        });
      } catch (err) {
        results.push({
          registry_id: row.registry_id,
          company_name: row.company_name,
          country_code: row.country_code,
          website_before: row.website ?? null,
          linkedin_before: row.linkedin ?? null,
          website_after: row.website ?? null,
          linkedin_after: row.linkedin ?? null,
          website_source: undefined,
          linkedin_source: undefined,
          dji_dock_hit: false,
          stored_to_discovered_company: false,
          serper_top_link: null,
          qa_internet: null,
          stored_to_multi_sources: false,
          multi_sources_error: null,
          error: err instanceof Error ? err.message : 'Unknown error',
          analysis: null,
        });
      }
    }

    const hitCount = results.filter(r => r.dji_dock_hit).length;
    const storedCount = results.filter(r => r.stored_to_discovered_company).length;
    const linkedinFoundCount = results.filter(r => r.linkedin_after).length;
    const multiStored = results.filter(r => r.stored_to_multi_sources).length;
    const qaHits = results.filter(r => r.qa_internet?.dock_found).length;

    return NextResponse.json({
      source: csvInput.length > 0 ? 'csv' : 'registry',
      total_scanned: results.length,
      scan_limit: scanLimit,
      truncated_by_limit: truncatedByLimit,
      csv_rows_raw: csvInput.length > 0 ? csvRowsRaw : undefined,
      csv_rows_valid: csvInput.length > 0 ? csvRowsValid : undefined,
      delay_ms: delayMs,
      hit_count: hitCount,
      stored_count: storedCount,
      linkedin_found_count: linkedinFoundCount,
      qa_filter_applied: qaFilterApplied,
      qa_internet_dock_found: qaHits,
      multi_sources_stored: multiStored,
      options: {
        enrich: runEnrich,
        run_qa_internet: runQaInternet,
        persist_discovered: persistDiscovered,
        import_batch: importBatch,
        apollo_merge: hasApolloKey(),
      },
      results,
    });
  } catch (err) {
    const message = err instanceof Error
      ? err.message
      : (typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message?: unknown }).message === 'string'
        ? ((err as { message: string }).message)
        : JSON.stringify(err));
    console.error('[/api/dji/dock-hunter/scan-registry] Error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
