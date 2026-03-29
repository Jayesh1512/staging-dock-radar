import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_BUCKET = 'csv-company-pipeline';

export function getCsvPipelineBucket(): string {
  return process.env.SUPABASE_CSV_PIPELINE_BUCKET?.trim() || DEFAULT_BUCKET;
}

/**
 * Uploads one JSON artifact per CSV row (enrichment + QA + raw columns).
 * Create the bucket in Supabase Dashboard (private) and grant service role upload.
 */
export async function uploadCsvPipelineArtifact(
  db: SupabaseClient,
  path: string,
  payload: unknown,
  bucket = getCsvPipelineBucket(),
): Promise<{ ok: boolean; path: string; error?: string }> {
  const body = JSON.stringify(payload, null, 2);
  const { error } = await db.storage.from(bucket).upload(path, body, {
    contentType: 'application/json; charset=utf-8',
    upsert: true,
  });
  if (error) return { ok: false, path, error: error.message };
  return { ok: true, path };
}
