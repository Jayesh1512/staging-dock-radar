-- DSP Hit List: Add flytbase_partners table to store known partners
CREATE TABLE IF NOT EXISTS flytbase_partners (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  normalized_name text NOT NULL,
  region          text,
  type            text NOT NULL DEFAULT 'partner',
  domain          text,
  country         text,
  notes           text,
  last_synced_at  timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS flytbase_partners_normalized_name_idx
  ON flytbase_partners (normalized_name);
