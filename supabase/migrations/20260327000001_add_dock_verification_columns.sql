-- Migration: Add Dock verification + multi-source columns to country_registered_companies
-- Date: 2026-03-27
-- Context: Single-table architecture for multi-country DJI Dock verification pipeline

-- ═══ Renames (clarify existing columns) ═══

-- confidence → source_confidence (was: "is this a drone company?" from SIRENE scoring)
-- Avoid confusion with dock_relevance (which is: "does this company use DJI Dock?")
ALTER TABLE country_registered_companies RENAME COLUMN confidence TO source_confidence;

-- qa_status → dock_qa_status (self-explanatory pipeline status)
ALTER TABLE country_registered_companies RENAME COLUMN qa_status TO dock_qa_status;

-- ═══ Source tracking (3 columns) ═══

-- All source IDs in one place: {"SIRENE": "887953180", "DJI": "1502", "ILT": "NLD-OAT-004"}
ALTER TABLE country_registered_companies ADD COLUMN IF NOT EXISTS source_refs JSONB DEFAULT '{}';

-- Array of sources that mention this company: {sirene, dji_dealer, comet, google_search, chatgpt}
ALTER TABLE country_registered_companies ADD COLUMN IF NOT EXISTS source_types TEXT[] DEFAULT '{}';

-- Lowercase, stripped company name for cross-source dedup
ALTER TABLE country_registered_companies ADD COLUMN IF NOT EXISTS normalized_name TEXT;

-- ═══ Company identity (2 columns) ═══

-- Root domain for cross-source matching: escadrone.com, droneland.nl
ALTER TABLE country_registered_companies ADD COLUMN IF NOT EXISTS normalized_domain TEXT;

-- operator / system_integrator / solution_provider / dealer / media / unknown
ALTER TABLE country_registered_companies ADD COLUMN IF NOT EXISTS role TEXT;

-- ═══ DJI Dock verification (5 columns) ═══

-- Core question: does this company sell/deploy/operate DJI Dock?
-- true = confirmed, false = checked and not found, null = not yet checked
ALTER TABLE country_registered_companies ADD COLUMN IF NOT EXISTS dock_verified BOOLEAN;

-- Which Dock versions: "Dock 1, 2, 3" or "Dock 3" or null
ALTER TABLE country_registered_companies ADD COLUMN IF NOT EXISTS dock_models TEXT;

-- Aggregated relevance level: high / medium / low / none
ALTER TABLE country_registered_companies ADD COLUMN IF NOT EXISTS dock_relevance TEXT;

-- Serper site:domain "DJI Dock" result count (0 = checked, no mention)
ALTER TABLE country_registered_companies ADD COLUMN IF NOT EXISTS serper_hits INT;

-- LinkedIn company page DJI Dock post matches
ALTER TABLE country_registered_companies ADD COLUMN IF NOT EXISTS linkedin_dock_mentions INT;

-- ═══ Evidence + timestamps (2 columns) ═══

-- Best proof link (product page, article, LinkedIn post)
ALTER TABLE country_registered_companies ADD COLUMN IF NOT EXISTS evidence_url TEXT;

-- When QA Agent last ran on this record
ALTER TABLE country_registered_companies ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- ═══ Backfill existing records ═══

-- All existing records were SIRENE imports with qa_status='pending' → set to 'raw'
UPDATE country_registered_companies SET dock_qa_status = 'raw' WHERE dock_qa_status = 'pending';

-- Backfill source_types for existing SIRENE records
UPDATE country_registered_companies
SET source_types = ARRAY['sirene'],
    source_refs = jsonb_build_object('SIRENE', registry_id::text)
WHERE signal_source = 'sirene_bulk_db'
  AND (source_types IS NULL OR source_types = '{}');

-- Backfill normalized_name from company_name (lowercase, strip accents not possible in pure SQL, just lowercase)
UPDATE country_registered_companies
SET normalized_name = lower(trim(company_name))
WHERE normalized_name IS NULL;
