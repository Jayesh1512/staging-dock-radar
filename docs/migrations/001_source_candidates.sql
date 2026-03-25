-- Migration 001: Source Candidates Staging Pipeline
-- Run this in Supabase SQL Editor (one-time setup)
-- Project: Dock Radar — France Productionalization

-- ═══════════════════════════════════════════════════════
-- Table 1: source_import_runs — tracks each import action
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS source_import_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type     TEXT NOT NULL
                  CHECK (source_type IN ('dji_reseller_list','govt_registry','google_search','comet','team_intel')),
  country_code    TEXT NOT NULL,
  run_label       TEXT,

  -- Counts
  total_input     INTEGER DEFAULT 0,
  after_dedup     INTEGER DEFAULT 0,
  imported        INTEGER DEFAULT 0,
  errors          INTEGER DEFAULT 0,

  -- Status
  status          TEXT DEFAULT 'running'
                  CHECK (status IN ('running','completed','failed')),
  error_message   TEXT,

  -- Upload info (for external imports)
  filename        TEXT,
  column_mapping  JSONB,

  started_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════
-- Table 2: source_candidates — staging table for all sources
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS source_candidates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Import metadata
  source_type       TEXT NOT NULL
                    CHECK (source_type IN ('dji_reseller_list','govt_registry','google_search','comet','team_intel')),
  source_run_id     UUID REFERENCES source_import_runs(id),
  country_code      TEXT NOT NULL,

  -- Company identity
  company_name      TEXT NOT NULL,
  normalized_name   TEXT NOT NULL,
  normalized_domain TEXT,              -- root domain extracted from website (e.g. "escadrone.com")

  -- Contact surfaces (may be NULL — enrichment fills later)
  website           TEXT,
  linkedin_url      TEXT,

  -- Company details
  city              TEXT,
  employee_count    INTEGER,

  -- Scoring
  raw_score         INTEGER DEFAULT 0,
  confidence        TEXT DEFAULT 'low'
                    CHECK (confidence IN ('high','medium','low')),
  entity_type       TEXT DEFAULT 'unknown'
                    CHECK (entity_type IN ('operator','reseller','media','unknown')),

  -- Signal traceability
  signal_keyword    TEXT,
  evidence_url      TEXT,
  snippet           TEXT,
  detected_at       TIMESTAMPTZ,

  -- Extended data
  all_urls          JSONB,             -- all source URLs [{url, type, platform, title, snippet}]
  source_meta       JSONB,             -- source-specific: {dealer_type, registry_id, naf_code, ...}

  -- Multi-source tracking (updated during dedup)
  source_count      INTEGER DEFAULT 1,

  -- Processing status
  status            TEXT DEFAULT 'imported'
                    CHECK (status IN ('imported','merged','dismissed','duplicate')),
  status_reason     TEXT,
  merged_to         TEXT,              -- normalized_name in discovered_companies

  created_at        TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate imports from same source
  UNIQUE(source_type, normalized_name, country_code)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sc_country ON source_candidates(country_code);
CREATE INDEX IF NOT EXISTS idx_sc_status ON source_candidates(status);
CREATE INDEX IF NOT EXISTS idx_sc_source ON source_candidates(source_type);
CREATE INDEX IF NOT EXISTS idx_sc_batch ON source_candidates(source_run_id);
CREATE INDEX IF NOT EXISTS idx_sc_name ON source_candidates(normalized_name);
CREATE INDEX IF NOT EXISTS idx_sc_domain ON source_candidates(normalized_domain);

-- ═══════════════════════════════════════════════════════
-- Alter discovered_companies — add source tracking columns
-- ═══════════════════════════════════════════════════════

ALTER TABLE discovered_companies
  ADD COLUMN IF NOT EXISTS source_signals  JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS source_count    INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS confidence      TEXT DEFAULT 'medium';
