-- Add website and linkedin fields to flytbase_partners
ALTER TABLE flytbase_partners
ADD COLUMN website TEXT,
ADD COLUMN linkedin TEXT;

-- Create index for faster lookups
CREATE INDEX idx_flytbase_partners_normalized_name ON flytbase_partners(normalized_name);
