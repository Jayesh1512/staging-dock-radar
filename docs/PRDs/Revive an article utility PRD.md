# PRD — Article Rescue / Revive Utility

**Project:** Dock Radar
**Status:** Ready to build
**Date:** 2026-03-17
**Trigger:** Real article loss discovered during testing — Yonkers Police drone deployment story missed due to two compounding bugs now fixed.

---

## 1. Problem Statement

The Dock Radar scoring pipeline drops articles for several automated reasons (dedup, low score, body fetch failure). Most of the time this is correct. Occasionally a genuinely valuable lead gets dropped for the wrong reason — and there is currently no way to recover it without manual DB surgery.

Users need a lightweight, self-service way to look up any article by URL, see why it was dropped, and push it back through the scoring engine with one click.

---

## 2. Real-World Trigger — The Yonkers Case

This utility was conceived after discovering the following article was invisible in all three steps of the tool:

> **Yonkers Police Department Deploys Citywide Drone as a First Responder Program**
> https://yonkerstimes.com/yonkers-police-department-deploys-citywide-drone-as-a-first-responder-program/

### DB State at Discovery (2026-03-17)

| Field | Value |
|-------|-------|
| Article ID | `article_1773670911060_1` |
| Run | `run_202603161421454` (March 16, 14:21 UTC) |
| Source | Google News (stored as GN redirect; `resolved_url: null`) |
| Published | 2026-03-14 |
| `relevance_score` | **0** |
| `is_duplicate` | **true** |
| `drop_reason` | `"Already captured in a previous run"` |
| `status` | `new` |
| `actions_taken` | `[]` — never reached Step 3 |

The article never appeared in Step 3 (Active Queue), Reviewed tab, or Bookmarks — it was invisible everywhere because it failed three simultaneous queue filters: `score >= minScore`, `!drop_reason`, `!is_duplicate`.

### Root Cause — Two Compounding Bugs

**Bug 1 — `ever_queued` column missing from Supabase schema**
The score route calls `markArticlesAsEverQueued()` to prevent any article from being re-scored in future runs. But the `ever_queued` column didn't exist in the DB. The code has a silent try/catch that returns an empty set on column error. The protection gate was completely inoperative for all prior runs.

**Bug 2 — URL dedup placeholder overwrote a real prior LLM score**
Timeline:
- **T1 (March 16, ~14:21–17:00):** Article collected in `run_202603161421454`, scored via LLM, received a real score (estimated 70–85 based on content — named law enforcement agency + active citywide drone deployment program). Stored in `scored_articles` with real values.
- **T2 (March 17, 08:03):** Same article appeared in a later scoring batch. The `ever_queued` gate failed silently (Bug 1). `loadDedupKeysFromScoredArticles()` found the URL fingerprint from T1 → URL dedup fired → wrote `{score: 0, is_duplicate: true, drop_reason: "Already captured..."}` → **upsert on `article_id` overwrote T1's real score permanently.**

### Fixes Implemented (2026-03-17)

1. **`ever_queued` column added** to Supabase `articles` table (`ALTER TABLE articles ADD COLUMN ever_queued boolean DEFAULT false`). The gate now works correctly — articles that reach the queue are protected from re-scoring.

2. **URL dedup overwrite protection** added to `/api/score/route.ts`. Before writing a zero-score placeholder for URL-dedup articles, the code now checks `loadScoredByArticleIds()` for that article. If a real scored record already exists, the placeholder is skipped and the existing score is returned unchanged. Both the early-return branch and the main pipeline branch are fixed.

The Yonkers article's original score is permanently lost (upsert overwrote it). The Rescue utility exists to recover articles in this state going forward.

---

## 3. Goals

- Allow a user to paste any article URL and see its current DB state instantly
- Surface the reason it was dropped in plain language
- Provide a one-click Re-score that bypasses the stale dedup/ever_queued blocks
- If re-score passes threshold → article appears in Step 3 queue immediately (no page refresh)
- If re-score is below threshold → show score + manual override slider
- Minimal code surface — reuse existing `/api/score` pipeline entirely

## 4. Non-Goals (v1)

- Injecting brand-new URLs never collected by any run (different feature — "Manual Add")
- Bulk rescue of multiple articles at once
- Editing article metadata (title, publisher, snippet) before re-scoring
- Undo / rollback of the rescue action

---

## 5. User Flow

