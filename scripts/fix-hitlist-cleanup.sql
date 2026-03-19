-- ═══════════════════════════════════════════════════════════════════════════════
-- Hitlist Cleanup: Fix buyers, duplicates, and data quality issues
-- Run AFTER analyze-hitlist-48.sql to verify what needs fixing
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Fix 1: Anji County → buyer (Chinese county government, not a DSP) ───────
-- Reclassify entity type from operator/si/partner → buyer
UPDATE scored_articles
SET entities = (
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN elem->>'name' ILIKE '%Anji%County%'
        AND elem->>'type' IN ('operator', 'si', 'partner')
      THEN jsonb_set(elem, '{type}', '"buyer"')
      ELSE elem
    END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(entities) AS elem
)
WHERE entities::text ILIKE '%Anji%County%'
  AND relevance_score >= 50;

-- Also null the company field if it's Anji County
UPDATE scored_articles
SET company = NULL
WHERE company ILIKE '%Anji%County%'
  AND relevance_score >= 50;

-- ─── Fix 2: Austintown Fire Department → buyer ───────────────────────────────
UPDATE scored_articles
SET entities = (
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN elem->>'name' ILIKE '%Austintown%'
        AND elem->>'type' IN ('operator', 'si', 'partner')
      THEN jsonb_set(elem, '{type}', '"buyer"')
      ELSE elem
    END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(entities) AS elem
)
WHERE entities::text ILIKE '%Austintown%'
  AND relevance_score >= 50;

UPDATE scored_articles
SET company = NULL
WHERE company ILIKE '%Austintown%'
  AND relevance_score >= 50;

-- ─── Fix 3: PHOTOSOL → buyer (solar PV developer, uses drones internally) ───
-- PHOTOSOL is a French solar energy company — end-user, not a DSP
UPDATE scored_articles
SET entities = (
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN elem->>'name' ILIKE '%PHOTOSOL%'
        AND elem->>'type' IN ('operator', 'si', 'partner')
      THEN jsonb_set(elem, '{type}', '"buyer"')
      ELSE elem
    END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(entities) AS elem
)
WHERE entities::text ILIKE '%PHOTOSOL%'
  AND relevance_score >= 50;

UPDATE scored_articles
SET company = NULL
WHERE company ILIKE '%PHOTOSOL%'
  AND relevance_score >= 50;

-- ─── Fix 4: Normalize US/USA/United States in scored_articles.country ─────────
-- Canonical name is 'US' per COUNTRY_NAME_TO_REGION_KEY
UPDATE scored_articles
SET country = 'US'
WHERE country IN ('USA', 'United States', 'U.S.', 'U.S.A.', 'America')
  AND relevance_score >= 50;

-- ─── Fix 5: Merge "Marut Dronetech" → "Marut Drones" in entities ────────────
-- Same company, different name variant. Standardize to "Marut Drones"
UPDATE scored_articles
SET entities = (
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN elem->>'name' = 'Marut Dronetech'
      THEN jsonb_set(elem, '{name}', '"Marut Drones"')
      ELSE elem
    END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(entities) AS elem
)
WHERE entities::text LIKE '%Marut Dronetech%';

-- Also fix company field
UPDATE scored_articles
SET company = 'Marut Drones'
WHERE company = 'Marut Dronetech';

-- ─── Verify: Show updated hitlist companies ──────────────────────────────────
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
