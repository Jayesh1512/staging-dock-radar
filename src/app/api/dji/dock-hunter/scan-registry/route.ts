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
import {
  buildSharedDomainSet,
  isDirectoryOrMegaDomain,
  isValidLinkedIn,
  validateDomainForQa,
} from '@/lib/dji/domainValidation';
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
  // If CSV website is a directory/mega-domain, treat it as missing — let Serper/Apollo fill it.
  const csvWebsiteUsable = csvWebsite && !isDirectoryOrMegaDomain(csvWebsite) ? csvWebsite : null;
  // If CSV LinkedIn is polluted (e.g. company/facebook), treat as missing.
  const csvLinkedinUsable = csvLinkedin && isValidLinkedIn(csvLinkedin) ? csvLinkedin : null;

  let website = csvWebsiteUsable ?? serperWebsite;
  let linkedin = csvLinkedinUsable ?? serperLinkedin;
  let websiteSource: 'csv' | 'serper' | 'apollo' = csvWebsiteUsable ? 'csv' : 'serper';
  let linkedinSource: 'csv' | 'serper' | 'apollo' | 'apollo_org_enrich' | 'website_scan' = csvLinkedinUsable
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
  dock_verified: boolean | null;
  multi_sources_error?: string | null;
  domain_skip_reason?: string | null;
  linkedin_cleaned?: boolean;
  error?: string;
  analysis: Awaited<ReturnType<typeof enrichDjiDockCompanyFromSerperRegex>> | null;
};