```
Navbar → [↺ Rescue] button
  → compact modal opens
  → user pastes URL or types title keywords
  → [Search] → shows matched article card
  → card shows: title, publisher, run date, current score, drop reason, is_duplicate flag
  → [Re-score] button
  → spinner while scoring runs
  → success: new score shown + "Added to Queue" toast (if ≥ minScore)
  → if score < minScore: score badge + manual override slider (0–100) + [Confirm] button
  → on confirm: article appears in Step 3 queue immediately
```

---

## 6. URL Lookup Strategy

The article URL a user has in hand (e.g. `yonkerstimes.com/...`) is often NOT what's stored in `articles.url` (which is the Google News redirect). The lookup must try multiple strategies in order:

| Priority | Strategy | Why |
|----------|-----------|-----|
| 1 | `articles.url = exact match` | Direct match (non-GN sources) |
| 2 | `articles.resolved_url = exact match` | GN articles that were resolved during scoring |
| 3 | `articles.url ILIKE %domain%path%` | Partial match on path slug |
| 4 | `scored_articles.url_fingerprint = computed fingerprint` | URL fingerprint match |
| 5 | Full-text title search | Last resort — user may have pasted a title instead of URL |

Returns: the matched `Article` + its `ScoredArticle` record, or a "not found" state.

---

## 7. Re-score Bypass Flags

Two existing pipeline gates must be skipped for a rescue:

### Gate 1 — `ever_queued` gate
Normal: skips articles where `ever_queued = true` to prevent queue duplication.
Rescue bypass: pass `forceRescore: true` in the request body. The score route skips the `ever_queued` check for this article. After successful rescue, `markArticlesAsEverQueued` still fires (correct — we DO want future runs to skip it).

### Gate 2 — URL fingerprint dedup
Normal: if the article's URL fingerprint is already in `scored_articles`, it's skipped and a zero placeholder is written.
Rescue bypass: `forceRescore: true` also skips the URL fingerprint dedup check. The article proceeds to the full LLM pipeline, body fetch, Gate 2 semantic dedup, freshness boost, etc.

### What still runs on re-score
- Article body fetch (GN redirect will now be resolved → `resolved_url` populated for first time)
- Full LLM scoring with `SCORING_SYSTEM_PROMPT`
- Gate 2 semantic dedup (`gateTwoDedup`) — see Gap 4 below
- Freshness boost (+10 pts if published within 24h — likely not applicable for older articles)
- `markArticlesAsEverQueued` on success

---

## 8. Gap / Risk Register

| # | Gap | Impact | Mitigation |
|---|-----|--------|------------|
| G1 | User has real URL; DB stores GN redirect | Lookup fails silently | Multi-strategy URL lookup (see §6) |
| G2 | `forceRescore` bypasses URL dedup → article re-scores correctly, but URL fingerprint was already in DB | None — Fix 2 ensures existing score is preserved, not overwritten | Bypass writes new real score via upsert |
| G3 | Re-score result still below `minScore` | Article not added to queue automatically | Show score + manual override slider |
| G4 | Gate 2 (semantic dedup) fires on re-score — same company+country+signal already in queue | Article marked `is_duplicate: true` legitimately | UI shows "This story may already be captured as [other article]" with option to force-add |
| G5 | Article body fetch fails / paywalled | Score based on snippet only (same as original T1) | Graceful — scoring prompt handles snippet-only input |
| G6 | Revived article not visible until page refresh | User sees nothing despite success | `/api/revive` returns `ArticleWithScore`; caller pushes directly into `articles` state in `page.tsx` |
| G7 | No audit trail — can't tell a revived article from a normal one | Harder to debug future issues | Add `'revived'` to `ArticleAction` type + `actions_taken` array (minor type + DB change) |
| G8 | Article never in DB at all (user found it externally) | Cannot rescue what was never collected | Show clear message: "Not in database — run a collection with these keywords: [extracted from URL slug]" |
| G9 | Concurrent rescue + normal scoring run on same article | Last upsert wins — low risk for internal tool | Acceptable for v1 |

---

## 9. API Design

### `POST /api/revive`

**Request:**
```typescript
{
  url?: string;          // Article URL the user has (real or GN redirect)
  articleId?: string;    // Direct ID if known
  manualScore?: number;  // 0-100 override — skips LLM if provided
}
```

