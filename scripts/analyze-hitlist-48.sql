-- ═══════════════════════════════════════════════════════════════════════════════
-- Deep Analysis: All companies currently in the hitlist pipeline
-- Run in Supabase SQL Editor after running enrich-partners-from-csv.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Master Query: Every company that would appear in Tab 2 ──────────────────
-- Simulates the hitlist route's extraction logic:
--   Tier 1: entities with type operator/si/partner
--   Tier 2: company field when entities is empty (excluding buyer entities)
-- Groups by normalized company name (lowercase, suffix-stripped)

WITH extracted AS (
  -- Tier 1: from entities
  SELECT
    sa.id AS scored_id,
    sa.article_id,
    sa.relevance_score,
    sa.country,
    sa.industry,
    e->>'name' AS company_name,
    e->>'type' AS entity_type,
    'tier1_entity' AS extraction_source
  FROM scored_articles sa,
    jsonb_array_elements(sa.entities) AS e
  WHERE sa.relevance_score >= 50
    AND sa.drop_reason IS NULL
    AND sa.is_duplicate = false
    AND e->>'type' IN ('operator', 'si', 'partner')

  UNION ALL

  -- Tier 2: from company field when no qualifying entities
  SELECT
    sa.id AS scored_id,
    sa.article_id,
    sa.relevance_score,
    sa.country,
    sa.industry,
    sa.company AS company_name,
    'company_fallback' AS entity_type,
    'tier2_company' AS extraction_source
  FROM scored_articles sa
  WHERE sa.relevance_score >= 50
    AND sa.drop_reason IS NULL
    AND sa.is_duplicate = false
    AND sa.company IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(sa.entities) AS e2
      WHERE e2->>'type' IN ('operator', 'si', 'partner')
    )
)
SELECT
  company_name,
  entity_type,
  COUNT(*) AS article_count,
  string_agg(DISTINCT country, ', ' ORDER BY country) AS countries,
  string_agg(DISTINCT industry, ', ' ORDER BY industry) AS industries,
  string_agg(DISTINCT extraction_source, ', ') AS source,
  MIN(relevance_score) AS min_score,
  MAX(relevance_score) AS max_score
FROM extracted
WHERE company_name IS NOT NULL
GROUP BY company_name, entity_type
ORDER BY article_count DESC, company_name;
