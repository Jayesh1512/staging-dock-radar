-- Add enrichment columns to discovered_companies for registry merge and company data
ALTER TABLE discovered_companies ADD COLUMN IF NOT EXISTS employee_count TEXT;
ALTER TABLE discovered_companies ADD COLUMN IF NOT EXISTS founded_year INTEGER;
ALTER TABLE discovered_companies ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE discovered_companies ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'article';
-- source values: 'article' (from news/linkedin scoring), 'country_registry', 'manual', 'dji_reseller'
