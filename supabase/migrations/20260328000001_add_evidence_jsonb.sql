-- Add JSONB evidence array column to country_registered_companies
-- Stores all evidence from all sources, each with timestamp, source, type, URL
-- Example: [{"url":"...","source":"serper","type":"product_page","found_at":"...","dock_models":["Dock 2"],"hits":10}]

ALTER TABLE country_registered_companies
  ADD COLUMN IF NOT EXISTS evidence jsonb DEFAULT '[]'::jsonb;

-- Migrate existing evidence_url into the new array (one-time backfill)
-- Only for records that have evidence_url set
UPDATE country_registered_companies
SET evidence = jsonb_build_array(
  jsonb_build_object(
    'url', evidence_url,
    'source', CASE
      WHEN serper_hits > 0 THEN 'serper'
      WHEN signal_source = 'chatgpt' THEN 'chatgpt'
      WHEN signal_source = 'comet' THEN 'comet'
      ELSE 'manual'
    END,
    'type', CASE
      WHEN serper_hits >= 10 THEN 'product_page'
      WHEN serper_hits > 0 THEN 'website_mention'
      WHEN evidence_url LIKE '%linkedin.com%' THEN 'linkedin_post'
      ELSE 'case_study'
    END,
    'found_at', COALESCE(verified_at, created_at)::text,
    'dock_models', CASE
      WHEN dock_models IS NOT NULL AND dock_models != '' THEN to_jsonb(string_to_array(
        regexp_replace(dock_models, 'Dock\s*', '', 'g'), ', '
      ))
      ELSE '[]'::jsonb
    END,
    'hits', COALESCE(serper_hits, 0)
  )
)
WHERE evidence_url IS NOT NULL
  AND (evidence IS NULL OR evidence = '[]'::jsonb);