function makeCompanyCountryKey(companyName: string, countryCode: string): string {
  const cleaned = cleanCompanyName(companyName);
  const normalizedName = cleaned.cleaned.toLowerCase().trim();
  return `${normalizedName}::${countryCode.toUpperCase()}`;
}

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
      /** Data source name, e.g. 'nl_aviation_registry', 'fr_sirene' */
      source_name?: string;
      /** Original uploaded filename for audit trail */
      source_file_name?: string;
      /** When true, only write records where dock is verified (dock_found=true). Default true. */
      only_store_verified?: boolean;
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
    const onlyStoreVerified = body.only_store_verified !== false; // default true
    const sourceName = body.source_name?.trim() || 'manual_csv';
    const sourceFileName = body.source_file_name?.trim() || null;

    const serperApiKey = process.env.SERPER_API_KEY?.trim();
    if (!serperApiKey) {
      return NextResponse.json({ error: 'SERPER_API_KEY is not set' }, { status: 500 });
    }

    const db = requireSupabase();
    let qaFilterApplied = qaStatus !== 'all';
    let workRows: WorkRow[] = [];
    let truncatedByLimit = false;
    let skippedExisting = 0;
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

    // Skip rows already present in multi_sources_companies_import (normalized_name + country_code).
    const uniqueCountries = Array.from(new Set(workRows.map((r) => r.country_code.toUpperCase())));
    const uniqueNames = Array.from(
      new Set(
        workRows
          .map((r) => cleanCompanyName(r.company_name).cleaned.toLowerCase().trim())
          .filter(Boolean),
      ),
    );
    if (uniqueCountries.length > 0 && uniqueNames.length > 0) {
      const { data: existingRows, error: existingErr } = await db
        .from('multi_sources_companies_import')
        .select('normalized_name, country_code')
        .in('country_code', uniqueCountries)
        .in('normalized_name', uniqueNames);
      if (existingErr) {
        const msg = (existingErr as { message?: string }).message ?? 'Failed existing-row check';
        return NextResponse.json({ error: msg }, { status: 500 });
      }
      const existingSet = new Set(
        (existingRows ?? []).map((r) => `${String(r.normalized_name)}::${String(r.country_code).toUpperCase()}`),
      );
      const beforeCount = workRows.length;
      workRows = workRows.filter((r) => !existingSet.has(makeCompanyCountryKey(r.company_name, r.country_code)));
      skippedExisting = Math.max(0, beforeCount - workRows.length);
    }

    // Build shared-domain set for batch-level directory detection (Layer 3).
    const sharedDomains = buildSharedDomainSet(
      workRows.map((r) => ({ website: r.website })),
      3,
    );

    // ── Streaming NDJSON response ──────────────────────────────────────
    // Each row is written as it completes so the connection stays alive
    // and the UI can show real progress.

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
        };

        send({
          type: 'start',
          total: workRows.length,
          scan_limit: scanLimit,
          truncated_by_limit: truncatedByLimit,
          skipped_existing: skippedExisting,
          csv_rows_raw: csvInput.length > 0 ? csvRowsRaw : undefined,
          csv_rows_valid: csvInput.length > 0 ? csvRowsValid : undefined,
          shared_domains: Array.from(sharedDomains),
          import_batch: importBatch,
        });

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
              const csvWebsiteReal = row.website?.trim() && !isDirectoryOrMegaDomain(row.website);
              const csvLinkedinReal = row.linkedin?.trim() && isValidLinkedIn(row.linkedin);
              const csvHasBoth = !!csvWebsiteReal && !!csvLinkedinReal;
              if (csvHasBoth) {
                nextWebsite = row.website;
                nextLinkedin = row.linkedin;
                nextWebsiteSource = 'csv';
                nextLinkedinSource = 'csv';
              } else {
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
              }
            } else {
              nextWebsite = row.website ?? null;
              nextLinkedin = row.linkedin ?? null;
            }

            // Clean LinkedIn if polluted by enrichment.
            let linkedinCleaned = false;
            if (nextLinkedin && !isValidLinkedIn(nextLinkedin)) {
              nextLinkedin = null;
              linkedinCleaned = true;
            }

            let qaInternet: DockQaInternetResult | null = null;
            let storedToMulti = false;
            let dockVerified: boolean | null = null;
            let multiErr: string | null = null;
            let domainSkipReason: string | null = null;

            if (runQaInternet) {
              const domain =
                websiteToNormalizedDomain(nextWebsite ?? undefined) ??
                websiteToNormalizedDomain(analysis?.websiteCandidate ?? undefined);

              const domainCheck = validateDomainForQa(nextWebsite, sharedDomains);

              if (domain && domainCheck.valid) {
                if (delayMs > 0) await sleep(Math.min(delayMs, 400));
                qaInternet = await runDockQaInternetScan(domain, nextLinkedin, serperApiKey);

                // Decide whether to write: if onlyStoreVerified, skip non-verified.
                const shouldWrite = !onlyStoreVerified || qaInternet.dock_found;
                if (shouldWrite) {
                  const upsert = await upsertMultiSourcesFromDockHunter(db, {
                    displayName: row.display_name,
                    countryCode: row.country_code,
                    website: nextWebsite,
                    linkedin: nextLinkedin,
                    importBatch,
                    sourceName,
                    sourceFileName,
                    registryId: row.registryUuid ?? undefined,
                    csvRowIndex: row.csvRowIndex ?? undefined,
                    qa: qaInternet,
                  });
                  storedToMulti = upsert.ok;
                  dockVerified = upsert.dockVerified ?? null;
                  multiErr = upsert.skipped ? null : (upsert.error ?? null);
                } else {
                  dockVerified = false;
                }
              } else {
                // No domain found or domain blocked.
                if (domain && !domainCheck.valid) {
                  domainSkipReason = `${domainCheck.reason}: ${domainCheck.detail}`;
                }

                // In "store all" mode, write even without QA. In "verified only", skip.
                if (!onlyStoreVerified) {
                  const noQa: DockQaInternetResult = {
                    dock_found: false,
                    total_hits: 0,
                    domain: domain ?? '',
                    web_mentions: [],
                    linkedin_mentions: [],
                    keywords_matched: [],
                    dock_models_line: null,
                    error: domain ? domainSkipReason : 'no_domain_found',
                  };
                  const upsert = await upsertMultiSourcesFromDockHunter(db, {
                    displayName: row.display_name,
                    countryCode: row.country_code,
                    website: nextWebsite,
                    linkedin: nextLinkedin,
                    importBatch,
                    sourceName,
                    sourceFileName,
                    registryId: row.registryUuid ?? undefined,
                    csvRowIndex: row.csvRowIndex ?? undefined,
                    qa: noQa,
                  });
                  storedToMulti = upsert.ok;
                  dockVerified = upsert.dockVerified ?? null;
                  multiErr = upsert.skipped ? null : (upsert.error ?? null);
                } else {
                  dockVerified = false;
                }
              }
            }

            const resultRow: ScanResultRow = {
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
              dock_verified: dockVerified,
              multi_sources_error: multiErr,
              domain_skip_reason: domainSkipReason,
              linkedin_cleaned: linkedinCleaned || undefined,
              analysis,
            };
            results.push(resultRow);

            // Stream progress for each completed row.
            send({
              type: 'row',
              current: i + 1,
              total: workRows.length,
              name: row.company_name,
              dock_verified: dockVerified,
              website: nextWebsite,
              linkedin: nextLinkedin,
              domain_skip: domainSkipReason,
              linkedin_cleaned: linkedinCleaned || undefined,
              dock_hit: analysis?.djiDockRegex.anyHit ?? false,
              qa_dock_found: qaInternet?.dock_found ?? null,
              stored: storedToMulti,
              error: null,
            });
          } catch (err) {
            const errRow: ScanResultRow = {
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
              dock_verified: null,
              multi_sources_error: null,
              error: err instanceof Error ? err.message : 'Unknown error',
              analysis: null,
            };
            results.push(errRow);

            send({
              type: 'row',
              current: i + 1,
              total: workRows.length,
              name: row.company_name,
              dock_verified: null,
              website: null,
              linkedin: null,
              domain_skip: null,
              dock_hit: false,
              qa_dock_found: null,
              stored: false,
              error: errRow.error,
            });
          }
        }

        // Final summary line.
        const hitCount = results.filter(r => r.dji_dock_hit).length;
        const linkedinFoundCount = results.filter(r => r.linkedin_after).length;
        const multiStored = results.filter(r => r.stored_to_multi_sources).length;
        const qaHits = results.filter(r => r.qa_internet?.dock_found).length;
        const domainSkippedCount = results.filter(r => r.domain_skip_reason).length;
        const linkedinCleanedCount = results.filter(r => r.linkedin_cleaned).length;
        const skippedNotVerified = onlyStoreVerified
          ? results.filter(r => !r.stored_to_multi_sources && !r.error).length
          : 0;

        // ── Save results to Supabase Storage ──────────────────────────────
        let storageUrl: string | null = null;
        try {
          const storageBucket = 'csv-company-pipeline';
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const objectKey = `dock-hunter/${importBatch}/results-${timestamp}.json`;
          const payload = JSON.stringify({
            import_batch: importBatch,
            source_name: sourceName,
            source_file_name: sourceFileName,
            scanned_at: new Date().toISOString(),
            total_scanned: results.length,
            skipped_existing: skippedExisting,
            multi_sources_stored: multiStored,
            qa_internet_dock_found: qaHits,
            domain_skipped: domainSkippedCount,
            linkedin_cleaned: linkedinCleanedCount,
            skipped_not_verified: skippedNotVerified,
            only_store_verified: onlyStoreVerified,
            shared_domains: Array.from(sharedDomains),
            results: results.map(r => ({
              company_name: r.company_name,
              country_code: r.country_code,
              website_after: r.website_after,
              linkedin_after: r.linkedin_after,
              dock_verified: r.dock_verified,
              domain_skip_reason: r.domain_skip_reason,
              error: r.error,
            })),
          }, null, 2);

          const { error: uploadErr } = await db.storage
            .from(storageBucket)
            .upload(objectKey, payload, { contentType: 'application/json', upsert: true });

          if (!uploadErr) {
            storageUrl = `${storageBucket}/${objectKey}`;
            send({ type: 'log', data: `Results saved to storage: ${storageUrl}` });
          } else {
            send({ type: 'log', data: `Storage upload failed: ${uploadErr.message}` });
          }
        } catch (storageErr) {
          // Non-fatal — don't block the response.
          send({ type: 'log', data: `Storage upload error: ${storageErr instanceof Error ? storageErr.message : 'unknown'}` });
        }

        send({
          type: 'done',
          source: csvInput.length > 0 ? 'csv' : 'registry',
          total_scanned: results.length,
          scan_limit: scanLimit,
          truncated_by_limit: truncatedByLimit,
          skipped_existing: skippedExisting,
          csv_rows_raw: csvInput.length > 0 ? csvRowsRaw : undefined,
          csv_rows_valid: csvInput.length > 0 ? csvRowsValid : undefined,
          delay_ms: delayMs,
          hit_count: hitCount,
          linkedin_found_count: linkedinFoundCount,
          qa_internet_dock_found: qaHits,
          multi_sources_stored: multiStored,
          domain_skipped: domainSkippedCount,
          linkedin_cleaned: linkedinCleanedCount,
          skipped_not_verified: skippedNotVerified,
          shared_domains: Array.from(sharedDomains),
          options: {
            enrich: runEnrich,
            run_qa_internet: runQaInternet,
            persist_discovered: persistDiscovered,
            only_store_verified: onlyStoreVerified,
            import_batch: importBatch,
            apollo_merge: hasApolloKey(),
          },
          storage_url: storageUrl,
          results,
        });

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      },
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
