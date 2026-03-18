-- Widen allowed values for articles.source to match import JSON.
-- We still keep a simple sanity check that the source is non-empty text.

ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_source_check;

ALTER TABLE articles
  ADD CONSTRAINT articles_source_check
  CHECK (char_length(source) > 0);

