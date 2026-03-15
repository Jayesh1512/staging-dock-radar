-- Add normalized_url to scored_articles for URL-based dedup (skip scoring if URL already scored)
ALTER TABLE scored_articles ADD COLUMN IF NOT EXISTS normalized_url TEXT;

-- Backfill from articles so existing rows participate in URL dedup
UPDATE scored_articles sa
SET normalized_url = a.normalized_url
FROM articles a
WHERE sa.article_id = a.id AND (sa.normalized_url IS NULL OR sa.normalized_url = '');

CREATE INDEX IF NOT EXISTS idx_scored_normalized_url ON scored_articles(normalized_url) WHERE normalized_url IS NOT NULL;