**Logic:**
1. Look up article using multi-strategy URL lookup (§6)
2. If not found → return `{ found: false, suggestion: string }`
3. If found + `manualScore` provided → write score directly to `scored_articles`, set `is_duplicate: false`, `drop_reason: null`, `status: 'new'`, call `markArticlesAsEverQueued`
4. If found + no `manualScore` → call internal score pipeline with `forceRescore: true` for this single article
5. Return full `ArticleWithScore` + `{ wasFound: true, previousState: { score, drop_reason, is_duplicate } }`

**Response:**
```typescript
{
  found: boolean;
  article?: ArticleWithScore;
  previousState?: {
    score: number;
    drop_reason: string | null;
    is_duplicate: boolean;
  };
  suggestion?: string; // shown when found: false
}
```

---

## 10. UI Spec

### Navbar Button
- Position: right side of navbar, before Analytics button
- Label: `↺ Rescue` (or just `↺` with tooltip "Rescue an article")
- Style: same muted outlined style as the Analytics button — not prominent, utility-tier

### Modal
- Width: 520px, centered
- Header: "Rescue an Article"
- Sub-header: "Find any article that was dropped or missed and re-score it"

**Search section:**
- Text input: `Paste article URL or type title keywords`
- `[Search]` button → calls lookup → shows result card below

**Result card (found state):**
```
[Article title — truncated to 2 lines]
Publisher · Published date · Run: March 16 at 14:21

Current state:
  Score: 0          ← red badge
  Reason: Already captured in a previous run
  Duplicate: Yes
  Status: new

[↺ Re-score with AI]   [✕ Cancel]
```

**Result card (not found):**
```
⚠ Article not found in database.

This URL hasn't been collected in any run.
Try running a new collection with keyword: "drone first responder"

[✕ Close]
```

**Post-re-score (score ≥ minScore):**
```
✓ New score: 78 — Strong Signal
  Company: Yonkers Police Department
  Country: US
  Signal: DEPLOYMENT

Article added to Active Queue.

[View in Queue]   [✕ Close]
```

**Post-re-score (score < minScore):**
```
New score: 35 — below threshold (min: 50)

Override score manually:
  [────────────●─────────]  Score: 65

[Confirm & Add to Queue]   [✕ Cancel]
```

---

## 11. State Management

When rescue succeeds, the revived `ArticleWithScore` must be pushed into session state without a page refresh:

- Call `onRevive(article: ArticleWithScore)` callback (prop drilled from `page.tsx` or via a shared state setter)
- In `page.tsx`: `setArticles(prev => [...prev, article])` (same pattern as `handleScoringComplete`)
- Also update `runArticleMap` to attribute the article to its original run ID

If `manualScore` was used, the `scored` record is written directly — skip the queue threshold filter (user explicitly chose to add it).

---

## 12. Implementation Plan (Modular)

| Module | Files | Effort |
|--------|-------|--------|
| M1 — Lookup API | `src/app/api/revive/route.ts` (new) | Small |
| M2 — Bypass flag in score route | `src/app/api/score/route.ts` — add `forceRescore` param check | Small |
| M3 — Rescue modal UI | `src/components/shared/RescueModal.tsx` (new) | Medium |
| M4 — Navbar button | `src/components/shared/Navbar.tsx` | Tiny |
| M5 — State wiring | `src/app/page.tsx` — add `onRevive` handler | Small |
| M6 — Audit trail (optional) | `src/lib/types.ts` — add `'revived'` to `ArticleAction` | Tiny |

Total estimated new code: ~250 lines across 2 new files + small edits to 3 existing files. No new DB tables. No schema changes beyond what's already done.

---

## 13. Pre-conditions (All Met)

- [x] `ever_queued` column added to `articles` table in Supabase
- [x] URL dedup overwrite protection implemented in `/api/score/route.ts`
- [x] `SourceBadge` component exists and ready for use in rescue modal
- [x] `ScoreBadge`, `SignalBadge` components exist for result card
- [x] `toast` (sonner) available for success notifications

---

## 14. Open Questions for Build Time

1. Should manual score override require a reason/note? (Helps future debugging)
2. Should the rescue modal be accessible from Step 2 (Score panel) too, not just the navbar? Could be useful when reviewing dropped articles in the Step 2 table.
3. Should `'revived'` be added to `ArticleAction` type? Adds a thin audit trail. Minor type + Supabase schema change (array field).
4. If Gate 2 dedup fires during re-score, should we show the "competing article" title so the user can make an informed decision? Requires a cross-reference lookup.
