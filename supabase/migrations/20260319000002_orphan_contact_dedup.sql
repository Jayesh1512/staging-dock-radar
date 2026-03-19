-- Dedup orphan contacts (company_normalized_name IS NULL) by name_normalized.
-- The existing idx_dc_contact_dedup only applies WHERE company_normalized_name IS NOT NULL,
-- so orphan contacts had no uniqueness constraint and duplicated on every scoring run.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dc_contact_orphan_dedup
  ON discovered_contacts(name_normalized)
  WHERE company_normalized_name IS NULL;
