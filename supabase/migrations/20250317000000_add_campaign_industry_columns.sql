-- Campaign support: tag runs with a campaign name, store industry on scored articles
ALTER TABLE runs ADD COLUMN IF NOT EXISTS campaign TEXT;
ALTER TABLE scored_articles ADD COLUMN IF NOT EXISTS industry TEXT;
