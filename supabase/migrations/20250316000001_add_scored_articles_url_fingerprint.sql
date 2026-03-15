-- Add url_fingerprint for dedup by URL params + entities (company, country, city)
ALTER TABLE scored_articles ADD COLUMN IF NOT EXISTS url_fingerprint TEXT;

-- Backfill: use normalized_url so existing rows participate in fingerprint dedup until re-scored
UPDATE scored_articles
SET url_fingerprint = COALESCE(normalized_url, '')
WHERE url_fingerprint IS NULL OR url_fingerprint = '';

CREATE INDEX IF NOT EXISTS idx_scored_url_fingerprint ON scored_articles(url_fingerprint) WHERE url_fingerprint IS NOT NULL;
