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
    /** Data source name, e.g. 'nl_aviation_registry', 'fr_sirene' */
    sourceName: string;
    /** Original uploaded filename for audit trail */
    sourceFileName?: string | null;
    /** When set, stored as registry reference in source_refs */
    registryId?: string | null;
    /** When set (CSV hunter), stored in source_refs instead of registry id */
    csvRowIndex?: number | null;
    qa: DockQaInternetResult;
  },
): Promise<{ ok: boolean; error?: string; dockVerified?: boolean | null; skipped?: boolean }> {
  const cleaned = cleanCompanyName(params.displayName);
  const normalizedName = cleaned.cleaned.toLowerCase().trim();
  if (!normalizedName) return { ok: false, error: 'empty normalized name', dockVerified: null };

  const cc = params.countryCode.toUpperCase();
  const normDomain = websiteToNormalizedDomain(params.website);

  const { data: existing, error: selErr } = await db
    .from('multi_sources_companies_import')
    .select(
      'id, display_name, source_types, source_refs, website, linkedin, verifications, dock_verified, enrichment_methods, imported_via, import_batch',
    )
    .eq('normalized_name', normalizedName)
    .eq('country_code', cc)
    .maybeSingle();

  if (selErr) return { ok: false, error: selErr.message, dockVerified: null };

  const now = new Date().toISOString();

  const kw =
    params.qa.keywords_matched.length > 0
      ? params.qa.keywords_matched
      : params.qa.dock_found
        ? ['DJI Dock']
        : [];

  const newEntry: VerificationEntry = {
    method: 'serper_dock_verify',
    hits: params.qa.total_hits,
    url: params.qa.web_mentions[0]?.url ?? params.qa.linkedin_mentions[0]?.url ?? null,
    relevance: params.qa.dock_found ? 'direct' : 'mention_only',
    at: now,
    keywords_matched: kw,
    post_date: null,
    note: params.qa.error
      ? `error: ${params.qa.error}`
      : `site:${params.qa.domain} → ${params.qa.total_hits} hits`,
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
    // Preserve prior evidence — don't downgrade
    dockVerified = existing?.dock_verified ?? true;
  } else {
    dockVerified = false;
  }

  // source_types = data origin (e.g. 'nl_aviation_registry', 'fr_sirene')
  const sourceTypes = unionStrings(existing?.source_types as string[] | undefined, [
    params.sourceName,
  ]);

  // source_refs = audit trail (file name, row index, registry IDs)
  const refEntry: Record<string, unknown> = {};
  if (params.sourceFileName) refEntry.file = params.sourceFileName;
  if (params.csvRowIndex != null) refEntry.row_index = params.csvRowIndex;
  if (params.registryId) refEntry.registry_id = params.registryId;
  refEntry.import_batch = params.importBatch;

  const sourceRefs = mergeSourceRefs(
    existing?.source_refs as Record<string, unknown> | undefined,
    { [params.sourceName]: refEntry },
  );

  const enrichmentMethods = unionStrings(
    existing?.enrichment_methods as string[] | undefined,
    ['serper_dock_verify'],
  );

  const nextWebsite = (existing?.website as string | null | undefined) ?? params.website ?? null;
  const nextLinkedin = (existing?.linkedin as string | null | undefined) ?? params.linkedin ?? null;

  const dockModels = recomputeDockModelsFromVerifications(mergedVerifications);

  // Write ALL records — dock_verified true, false, or null.
  // All uploaded data goes into the master table. Cleanup via dock_qa_status later.

  const row = {
    normalized_name: normalizedName,
    country_code: cc,
    // Prefer trade_name-backed display label; also backfill legacy company_name column when present.
    display_name: params.displayName,
    company_name: params.displayName,
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
    if (error) return { ok: false, error: error.message, dockVerified: null };
  } else {
    const { error } = await db
      .from('multi_sources_companies_import')
      .update(row)
      .eq('id', existing.id as string);
    if (error) return { ok: false, error: error.message, dockVerified: null };
  }

  return { ok: true, dockVerified };
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
): Promise<{ ok: boolean; error?: string; dockVerified?: boolean | null }> {
  const cleaned = cleanCompanyName(params.displayName);
  const normalizedName = cleaned.cleaned.toLowerCase().trim();
  if (!normalizedName) return { ok: false, error: 'empty normalized name', dockVerified: null };

  const cc = params.countryCode.toUpperCase();
  const normDomain = websiteToNormalizedDomain(params.website);

  const { data: existing, error: selErr } = await db
    .from('multi_sources_companies_import')
    .select(
      'id, display_name, source_types, source_refs, website, linkedin, verifications, dock_verified, enrichment_methods, imported_via, import_batch, storage_bucket, storage_object_key',
    )
    .eq('normalized_name', normalizedName)
    .eq('country_code', cc)
    .maybeSingle();

  if (selErr) return { ok: false, error: selErr.message, dockVerified: null };

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
    // Prefer trade_name-backed display label; also backfill legacy company_name column when present.
    display_name: params.displayName,
    company_name: params.displayName,
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
    if (error) return { ok: false, error: error.message, dockVerified: null };
  } else {
    const { error } = await db
      .from('multi_sources_companies_import')
      .update(row)
      .eq('id', existing.id as string);
    if (error) return { ok: false, error: error.message, dockVerified: null };
  }

  return { ok: true, dockVerified };
}
