# Phase 4 Backlog

Items deferred from MVP dry-run (2026-03-19). Revisit when data volume grows.

---

## B1/B2 — `discovered_companies` merge logic broken across incremental runs

**File:** `src/lib/db.ts` — `upsertDiscoveredFromArticles()` (~line 710)

**Problem:**
The upsert-then-read-back-then-merge pattern in `upsertDiscoveredFromArticles` is broken:
1. The initial upsert (`ignoreDuplicates: false`) overwrites `first_seen_at` and `mention_count` on existing rows.
2. The subsequent merge loop reads back the values we just wrote — not the pre-existing DB values.
3. Net result: `mention_count` = articles in the current batch only (never accumulates), `first_seen_at` is reset to current time on every incremental scoring run.

**Impact (MVP):** Low — `mention_count` shown in Tab 2 is computed independently in `hitlist/route.ts` from `scored_articles` grouping (correct). `discovered_companies.mention_count` is only used for ordering in `loadDiscoveredCompanies` (not yet surfaced in UI). `first_seen_at` not surfaced anywhere. Safe to defer.

**Fix when ready:**
- Pre-fetch all existing rows BEFORE the upsert using a single `IN` query
- Build merged values (additive mention_count, preserve earliest first_seen_at, union arrays)
- Single upsert with merged values — eliminates N+1 read queries too
- Side benefit: reduces DB round-trips from O(n) reads to 1 batch read

---

## E1 (deferred variant) — Orphan contact mention_count

When the same orphan contact (no company) appears in multiple articles across runs,
the dedup index (`idx_dc_contact_orphan_dedup`) prevents duplicate rows.
But we don't track how many times they've appeared — only `source_article_id` from first seen.

**Fix when ready:** Add `mention_count` field to `discovered_contacts`, increment on conflict.
