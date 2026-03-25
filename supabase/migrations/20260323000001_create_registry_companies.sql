-- country_registered_companies: Country-level company registry data (SIRENE, Companies House, etc.)
-- Generic schema that accommodates any country's business registry format.
-- One row per company per country. QA workflow: pending → approved → rejected → merged.

CREATE TABLE IF NOT EXISTS country_registered_companies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core identity (generic across all country registries)
  registry_id       TEXT NOT NULL,              -- FR: SIREN, UK: company_number, DE: handelsregister_nr
  company_name      TEXT NOT NULL,
  trade_name        TEXT,
  acronym           TEXT,
  activity_code     TEXT,                       -- FR: NAF, UK: SIC, DE: WZ, IT: ATECO, ES: CNAE
  legal_form_code   TEXT,
  employee_band     TEXT,                       -- Raw code from registry (country-specific)
  employee_estimate INTEGER,                    -- Normalized headcount estimate for cross-country sorting
  has_employees     BOOLEAN DEFAULT false,
  company_category  TEXT,                       -- FR: PME/ETI/GE, UK: SME/Large
  founded_date      TEXT,                       -- Raw string (format varies by country)
  city              TEXT,                       -- City / commune (from establishment-level registry data)
  address           TEXT,                       -- Full address string (street + postal code + city)
  country_code      TEXT NOT NULL,              -- ISO 2-letter: FR, DE, UK, ES, IT, NL, etc.

  -- Signal source metadata
  signal_source     TEXT,                       -- sirene_bulk_db, companies_house, handelsregister, etc.
  filter_version    TEXT,                       -- waterfall_v1, waterfall_v2, etc.
  extracted_at      TIMESTAMPTZ,               -- When the waterfall script ran
  match_keyword     TEXT,                       -- Which keyword matched: drone, uav, telepilot, rpas (from script or re-derived)

  -- Scoring
  composite_score   INTEGER DEFAULT 0,          -- Original waterfall score (readonly, from CSV)
  confidence        TEXT DEFAULT 'medium'        -- high / medium / low (derived during import)
                    CHECK (confidence IN ('high', 'medium', 'low')),
  score_breakdown   JSONB,                      -- Component analysis for UI display (readonly)
  rank              INTEGER,                    -- Within-country rank from waterfall
  notes             TEXT,

  -- Enrichment (editable by reviewer)
  website           TEXT,
  linkedin          TEXT,
  linkedin_followers INTEGER,

  -- QA workflow
  qa_status         TEXT NOT NULL DEFAULT 'pending'
                    CHECK (qa_status IN ('pending', 'approved', 'rejected', 'merged')),
  qa_notes          TEXT,
  reviewed_at       TIMESTAMPTZ,
  merged_to         TEXT,                       -- normalized_name in discovered_companies (set on merge)

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(registry_id, country_code)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_country_registered_companies_score
  ON country_registered_companies(composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_country_registered_companies_country
  ON country_registered_companies(country_code);
CREATE INDEX IF NOT EXISTS idx_country_registered_companies_qa_status
  ON country_registered_companies(qa_status);
CREATE INDEX IF NOT EXISTS idx_country_registered_companies_confidence
  ON country_registered_companies(confidence);
