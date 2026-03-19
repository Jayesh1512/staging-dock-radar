-- ═══════════════════════════════════════════════════════════════════════════════
-- Diagnostic: Find buyer entities that leak into the DSP hitlist (Tab 2)
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Query 1: Articles where company field contains a buyer-like name ─────────
-- These leak via Tier 2 fallback when entities[] is empty
SELECT
  id,
  article_id,
  relevance_score,
  company,
  country,
  signal_type,
  entities
FROM scored_articles
WHERE relevance_score >= 50
  AND drop_reason IS NULL
  AND is_duplicate = false
  AND company IS NOT NULL
  AND (entities IS NULL OR jsonb_array_length(entities) = 0)
  AND (
    company ~* '(fire\s*dep|police|sheriff|county|city\s+of|municipality|university|hospital|department\s+of|ministry|task\s*force)'
    OR company ~* '(national\s+guard|air\s+force|army|navy|coast\s+guard|school\s+district)'
  )
ORDER BY relevance_score DESC;

-- ─── Query 2: Entities with operator/si/partner type that look like buyers ───
-- These leak via Tier 1
SELECT
  id,
  article_id,
  relevance_score,
  company,
  e->>'name' AS entity_name,
  e->>'type' AS entity_type
FROM scored_articles,
  jsonb_array_elements(entities) AS e
WHERE relevance_score >= 50
  AND drop_reason IS NULL
  AND is_duplicate = false
  AND e->>'type' IN ('operator', 'si', 'partner')
  AND (
    e->>'name' ~* '(fire\s*dep|police|sheriff|county|city\s+of|municipality|university|hospital|department\s+of|ministry|task\s*force)'
    OR e->>'name' ~* '(national\s+guard|air\s+force|army|navy|coast\s+guard|school\s+district)'
  )
ORDER BY relevance_score DESC;

-- ─── Query 3: All unique company names in the hitlist pipeline ────────────────
-- Review manually for any remaining buyer-like names
SELECT DISTINCT
  COALESCE(e->>'name', company) AS hitlist_company,
  e->>'type' AS entity_type,
  COUNT(*) AS article_count
FROM scored_articles
LEFT JOIN LATERAL jsonb_array_elements(entities) AS e ON true
WHERE relevance_score >= 50
  AND drop_reason IS NULL
  AND is_duplicate = false
  AND (
    e->>'type' IN ('operator', 'si', 'partner')
    OR (entities IS NULL OR jsonb_array_length(entities) = 0)
  )
GROUP BY 1, 2
ORDER BY article_count DESC;
