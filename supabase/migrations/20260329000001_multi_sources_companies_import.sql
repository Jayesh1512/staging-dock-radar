-- multi_sources_companies_import: unified import + verification table (see docs/DEVELOPMENT_GUIDE.md)
-- Conflict key: normalized_name + country_code

CREATE TABLE IF NOT EXISTS multi_sources_companies_import (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  normalized_name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  display_name TEXT NOT NULL,

  website TEXT,
  linkedin TEXT,
  normalized_domain TEXT,

  source_types TEXT[] NOT NULL DEFAULT '{}',
  source_refs JSONB NOT NULL DEFAULT '{}',

  imported_via TEXT,
  import_batch TEXT,
  enrichment_methods TEXT[] NOT NULL DEFAULT '{}',

  dock_verified BOOLEAN,
  verifications JSONB NOT NULL DEFAULT '[]',
  dock_models TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT multi_sources_companies_import_unique UNIQUE (normalized_name, country_code)
);

CREATE INDEX IF NOT EXISTS idx_msci_country ON multi_sources_companies_import(country_code);
CREATE INDEX IF NOT EXISTS idx_msci_domain ON multi_sources_companies_import(normalized_domain);
