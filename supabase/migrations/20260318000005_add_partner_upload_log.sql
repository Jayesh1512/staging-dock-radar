-- DSP Hit List: Add partner_upload_log table to track upload events
CREATE TABLE IF NOT EXISTS partner_upload_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename       text NOT NULL,
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  added          int NOT NULL DEFAULT 0,
  updated        int NOT NULL DEFAULT 0,
  skipped        int NOT NULL DEFAULT 0,
  total_partners int NOT NULL DEFAULT 0
);
