# Backlog: DB Cleanup — Last Night's LinkedIn Campaign Articles

**Date:** 22 Mar 2026
**Status:** Ready to execute
**Priority:** Low (non-blocking, cleanup)

---

## Context

The overnight LinkedIn scanner (21-22 Mar) stored 2,349 articles. Only 125 mention dock keywords (DJI Dock, Dock, drone-in-a-box). The remaining 2,224 are noise (birthday posts, hiring, trade shows, generic DJI product posts).

## Action

Delete 2,224 irrelevant articles from last night's campaign. Skip 25 that have `scored_articles` entries.

### Query to run in Supabase SQL Editor

```sql
DELETE FROM articles
WHERE source = 'linkedin'
  AND run_id LIKE 'run_li_company_%'
  AND created_at >= '2026-03-21T16:00:00'
  AND (COALESCE(title, '') || ' ' || COALESCE(snippet, '')) !~* '\b(dji\s*dock|dock\s*[23]?|drone.in.a.box)\b'
  AND id NOT IN (SELECT article_id FROM scored_articles);
```

### Expected result

- Deletes: ~2,199 rows (2,224 minus 25 with scored_articles)
- Articles table: 3,118 → ~919
- Keeps: 125 dock-relevant + 25 scored + all pre-campaign articles
- Does NOT touch: scored_articles, runs, scan_log, or any non-campaign articles

### Future prevention

Fix 2 (shipped) now filters LinkedIn company posts before storage — only keyword-relevant posts are stored going forward.
