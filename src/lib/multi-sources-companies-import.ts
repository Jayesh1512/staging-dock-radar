/**
 * Upserts into multi_sources_companies_import per docs/DEVELOPMENT_GUIDE.md
 * (merge source_types, source_refs; fill website/linkedin only when NULL).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanCompanyName } from '@/lib/company-name-clean';
import {
  formatDockModelsLine,
  type DockQaInternetResult,
} from '@/lib/dji/dockQaInternetScan';

export function websiteToNormalizedDomain(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

type VerificationEntry = {
  method: string;
  hits: number;
  url: string | null;
  relevance: 'direct' | 'indirect' | 'mention_only';
  at: string;
  keywords_matched: string[];
  post_date: string | null;
  note: string | null;
};

function unionStrings(a: string[] | null | undefined, b: string[]): string[] {
  return Array.from(new Set([...(a ?? []), ...b]));
}

function mergeSourceRefs(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...(existing ?? {}), ...patch };
}

function recomputeDockModelsFromVerifications(verifications: VerificationEntry[]): string | null {
  const all = new Set<string>();
  for (const v of verifications) {
    for (const k of v.keywords_matched ?? []) all.add(k);
  }
  return formatDockModelsLine(Array.from(all));
}

export async function upsertMultiSourcesFromDockHunter(
  db: SupabaseClient,
  params: {
    displayName: string;
    countryCode: string;
    website: string | null;
    linkedin: string | null;
    importBatch: string;
    /** When set, links to country_registered_companies.id */
    registryId?: string | null;
    /** When set (CSV hunter), stored in source_refs instead of registry id */
    csvRowIndex?: number | null;
    qa: DockQaInternetResult;
  },
): Promise<{ ok: boolean; error?: string }> {
  const cleaned = cleanCompanyName(params.displayName);
  const normalizedName = cleaned.cleaned.toLowerCase().trim();
  if (!normalizedName) return { ok: false, error: 'empty normalized name' };

  const cc = params.countryCode.toUpperCase();
  const normDomain = websiteToNormalizedDomain(params.website);

  const { data: existing, error: selErr } = await db
    .from('multi_sources_companies_import')
    .select(
      'id, source_types, source_refs, website, linkedin, verifications, dock_verified, enrichment_methods, imported_via, import_batch',
    )
    .eq('normalized_name', normalizedName)
    .eq('country_code', cc)
    .maybeSingle();

  if (selErr) return { ok: false, error: selErr.message };

  const now = new Date().toISOString();

  const kw =
    params.qa.keywords_matched.length > 0
      ? params.qa.keywords_matched
      : params.qa.dock_found
        ? ['DJI Dock']
        : [];

  const newEntry: VerificationEntry = {
    method: 'serper',
    hits: params.qa.total_hits,
    url: params.qa.web_mentions[0]?.url ?? params.qa.linkedin_mentions[0]?.url ?? null,
    relevance: params.qa.dock_found ? 'direct' : 'mention_only',
    at: now,
    keywords_matched: kw,
    post_date: null,
    note: params.qa.error
      ? `QA: ${params.qa.error}`
      : 'Internet QA: site:domain "DJI Dock" + optional LinkedIn company search',
  };

  const prevVer = (existing?.verifications as VerificationEntry[] | null) ?? [];
  const mergedVerifications = [...prevVer, newEntry];

  const priorEvidence =
    existing?.dock_verified === true ||
    (Array.isArray(prevVer) && prevVer.length > 0);

  let dockVerified: boolean | null;
  if (params.qa.dock_found) {
    dockVerified = true;
  } else if (priorEvidence) {
    dockVerified = existing?.dock_verified ?? true;
  } else {
    dockVerified = false;
  }

  const sourceTypes = unionStrings(existing?.source_types as string[] | undefined, [
    params.csvRowIndex != null ? 'dji_dock_hunter_csv' : 'country_registry',
    'dock_hunter_qa',
  ]);

  const sourceRefs = mergeSourceRefs(
    existing?.source_refs as Record<string, unknown> | undefined,
    params.registryId
      ? { country_registered_company_id: params.registryId }
      : params.csvRowIndex != null
        ? {
            dji_dock_hunter_csv: {
              row_index: params.csvRowIndex,
              import_batch: params.importBatch,
            },
          }
        : {},
  );

  const enrichmentMethods = unionStrings(
    existing?.enrichment_methods as string[] | undefined,
    ['serper_qa'],
  );

  const nextWebsite = (existing?.website as string | null | undefined) ?? params.website ?? null;
  const nextLinkedin = (existing?.linkedin as string | null | undefined) ?? params.linkedin ?? null;

  const dockModels = recomputeDockModelsFromVerifications(mergedVerifications);

  const row = {
    normalized_name: normalizedName,
    country_code: cc,
    display_name: params.displayName,
    website: nextWebsite,
    linkedin: nextLinkedin,
    normalized_domain: normDomain,
    source_types: sourceTypes,
    source_refs: sourceRefs,
    imported_via: (existing?.imported_via as string | null) ?? 'dji_dock_hunter',
    import_batch: (existing?.import_batch as string | null) ?? params.importBatch,
    enrichment_methods: enrichmentMethods,
    dock_verified: dockVerified,
    verifications: mergedVerifications,
    dock_models: dockModels,
    updated_at: now,
  };

  if (!existing?.id) {
    const { error } = await db.from('multi_sources_companies_import').insert(row);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await db
      .from('multi_sources_companies_import')
      .update(row)
      .eq('id', existing.id as string);
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true };
}

