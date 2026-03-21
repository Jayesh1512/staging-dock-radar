-- DJI Resellers table: cleaned data from DJI "Where to Buy" enterprise page
-- Source: dji-where-to-buy-snapshot-all-f7fd6e17ef.json (4,491 records)
-- Apply this via Supabase SQL Editor, then run: node scripts/seed-dji-resellers.mjs

CREATE TABLE IF NOT EXISTS dji_resellers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  dealer_type TEXT NOT NULL,  -- Enterprise Dealer, Professional Dealer, Authorized Dealer, Retail Store, Agriculture Dealer, Delivery Dealer
  priority TEXT NOT NULL DEFAULT 'low',  -- high (enterprise/pro outside China), medium (authorized outside China + all in China), low (retail/ag/delivery)
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  country_code TEXT,  -- ISO 2-letter
  continent TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  linkedin_url TEXT,
  linkedin_scanned_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_dji_resellers_priority ON dji_resellers (priority);
CREATE INDEX idx_dji_resellers_dealer_type ON dji_resellers (dealer_type);
CREATE INDEX idx_dji_resellers_country_code ON dji_resellers (country_code);
CREATE INDEX idx_dji_resellers_continent ON dji_resellers (continent);

-- Enable RLS
ALTER TABLE dji_resellers ENABLE ROW LEVEL SECURITY;

-- Allow authenticated read access
CREATE POLICY "Allow authenticated read access on dji_resellers"
  ON dji_resellers FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated insert/update
CREATE POLICY "Allow authenticated write access on dji_resellers"
  ON dji_resellers FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);