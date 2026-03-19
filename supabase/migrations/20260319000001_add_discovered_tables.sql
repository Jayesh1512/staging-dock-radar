-- discovered_companies: aggregated, enrichable company profiles extracted from articles
-- Populated by scoring pipeline + backfill script. Enriched by Comet/manual.
CREATE TABLE IF NOT EXISTS discovered_companies (
  normalized_name   TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL,
  types             JSONB DEFAULT '[]'::jsonb,    -- ['operator','si','buyer','oem','partner','regulator']
  website           TEXT,
  linkedin          TEXT,
  countries         JSONB DEFAULT '[]'::jsonb,    -- normalized via COUNTRY_NAME_MAP
  industries        JSONB DEFAULT '[]'::jsonb,
  signal_types      JSONB DEFAULT '[]'::jsonb,
  mention_count     INTEGER DEFAULT 0,            -- unique article count
  first_seen_at     TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ DEFAULT NOW(),
  enriched_at       TIMESTAMPTZ,
  enriched_by       TEXT,                         -- 'scoring' | 'comet' | 'manual'
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- discovered_contacts: people linked to discovered companies
-- company_normalized_name is nullable for orphan contacts (persons without a matching company)
CREATE TABLE IF NOT EXISTS discovered_contacts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_normalized_name TEXT,             -- nullable; references discovered_companies(normalized_name) when set
  name                    TEXT NOT NULL,
  name_normalized         TEXT NOT NULL,
  role                    TEXT,
  organization            TEXT,
  linkedin                TEXT,
  email                   TEXT,
  source_article_id       TEXT,
  enriched_at             TIMESTAMPTZ,
  enriched_by             TEXT,             -- 'scoring' | 'comet' | 'manual'
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Dedup contacts: same normalized name + same company = same person
CREATE UNIQUE INDEX IF NOT EXISTS idx_dc_contact_dedup
  ON discovered_contacts(name_normalized, company_normalized_name)
  WHERE company_normalized_name IS NOT NULL;

-- Fast lookup of contacts by company
CREATE INDEX IF NOT EXISTS idx_dc_contacts_company
  ON discovered_contacts(company_normalized_name)
  WHERE company_normalized_name IS NOT NULL;
