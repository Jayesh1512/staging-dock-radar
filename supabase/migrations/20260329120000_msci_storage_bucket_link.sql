-- Link Storage artifacts to multi_sources_companies_import rows (queryable without parsing JSONB).
-- Together: storage_bucket + storage_object_key = Supabase Storage object id for download.

ALTER TABLE multi_sources_companies_import
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS storage_object_key TEXT;

COMMENT ON COLUMN multi_sources_companies_import.storage_bucket IS 'Supabase Storage bucket name (e.g. csv-company-pipeline). Maps to getPublicUrl / download.';
COMMENT ON COLUMN multi_sources_companies_import.storage_object_key IS 'Object path inside the bucket (e.g. csv-pipeline-AU-20260329/ts_row_0.json).';

CREATE INDEX IF NOT EXISTS idx_msci_storage_bucket ON multi_sources_companies_import(storage_bucket)
  WHERE storage_bucket IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_msci_storage_object ON multi_sources_companies_import(storage_bucket, storage_object_key)
  WHERE storage_bucket IS NOT NULL AND storage_object_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_msci_import_batch ON multi_sources_companies_import(import_batch)
  WHERE import_batch IS NOT NULL;
