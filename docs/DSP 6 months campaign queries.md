Data Model for the DSP Repository
Rather than a new table, use a campaign flag + post-processing view:


runs table → add column: campaign TEXT (null for regular, 'dsp_6mo_sweep' for this)

Query at end: 
SELECT 
  e.name as company,
  COUNT(*) as mention_count,
  ARRAY_AGG(DISTINCT sa.country) as regions,
  ARRAY_AGG(DISTINCT sa.use_case) as use_cases,
  ARRAY_AGG(DISTINCT sa.signal_type) as signal_types,
  MAX(sa.relevance_score) as peak_score,
  BOOL_OR(sa.flytbase_mentioned) as flytbase_connection
FROM scored_articles sa
JOIN articles a ON sa.article_id = a.id
JOIN runs r ON a.run_id = r.id,
JSONB_ARRAY_ELEMENTS(sa.entities) e
WHERE r.campaign = 'dsp_6mo_sweep'
  AND e->>'type' IN ('si', 'operator', 'partner')
  AND sa.is_duplicate = false
  AND sa.relevance_score >= 40
GROUP BY e.name
ORDER BY mention_count DESC, peak_score DESC
This gives you: company → how often mentioned → which regions → what they do → how strong the signals are.