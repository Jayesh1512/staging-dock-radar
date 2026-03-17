# LinkedIn Modularity Analysis — Dock Radar

**Date:** 2026-03-17
**Author:** Internal Architecture Review
**Scope:** Full modularity analysis of Google News vs LinkedIn across all pipeline layers, gap inventory, and recommended improvements

---

## Table of Contents

1. [Overview](#overview)
2. [Pipeline Architecture Summary](#pipeline-architecture-summary)
3. [Layer-by-Layer Modularity Analysis](#layer-by-layer-modularity-analysis)
   - [Collection Layer](#collection-layer)
   - [Scoring Layer](#scoring-layer)
   - [Prompt Layer](#prompt-layer)
   - [Dedup Layer](#dedup-layer)
   - [State Management Layer](#state-management-layer)
   - [UI Layer](#ui-layer)
4. [Modularity Scorecard](#modularity-scorecard)
5. [Gap Inventory (A–K)](#gap-inventory-ak)
6. [Recommended Modular Improvements](#recommended-modular-improvements)
7. [Dry Run Test Cases](#dry-run-test-cases)
8. [Summary: What Needs to Change and Why](#summary-what-needs-to-change-and-why)

---

## Overview

Dock Radar is a Next.js internal tool for the FlytBase BD team. It collects articles from Google News (GN) and LinkedIn (LI), scores them with an LLM, and surfaces them in a queue for review.

**Pipeline:** Step 1 (Collect) → Step 2 (Score/AI) → Step 3 (Queue Review)

This document assesses how modular or non-modular the current codebase is when handling both sources, catalogues every identified gap (A–K), and provides prioritized recommendations for making the architecture properly source-agnostic.

The core finding: **Google News is the primary, mature path. LinkedIn was added as a partial integration.** Most collection-layer contracts (date filtering, caps, dedup, stats, run ID propagation) were never completed for LinkedIn. The scoring and UI layers are mostly shared but have meaningful gaps around LinkedIn-specific content structure.

---

## Pipeline Architecture Summary

```
Step 1 — Collect
  /api/collect/route.ts          ← Google News (RSS, mature)
  /api/collect-linkedin/route.ts ← LinkedIn (Puppeteer, partial)

Step 2 — Score
  /api/score/route.ts            ← Unified pipeline, both sources

Step 3 — Queue Review
  page.tsx + use-collect.ts      ← Session state (GN-centric)
  QueuePanel / QueueRow          ← Display layer
```

Both collection routes feed into a single scoring pipeline. The scoring pipeline is largely source-agnostic, with one inline branch to skip body-fetch for LinkedIn. Session state was built around a single GN run and has not been extended cleanly for dual-source operation.

---

## Layer-by-Layer Modularity Analysis

### Collection Layer

#### Google News (`/api/collect/route.ts`)

This is the mature, fully-featured path. It correctly:

- Reads `filterDays`, `maxArticles`, `keywords`, `regions` from the request body
- Applies a date filter safety net cutoff after fetch
- Applies `maxArticles` cap via `.slice(0, maxArticles)`
- Runs within-run dedup via `deduplicateWithinRun()` using Jaccard title similarity (threshold 0.80)
- Inserts run + articles to DB and remaps cross-run duplicate IDs
- Returns accurate `PipelineStats`: `totalFetched`, `afterDateFilter`, `afterDedup`, `stored`, `dedupRemoved`
- Sets `sources: ['google_news']` and `id: run_YYYYMMDD...` on the run record

This route serves as the reference implementation. Every contract it fulfills should be considered the minimum standard for any new source.

#### LinkedIn (`/api/collect-linkedin/route.ts`)

This is a partial integration. The frontend sends the correct parameters (`filterDays`, `maxArticles`, `keywords`) but the route ignores most of them:

- `filterDays`: hardcoded to 7 inside the route — frontend value is never read
- `maxArticles`: not read, not applied — no `.slice()` anywhere in the route
- Date filter: `parseLinkedInRelativeDate()` correctly parses relative date strings ("16h", "3w") to ISO dates, but the parsed date is **never compared against the cutoff**. Posts from months ago pass through unfiltered.
- Dedup: URL-based only within a single run. Title Jaccard is not used because all LinkedIn titles are formatted as `"${authorName} post"` — Jaccard similarity between "John Smith post" and "Jane Doe post" is very low, so no title-based dedup ever fires.
- Stats response: all fields (`totalFetched`, `afterDateFilter`, `afterDedup`, `stored`) are set to `allArticles.length`. `dedupRemoved` is always `0`. These numbers are meaningless.
- `normalized_url` fallback: `post.postUrl || \`li_${runId}_${ts}_${i}\`` — URL-less posts get an unstable generated key that changes every run, making cross-run dedup permanently impossible for those posts.
- Run record: `sources: ['linkedin']` and `id: run_li_YYYYMMDD...` — these are correct.

**Summary:** LinkedIn collection has the structural skeleton but is missing every quality contract that GN fulfills. The stats it returns actively mislead the pipeline about what happened.

---

### Scoring Layer

#### `/api/score/route.ts`

The scoring pipeline is the most mature shared layer. It handles both sources through a single unified flow with one source-specific branch:

```typescript
if (a.source === 'linkedin') return Promise.resolve({ text: '', resolvedUrl: a.url })
```

This correctly skips body fetch for LinkedIn posts, treating the existing snippet as the full content. Everything else — URL fingerprint dedup, Gate 2 dedup (company + country + signal_type), freshness boost, LLM scoring, DB write — is source-agnostic.

**Known issue:** URL fingerprint dedup works reliably for GN. For LinkedIn posts without a stable URL, the fingerprint resolves to `li_runId_ts_i`, which is unique per run. These posts will never be caught by fingerprint dedup across runs.

**Known issue:** Freshness boost is source-agnostic and works correctly — but only if `published_at` is accurate. Because LinkedIn's date filter is not enforced (Gap A), stale posts may arrive in scoring with a parsed `published_at` that looks recent.

**Parallel scoring ordering issue:** If `use-collect.ts` runs GN and LI collection in parallel and then submits a merged batch to `/api/score`, LI articles may be processed and committed to DB before GN articles. If the same story appears in both sources, LI's weaker snippet (no body, no full article text) commits the dedup key first. When GN's richer article arrives, it gets marked as a duplicate and dropped. This is the reverse of the desired behavior (Gap G).

---

### Prompt Layer

#### `/lib/scoring-prompt.ts`

There is a single `SCORING_SYSTEM_PROMPT` with no LinkedIn-specific sections. The prompt is well-written for news articles: it covers OEM rule, geography, language, FlytBase flag, and persons extraction. It was not designed for first-person social content.

LinkedIn posts arrive at the LLM with:
- `publisher` = the author's name (e.g., "Ravi Agrawal") — not a media outlet
- `snippet` = the post text (first-person, may be promotional)
- `body` = empty string

The LLM receives no guidance on how to handle this format. Specific failure modes:

- **Missing company name**: A LinkedIn post from a drone operator employee may never name the company explicitly — the company context is implied by the author's LinkedIn profile, which the LLM does not see. Without guidance, the LLM may guess a company name or return null inconsistently.
- **Self-promotional scoring**: A company posting "We just deployed 50 drones across 3 sites in India" is a valid deployment signal. But without guidance, the LLM may over- or under-score it because it reads like marketing copy rather than journalism.
- **Publisher misinterpretation**: The LLM is trained to treat `publisher` as a media outlet. For LinkedIn, `publisher` is a person's name. Without guidance, it may extract the publisher as a person incorrectly, or fail to add them to the `persons` array.
- **Signal type misclassification**: Social posts have a different vocabulary than news articles. A post saying "thrilled to announce our new partnership" may not trigger the same signal-type classification as "Company X signs contract with Company Y".

---

### Dedup Layer

#### `/lib/dedup.ts`

**`deduplicateWithinRun()`** — Uses Jaccard title similarity at threshold 0.80. Correct and effective for GN, where titles are descriptive and distinct. Broken for LinkedIn because all LinkedIn article records have the title `"${authorName} post"`. Two posts by different authors have completely different titles (low Jaccard), so no within-run title dedup ever fires for LinkedIn. Two posts by the same author have identical titles (Jaccard = 1.0), so they would be deduped — but this is coincidental and not meaningful.

**`gateTwoDedup()`** — Operates on company + country + signal_type + summary Jaccard. This is fully source-agnostic and works correctly for both GN and LinkedIn, provided the scoring step has extracted those fields accurately. No changes needed here.

---

### State Management Layer

#### `page.tsx` + `use-collect.ts`

This layer was built for a single-source (GN-only) workflow and has not been extended for dual-source operation.

**`currentRun: Run | null`** — Single slot. Cannot hold two concurrent run IDs (one for GN, one for LI).

**`handleCollectComplete` in `page.tsx`** — Hardcodes `sources: ['google_news']` when constructing the session Run object. Even when a LinkedIn run has just completed, the session Run record will claim it was a GN run.

**`handleScoringComplete`** — Maps all scored articles to `currentRunRef.current?.id`, which is GN's runId. LinkedIn articles are attributed to GN's run in the session state. This means the `runArticleMap` built during a session incorrectly groups LI articles under the GN run header.

**After page refresh** — The `/api/runs` endpoint rebuilds `runArticleMap` from `article.run_id` stored in DB. Because DB writes use the correct per-source run ID, the display is accurate after refresh. The bug only exists in the in-session state.

**`CollectResult.runId`** — Typed as a single `string`. When `use-collect.ts` merges GN and LI results, it takes `base.runId` (GN's run ID). LI's run ID is discarded and never surfaced to `page.tsx`.

---

### UI Layer

**`SourceBadge` component** — Exists at `src/components/shared/SourceBadge.tsx`. Used in `ArticleDrawer` (the expanded row detail view). `SOURCE_BADGE_COLORS` and `SOURCE_LABELS` are defined in constants. The component itself is correctly built.

**`QueueRow`** — Does not render a `SourceBadge`. The collapsed table row (the view users spend most time in) has no visible indicator of whether an article came from GN or LinkedIn. The columns are: checkbox | expand | title+publisher | company | country | signal+score | actions.

**`BatchDivider`** — Shows run date, keywords, and article count. Shows no source label. A user cannot tell whether a batch header represents a GN run or a LinkedIn run without clicking into individual articles.

**`ArticleDrawer` header strip** — Shows publisher, but no source badge in the header strip itself. The source badge appears only in the "Source" labeled section further down the drawer.

The component infrastructure for source badging is complete. It simply has not been wired into the row-level and batch-level views.

---

## Modularity Scorecard

| Layer | GN Maturity | LI Maturity | Shared / Abstracted | Gap Severity |
|---|---|---|---|---|
| Collection route | Mature | Partial | None — separate routes | High |
| Date filtering | Enforced | Missing — never compared against cutoff | None | Critical |
| maxArticles cap | Applied via `.slice()` | Missing — no cap applied | None | High |
| Within-run dedup | Title Jaccard, works | Broken — all LI titles are "X post" | Shared function, LI-incompatible | High |
| URL normalization | news.google.com-aware | Partial — URL-less posts get unstable key | `url-fingerprint.ts` shared | Medium |
| Stats response | Accurate all fields | Inaccurate — all set to `allArticles.length` | None | High |
| Scoring pipeline | Full | Full (body skip) | Shared `/api/score` route | Low |
| Scoring prompt | News-optimized | No LI-specific guidance | Single prompt, no branching | Medium |
| Body fetch | Full article fetch | Skipped (snippet = body) | Source check inline in route | Low |
| Dedup Gate 2 | Works correctly | Works correctly | Fully shared | None |
| Freshness boost | Works correctly | Works if dates correct | Shared, date accuracy risk | Low |
| Parallel scoring order | N/A (single source) | LI may pre-empt GN dedup key | Not sequenced | Medium |
| Source badge (UI) | In drawer | In drawer | Shared component | Medium — not in row view |
| QueueRow source visibility | Not shown | Not shown | Not implemented | Medium |
| BatchDivider source label | Not shown | Not shown | Not implemented | Medium |
| Run state (session) | Correct | Wrong — hardcoded as GN sources | Not modular | High |
| RunArticleMap (session) | Correct | Wrong during session — attributes to GN run | Partially shared | Medium |
| CollectResult type | Works | runId lost at merge | Single `runId` field | Medium |

---

## Gap Inventory (A–K)

These gaps were identified during planning of the hybrid scoring architecture. Each is scoped and labeled for tracking.

### Module 0 — Prerequisite Fixes (zero-risk, independent)

**Gap A — LinkedIn date filter never enforced**
- `filterDays` is sent from the frontend via `use-collect.ts` but the route ignores it
- `parseLinkedInRelativeDate()` parses dates correctly but the parsed value is never compared against a cutoff
- Impact: posts from weeks or months ago pass through as if they were fresh
- Fix location: `/api/collect-linkedin/route.ts` — read `filterDays` from body, compute cutoff, filter after mapping

**Gap B — LinkedIn maxArticles cap missing**
- `maxArticles` is sent from the frontend but not read by the route
- No `.slice()` is applied anywhere in the LinkedIn collection flow
- Impact: a run configured for 20 articles may return 45+ posts, creating unpredictable scoring load
- Fix location: `/api/collect-linkedin/route.ts` — apply `.slice(0, maxArticles)` after date filter

**Gap C — LinkedIn stats response is inaccurate**
- All stat fields (`totalFetched`, `afterDateFilter`, `afterDedup`, `stored`) are set to `allArticles.length`
- `dedupRemoved` is always `0` regardless of what actually happened
- Impact: `PipelineStats` displayed in the UI after a LinkedIn run is meaningless; misleads the operator
- Fix location: `/api/collect-linkedin/route.ts` — compute actual values at each stage

**Gap D — `sources` hardcoded as `['google_news']` in session state**
- `page.tsx:handleCollectComplete` constructs the session Run object with `sources: ['google_news']` regardless of which source actually ran
- Impact: Run displayed in Step 3 claims it was a GN run even if it was a LinkedIn run or a hybrid run
- Fix location: `page.tsx` — derive `sources` from the actual collection result

**Gap E — `normalized_url` fallback creates unstable dedup key for URL-less LinkedIn posts**
- Posts without a `postUrl` get `normalized_url = li_${runId}_${ts}_${i}`
- This key is unique per run, meaning the same URL-less post will never be identified as a duplicate across runs
- Impact: same LinkedIn post recollected across multiple runs will appear multiple times in the queue
- Fix location: `/api/collect-linkedin/route.ts` — consider content-hash fallback (e.g., first 80 chars of snippet + author) as a stable key

---

### Module 1 — CollectResult Typing

**Gap F — `CollectResult.runId` is singular; LinkedIn run ID is discarded**
- `CollectResult` has `runId: string` — one slot
- When `use-collect.ts` merges GN and LI results (`base.runId`), LI's run ID is lost
- `page.tsx` never receives the LI run ID and cannot use it for attribution
- Impact: downstream state management cannot correctly associate LI articles with their run
- Fix location: `src/lib/types.ts` — add `liRunId?: string` to `CollectResult`; populate in `use-collect.ts`

---

### Module 2 — GN-First Scoring Ordering

**Gap G — Parallel GN + LI scoring allows LI to pre-empt GN in dedup**
- `use-collect.ts` runs GN and LI collection in parallel and merges the results into a single array
- This merged array is submitted as one batch to `/api/score`
- If LI articles are processed first, they commit the dedup key (company + country + signal_type) to DB before GN
- GN's article — which has a full body fetch and richer content — then gets marked as a duplicate and dropped
- Impact: lower-quality LinkedIn snippets survive; higher-quality GN articles are dropped
- Fix location: `use-collect.ts` — score GN batch first (await), then score LI batch second

---

### Module 3 — RunArticleMap Attribution

**Gap H — `handleScoringComplete` maps all articles to GN's run ID**
- `handleScoringComplete` in `page.tsx` uses `currentRunRef.current?.id` for all articles
- `currentRunRef` holds GN's run ID (the session's single run slot)
- Impact: in the session (before page refresh), all LI articles appear under the GN run header in Step 3
- After page refresh this is corrected by DB-driven rebuild, but the in-session experience is broken
- Fix location: `page.tsx:handleScoringComplete` — split scored articles by `article.source`, attribute GN articles to `gnRunId` and LI articles to `liRunId`

---

### Module 4 — Source Visibility in UI

**Gap I — No source badge in `QueueRow` table row**
- The collapsed table row (primary view in Step 3) shows: title, publisher, company, country, signal, score
- There is no visible GN / LI indicator at row level
- `SourceBadge` component exists and is used in `ArticleDrawer` but not in `QueueRow`
- Impact: users cannot distinguish GN articles from LinkedIn posts at a glance; source credibility judgments must be made by reading the publisher name

**Gap J — `BatchDivider` shows no source label**
- The run header divider shows date, keywords, and count
- No source chip or label is shown
- Impact: users cannot tell whether a batch was a GN run, a LinkedIn run, or a hybrid run without clicking into an article

---

### Scoring Prompt

**Gap K — No LinkedIn-specific scoring guidance in the prompt**
- `SCORING_SYSTEM_PROMPT` in `/lib/scoring-prompt.ts` is written for news articles
- LinkedIn posts are first-person professional content with a fundamentally different structure
- The LLM receives no guidance for handling this content type
- Specific failure modes:
  - `publisher` field contains a person's name, not a media outlet — the LLM has no instruction for this
  - Company name may not appear anywhere in the post text (implied by profile) — LLM may guess
  - Self-promotional posts from legitimate operators are valid signals but may be penalized by a news-trained prompt
  - Author is often the most important person in the record but is listed as `publisher`, not in `persons`
  - Signal type vocabulary differs between journalism and social posts

---

## Recommended Modular Improvements

### Priority 1 — Immediate Fixes (Module 0 — Gaps A–E)

These are independent, zero-risk fixes with no inter-dependencies. Each can be shipped separately.

**1. Enforce LinkedIn date filter (Gap A)**
- In `/api/collect-linkedin/route.ts`: read `filterDays` from request body
- Compute `cutoff = new Date(Date.now() - filterDays * 86400000)`
- After mapping posts to articles, filter `articles.filter(a => new Date(a.published_at) >= cutoff)`
- Log count before and after for stats

**2. Apply LinkedIn maxArticles cap (Gap B)**
- In `/api/collect-linkedin/route.ts`: read `maxArticles` from request body
- Apply `.slice(0, maxArticles)` after the date filter step
- Order of operations: fetch → parse → date filter → dedup → cap → insert

**3. Fix LinkedIn stats response (Gap C)**
- Track `totalFetched`, `afterDateFilter`, `afterDedup`, and `stored` as separate variables at each stage
- Compute `dedupRemoved = afterDateFilter - afterDedup`
- Return these values in the `PipelineStats` response field to match GN's contract

**4. Fix hardcoded `sources: ['google_news']` (Gap D)**
- In `page.tsx:handleCollectComplete`, derive `sources` from the result object
- If `collectResult.liRunId` is present, include `'linkedin'` in sources; otherwise use `'google_news'`

**5. Stable dedup key for URL-less LinkedIn posts (Gap E)**
- Replace `li_${runId}_${ts}_${i}` fallback with a content-based stable key
- Suggested: `li_content_${sha1(authorName + snippet.slice(0, 80))}` or similar
- This ensures the same post recollected across multiple runs produces the same `normalized_url` and can be caught by cross-run dedup

---

### Priority 2 — Architecture (Modules 1–3 — Gaps F–H)

These require coordinated changes across multiple files.

**6. Extend `CollectResult` type to carry both run IDs (Gap F)**
- In `src/lib/types.ts`: add `liRunId?: string` to the `CollectResult` interface
- In `use-collect.ts`: after LI collection completes, set `liRunId = liResult.runId` on the merged result
- In `page.tsx`: store `liRunId` separately in state alongside `gnRunId`

**7. Enforce GN-first scoring order (Gap G)**
- In `use-collect.ts` (or wherever the merged batch is submitted to `/api/score`): split the merged array by source
- Submit GN articles first and await completion before submitting LI articles
- This ensures GN's dedup keys are committed first; LI articles arriving with the same key will be correctly identified as duplicates
- Trade-off: slightly increases total scoring time; acceptable given the quality improvement

**8. Fix RunArticleMap attribution during session (Gap H)**
- In `page.tsx:handleScoringComplete`: split `scoredArticles` into GN subset and LI subset by `article.source`
- Attribute GN subset to `gnRunId`, LI subset to `liRunId`
- Update `runArticleMap` with both entries
- This eliminates the discrepancy between in-session and post-refresh display

---

### Priority 3 — Content Quality (Gap K)

**9. Add LinkedIn-specific section to the scoring prompt**
- In `/lib/scoring-prompt.ts`: add a `[LINKEDIN POST]` conditional section
- Rules to include:
  - `publisher` is the person who posted, not a media outlet — treat them as the primary `persons` entry with their stated role if detectable
  - Company name may not appear in post text — if not explicitly stated, set `company` to null rather than inferring from publisher name
  - First-person operator posts ("We deployed X drones...") are valid deployment signals — score them as you would a news article reporting the same fact
  - Self-promotional language does not reduce signal quality; evaluate the underlying fact being announced
  - `publisher` should be included in `persons[0]` with `role` extracted from their stated title if available
  - Signal type classification: treat "announcement" vocabulary ("thrilled to share", "proud to announce") as equivalent to news article announcements

**10. Replace title Jaccard with snippet Jaccard for LinkedIn within-run dedup**
- In `/lib/dedup.ts` or `/api/collect-linkedin/route.ts`: for LinkedIn posts, use first 100 chars of snippet as the similarity key instead of title
- Title Jaccard is permanently broken for LinkedIn because all titles are `"${authorName} post"`
- Snippet-based Jaccard will catch actual duplicate posts (same text posted twice or reposted)

---

### Priority 4 — UI Consistency (Gaps I–J)

These are low-risk, high-visibility improvements.

**11. Add source badge to `QueueRow` (Gap I)**
- In `src/components/queue/QueueRow.tsx`: render `<SourceBadge source={article.source} />` in the publisher sub-line of the title cell
- Use the compact variant (single-letter pill: "GN" or "LI") to avoid column width impact
- This is the highest-impact UI change: users see source at a glance for every article

**12. Add source chip to `BatchDivider` (Gap J)**
- In the batch divider component: add a `<SourceBadge>` or text chip next to the run date
- Format: `[GN] Mar 17 · "drone delivery" · 12 articles` or `[LI] Mar 17 · "drone delivery" · 8 posts`
- For hybrid runs (if both sources share a display group), show both: `[GN + LI]`

**13. Add source badge to `ArticleDrawer` header strip**
- The drawer header currently shows publisher but not source
- Add `<SourceBadge source={article.source} />` to the header strip alongside signal type and score
- This improves context when reviewing a single article in detail

---

## Dry Run Test Cases

These test cases describe current behavior vs expected behavior for the most critical gaps. They serve as acceptance criteria for the fixes above.

| TC | Scenario | Current Behavior | Expected Behavior | Covered by Gap |
|---|---|---|---|---|
| TC-1 | `filterDays=3`, LinkedIn post with `published_at` 10 days ago | Post passes through — date never compared against cutoff | Post filtered out; `afterDateFilter` count decreases | A |
| TC-2 | `maxArticles=20`, LinkedIn scrape returns 45 posts | All 45 posts proceed to DB insert and scoring | Capped at 20 after date filter; stats reflect cap | B |
| TC-3 | Same story in GN + LI (same company, same deployment event) | LI dedup key commits first (parallel scoring) — GN article marked duplicate and dropped | GN scored first — GN commits dedup key — LI article marked duplicate | G |
| TC-4 | Page refresh after hybrid run | LI articles appear under GN run header during session | LI articles appear under LI run header both during session and after refresh | D, H |
| TC-5 | LI post with no `postUrl`, recollected in next run | `normalized_url = li_runId_ts_i` (different each run) — same post appears again | Content-hash key matches across runs — post caught by cross-run dedup | E |
| TC-6 | LI author company not stated in post text | LLM guesses company name or returns inconsistent null | With LI-specific prompt: returns null if company not explicitly stated | K |
| TC-7 | LI run with `filterDays=3`, `maxArticles=20`, stats displayed in Step 1 | All fields show 45, `dedupRemoved: 0` | Fields show accurate `totalFetched=45`, `afterDateFilter=12`, `afterDedup=10`, `stored=10`, `dedupRemoved=2` | C |
| TC-8 | `QueueRow` for a LinkedIn post in Step 3 | No source visible — user sees publisher name "Ravi Agrawal" and must infer | Compact "LI" pill visible in publisher sub-line next to publisher name | I |
| TC-9 | LI author posts same content twice in one scrape | Title Jaccard between "Ravi Agrawal post" and "Ravi Agrawal post" = 1.0 — one deduped (correct but coincidental) | Snippet-based Jaccard correctly identifies duplicate content | K (dedup variant) |
| TC-10 | `BatchDivider` for a LinkedIn run | Shows date + keywords + count — no source label | Shows "[LI] Mar 17 · 'drone delivery' · 8 posts" | J |

---

## Summary: What Needs to Change and Why

### The core asymmetry

Google News was the original, designed-for source. Every contract in the pipeline — date filtering, caps, stats, dedup, run ID propagation, session state — was built around GN's behavior. LinkedIn was added later as a parallel route that mimics the GN interface but does not fulfill its contracts.

The result is a pipeline that appears to support two sources but silently fails on several quality dimensions for LinkedIn:
- Stale content passes through (Gap A)
- Volume is uncapped (Gap B)
- Stats lie (Gap C)
- Session state attributes everything to the wrong source (Gap D, H)
- The same URL-less post can appear in the queue repeatedly (Gap E)
- The LLM has no guidance for LinkedIn's content structure (Gap K)

### The fix philosophy

Rather than creating LinkedIn-specific parallel implementations for every layer, the recommended approach is:

1. **Fix LinkedIn's collection route to fulfill the same contracts as GN's** (Gaps A–C, E). These are mechanical fixes, not architectural changes.
2. **Extend the shared types to carry dual run IDs** (Gap F) — one small type change unlocks correct state management throughout.
3. **Sequence scoring to prefer GN content** (Gap G) — a one-line async ordering change with significant quality impact.
4. **Add a LinkedIn section to the existing prompt** (Gap K) — the prompt is already structured; this is an additive change.
5. **Wire the existing `SourceBadge` component into the views that don't use it yet** (Gaps I–J) — the component is done; it just needs to be placed.

None of these changes require rebuilding the pipeline. The scoring and dedup infrastructure is already source-agnostic and correct. The gaps are concentrated in collection-layer contracts, session state wiring, and content-layer guidance.

### Recommended sequencing

| Sprint | Gaps | Effort | Impact |
|---|---|---|---|
| Sprint 1 | A, B, C, D | Low — 1-2 hours | Fixes data quality for all new LinkedIn runs immediately |
| Sprint 1 | I, J | Low — 1 hour | Source visibility in UI immediately |
| Sprint 2 | E, F, G, H | Medium — half day | Correct run attribution and dedup ordering |
| Sprint 2 | K | Medium — 1-2 hours | Improves LLM scoring accuracy for LinkedIn posts |
| Sprint 3 | 10 (snippet dedup) | Low-medium | Improves within-run dedup for LinkedIn |

Sprint 1 fixes the most visible quality issues with zero architectural risk. Sprint 2 completes the architectural extension for dual-source operation. Sprint 3 is a refinement pass.
