-- pipeline_leads: Kanban-style deal tracking for DSP targets
CREATE TABLE IF NOT EXISTS pipeline_leads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_name         TEXT NOT NULL,
  company_name      TEXT NOT NULL,
  stage             TEXT NOT NULL DEFAULT 'prospect'
                    CHECK (stage IN (
                      'prospect', 'connecting_linkedin', 'connecting_email',
                      'scheduling_meeting', 'sent_to_crm', 'lost_archived'
                    )),
  score             TEXT CHECK (score IN ('HIGH', 'MED')),
  region            TEXT,
  signal            TEXT,
  source            TEXT,
  source_article_id TEXT,
  is_known_partner  BOOLEAN DEFAULT false,
  is_ai_sdr        BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent duplicate active entries for the same company
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_leads_company_active_idx
  ON pipeline_leads (lower(company_name))
  WHERE stage != 'lost_archived';

-- pipeline_events: audit log of stage transitions
CREATE TABLE IF NOT EXISTS pipeline_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES pipeline_leads(id) ON DELETE CASCADE,
  from_stage  TEXT,
  to_stage    TEXT NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pipeline_events_lead_idx
  ON pipeline_events(lead_id);

-- Add status column to discovered_companies for dismiss tracking
ALTER TABLE discovered_companies
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- Separate constraint (ADD COLUMN IF NOT EXISTS doesn't support inline CHECK)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'discovered_companies_status_check'
  ) THEN
    ALTER TABLE discovered_companies
      ADD CONSTRAINT discovered_companies_status_check
      CHECK (status IN ('active', 'dismissed'));
  END IF;
END $$;
