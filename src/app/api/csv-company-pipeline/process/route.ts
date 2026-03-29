import { NextResponse } from 'next/server';
import { requireSupabase } from '@/lib/supabase';
import { enrichCompanyWebLinkedin } from '@/lib/company-enrichment/enrichCompanyWebLinkedin';
import { runDockQaInternetScan } from '@/lib/dji/dockQaInternetScan';
import {
  upsertMultiSourcesFromCsvPipeline,
  websiteToNormalizedDomain,
} from '@/lib/multi-sources-companies-import';
import { getCsvPipelineBucket, uploadCsvPipelineArtifact } from '@/lib/csv-company-pipeline/uploadArtifact';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function normKey(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, '_');
}

function rowMap(row: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(row).map(([k, v]) => [normKey(k), String(v ?? '').trim()]));
}

function pickCompany(m: Map<string, string>): string {
  return (
    m.get('company_name') ??
    m.get('company') ??
    m.get('name') ??
    m.get('organisation') ??
    m.get('organization') ??
    ''
  );
}

function pickLocation(m: Map<string, string>): string {
  return m.get('location') ?? m.get('city') ?? m.get('address') ?? '';
}

function enrichmentTagsFromSources(sources: import('@/lib/company-enrichment/enrichCompanyWebLinkedin').EnrichCompanySources): string[] {
  const t: string[] = [];
  if (sources.apollo_search) t.push('apollo');
  if (sources.apollo_org_enrich) t.push('apollo_org_enrich');
  if (sources.serper_domain) t.push('serper_domain');
  if (sources.serper_linkedin) t.push('serper_linkedin');
  return t;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      rows?: Record<string, string>[];
      country_code?: string;
      import_batch?: string;
      delay_ms?: number;
    };

    const rows = Array.isArray(body.rows) ? body.rows : [];
    const countryCode = (body.country_code ?? 'US').trim().toUpperCase();
    const batchDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const importBatch = body.import_batch?.trim() || `csv-pipeline-${countryCode}-${batchDate}`;
    const delayMs = Math.min(10_000, Math.max(0, Number(body.delay_ms) || 400));

    if (rows.length === 0) {
      return NextResponse.json({ error: 'rows must be a non-empty array of objects' }, { status: 400 });
    }
    if (rows.length > 200) {
      return NextResponse.json({ error: 'Max 200 rows per request' }, { status: 400 });
    }

    const serperKey = process.env.SERPER_API_KEY?.trim();
    if (!serperKey) {
      return NextResponse.json({ error: 'SERPER_API_KEY is not set' }, { status: 500 });
    }

    const db = requireSupabase();
    const ts = Date.now();

    type RowResult = {
      index: number;
      company_name: string;
      location: string;
      raw: Record<string, string>;
      enriched: boolean;
      enrichment_sources: import('@/lib/company-enrichment/enrichCompanyWebLinkedin').EnrichCompanySources;
      website: string | null;
      linkedin: string | null;
      qa_internet: Awaited<ReturnType<typeof runDockQaInternetScan>> | null;
      verified: boolean;
      storage_path: string | null;
      storage_ok: boolean;
      storage_error?: string | null;
      multi_sources_ok: boolean;
      multi_sources_error?: string | null;
      error?: string | null;
    };

    const results: RowResult[] = [];

    for (let i = 0; i < rows.length; i++) {
      if (i > 0 && delayMs > 0) await sleep(delayMs);

      const raw = rows[i];
      const m = rowMap(raw);
      const companyName = pickCompany(m);
      const location = pickLocation(m);

      if (!companyName) {
        results.push({
          index: i,
          company_name: '',
          location,
          raw,
          enriched: false,
          enrichment_sources: {
            apollo_search: false,
            apollo_org_enrich: false,
            serper_domain: false,
            serper_linkedin: false,
          },
          website: null,
          linkedin: null,
          qa_internet: null,
          verified: false,
          storage_path: null,
          storage_ok: false,
          multi_sources_ok: false,
          error: 'missing company name (expected company_name / Company Name / company)',
        });
        continue;
      }

      try {
        const enrich = await enrichCompanyWebLinkedin(companyName, location || undefined, countryCode, serperKey);

        const domain =
          websiteToNormalizedDomain(enrich.website ?? undefined) ??
          null;

        let qa: Awaited<ReturnType<typeof runDockQaInternetScan>> | null = null;
        if (domain) {
          if (delayMs > 0) await sleep(Math.min(delayMs, 300));
          qa = await runDockQaInternetScan(domain, enrich.linkedin, serperKey);
        }

        /** Valid contender = indexed DJI Dock evidence on own domain or LinkedIn (same as Dock Verify). */
        const verified = Boolean(qa?.dock_found);

        const storagePath = `${importBatch}/${ts}_row_${i}.json`;
        const storageBucket = getCsvPipelineBucket();
        const artifact = {
          import_batch: importBatch,
          storage_bucket: storageBucket,
          storage_object_key: storagePath,
          country_code: countryCode,
          row_index: i,
          processed_at: new Date().toISOString(),
          raw_columns: raw,
          company_name: companyName,
          location: location || null,
          enrichment: enrich,
          qa_internet: qa,
          verified,
          /** DB row (if verified) is keyed by normalized_name + country_code and stores the same bucket/key columns. */
          multi_sources_storage_lookup: verified
            ? { storage_bucket: storageBucket, storage_object_key: storagePath }
            : null,
        };

        const up = await uploadCsvPipelineArtifact(db, storagePath, artifact);
        let multiOk = false;
        let multiErr: string | null = null;

        if (verified && qa) {
          const tags = enrichmentTagsFromSources(enrich.sources);
          const upsert = await upsertMultiSourcesFromCsvPipeline(db, {
            displayName: companyName,
            countryCode,
            website: enrich.website,
            linkedin: enrich.linkedin,
            importBatch,
            qa,
            enrichmentMethodTags: tags,
            storageBucket,
            storageObjectKey: storagePath,
            sourceRefsExtra: {
              csv_pipeline: {
                storage_bucket: storageBucket,
                storage_object_key: storagePath,
                storage_path: storagePath,
                row_index: i,
                enriched: enrich.enriched,
                verified_at: new Date().toISOString(),
              },
            },
          });
          multiOk = upsert.ok;
          multiErr = upsert.error ?? null;
        }

        results.push({
          index: i,
          company_name: companyName,
          location,
          raw,
          enriched: enrich.enriched,
          enrichment_sources: enrich.sources,
          website: enrich.website,
          linkedin: enrich.linkedin,
          qa_internet: qa,
          verified,
          storage_path: storagePath,
          storage_ok: up.ok,
          storage_error: up.error ?? null,
          multi_sources_ok: multiOk,
          multi_sources_error: multiErr,
        });
      } catch (e) {
        results.push({
          index: i,
          company_name: companyName,
          location,
          raw,
          enriched: false,
          enrichment_sources: {
            apollo_search: false,
            apollo_org_enrich: false,
            serper_domain: false,
            serper_linkedin: false,
          },
          website: null,
          linkedin: null,
          qa_internet: null,
          verified: false,
          storage_path: null,
          storage_ok: false,
          multi_sources_ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const verifiedCount = results.filter((r) => r.verified).length;

    return NextResponse.json({
      import_batch: importBatch,
      country_code: countryCode,
      total: results.length,
      verified_count: verifiedCount,
      storage_bucket: getCsvPipelineBucket(),
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