/**
 * Verified CSV pipeline rows: Apollo/Serper enrichment + internet QA, then multi_sources.
 * Only call when QA marks the company as a valid contender (e.g. dock_found on site:domain).
 */
export async function upsertMultiSourcesFromCsvPipeline(
  db: SupabaseClient,
  params: {
    displayName: string;
    countryCode: string;
    website: string | null;
    linkedin: string | null;
    importBatch: string;
    qa: DockQaInternetResult;
    enrichmentMethodTags: string[];
    sourceRefsExtra: Record<string, unknown>;
    /** Supabase Storage bucket name — maps 1:1 to row for CSV pipeline artifacts. */
    storageBucket: string;
    /** Object key (path) inside the bucket for this row's JSON artifact. */
    storageObjectKey: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const cleaned = cleanCompanyName(params.displayName);
  const normalizedName = cleaned.cleaned.toLowerCase().trim();
  if (!normalizedName) return { ok: false, error: 'empty normalized name' };

  const cc = params.countryCode.toUpperCase();
  const normDomain = websiteToNormalizedDomain(params.website);

  const { data: existing, error: selErr } = await db
    .from('multi_sources_companies_import')
    .select(
      'id, source_types, source_refs, website, linkedin, verifications, dock_verified, enrichment_methods, imported_via, import_batch, storage_bucket, storage_object_key',
    )
    .eq('normalized_name', normalizedName)
    .eq('country_code', cc)
    .maybeSingle();

  if (selErr) return { ok: false, error: selErr.message };

  const now = new Date().toISOString();

  const kw =
    params.qa.keywords_matched.length > 0
      ? params.qa.keywords_matched
      : params.qa.dock_found
        ? ['DJI Dock']
        : [];

  const newEntry: VerificationEntry = {
    method: 'serper',
    hits: params.qa.total_hits,
    url: params.qa.web_mentions[0]?.url ?? params.qa.linkedin_mentions[0]?.url ?? null,
    relevance: params.qa.dock_found ? 'direct' : 'mention_only',
    at: now,
    keywords_matched: kw,
    post_date: null,
    note: params.qa.error
      ? `CSV pipeline QA: ${params.qa.error}`
      : 'CSV pipeline: site:domain "DJI Dock" + optional LinkedIn',
  };

  const prevVer = (existing?.verifications as VerificationEntry[] | null) ?? [];
  const mergedVerifications = [...prevVer, newEntry];

  const priorEvidence =
    existing?.dock_verified === true ||
    (Array.isArray(prevVer) && prevVer.length > 0);

  let dockVerified: boolean | null;
  if (params.qa.dock_found) {
    dockVerified = true;
  } else if (priorEvidence) {
    dockVerified = existing?.dock_verified ?? true;
  } else {
    dockVerified = false;
  }

  const sourceTypes = unionStrings(existing?.source_types as string[] | undefined, [
    'csv_import',
    'dock_qa_serper',
  ]);

  const sourceRefs = mergeSourceRefs(
    mergeSourceRefs(
      existing?.source_refs as Record<string, unknown> | undefined,
      params.sourceRefsExtra,
    ),
    {
      storage_bucket: params.storageBucket,
      storage_object_key: params.storageObjectKey,
    },
  );

  const enrichmentMethods = unionStrings(
    existing?.enrichment_methods as string[] | undefined,
    [...params.enrichmentMethodTags, 'serper_qa'],
  );

  const nextWebsite = (existing?.website as string | null | undefined) ?? params.website ?? null;
  const nextLinkedin = (existing?.linkedin as string | null | undefined) ?? params.linkedin ?? null;

  const dockModels = recomputeDockModelsFromVerifications(mergedVerifications);

  const row = {
    normalized_name: normalizedName,
    country_code: cc,
    display_name: params.displayName,
    website: nextWebsite,
    linkedin: nextLinkedin,
    normalized_domain: normDomain,
    source_types: sourceTypes,
    source_refs: sourceRefs,
    imported_via: (existing?.imported_via as string | null) ?? 'csv_company_pipeline',
    import_batch: (existing?.import_batch as string | null) ?? params.importBatch,
    enrichment_methods: enrichmentMethods,
    dock_verified: dockVerified,
    verifications: mergedVerifications,
    dock_models: dockModels,
    storage_bucket: params.storageBucket,
    storage_object_key: params.storageObjectKey,
    updated_at: now,
  };

  if (!existing?.id) {
    const { error } = await db.from('multi_sources_companies_import').insert(row);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await db
      .from('multi_sources_companies_import')
      .update(row)
      .eq('id', existing.id as string);
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true };
}
