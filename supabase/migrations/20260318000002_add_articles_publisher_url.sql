-- Add publisher_url for social sources (e.g., LinkedIn).
-- This stores the profile URL of the person/org that published the post.

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS publisher_url text;

