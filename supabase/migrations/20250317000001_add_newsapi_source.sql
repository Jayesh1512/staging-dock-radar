-- Add 'newsapi' to the articles source CHECK constraint
-- Previous constraint only allowed: google_news, linkedin, facebook

ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_source_check;
ALTER TABLE articles ADD CONSTRAINT articles_source_check
  CHECK (source IN ('google_news', 'newsapi', 'linkedin', 'facebook'));
