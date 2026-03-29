-- Ensure multi_sources_companies_import has display_name column.
-- Some older environments were created before display_name was added to the base DDL.
-- This migration is safe to run multiple times.

ALTER TABLE multi_sources_companies_import
  ADD COLUMN IF NOT EXISTS display_name TEXT;

