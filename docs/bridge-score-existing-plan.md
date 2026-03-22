# Bridge: Score Existing Articles from Any Campaign

**Date:** 22 Mar 2026
**Status:** Planned
**Author:** Ravi + Claude

---

## Problem

When we run LinkedIn company page scans (or any large scrape campaign), the articles get stored in the DB but never enter the AI scoring pipeline (Step 2 → Step 3 Queue). Currently, only articles collected through Step 1 (Google News / NewsAPI / LinkedIn keyword search) flow into scoring.

Last night's LinkedIn scanner scraped 144 company pages, found DJI Dock signals at GeoAerospace (10 mentions), Aermatica3D (2), Heliguy (2), GeoLanes (1) — but none of these entered the scoring queue because the scanner and the main pipeline are separate flows.

## Solution

A "bridge" API that takes **already-stored** articles from the `articles` table and feeds them into the existing `/api/score` pipeline. No re-scraping. No new collection. Just: DB → Score → Queue.

```
Current flow:
  Step 1 (Collect from web) → articles table → Step 2 (Score) → Step 3 (Queue)

Bridge flow:
  articles table (already stored) → /api/score-existing → Step 2 (Score) → Step 3 (Queue)
```

This works for **any** campaign type — LinkedIn scans, imported CSVs, or any future source.

---

## API Design

### Endpoint: `POST /api/score-existing`

**Request:**
```json
{
  "source": "linkedin",
  "runIdPrefix": "run_li_company_",
  "keywordRegex": "dji|dock",
  "dateFrom": "2026-03-21",
  "dateTo": "2026-03-22",
  "minScore": 50,
  "campaign": "linkedin_dock_scan",
  "maxArticles": 100,
  "preview": false
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `source` | No | Filter by article source (`linkedin`, `google_news`, `newsapi`) |
| `runIdPrefix` | No | Filter by run ID prefix (e.g. `run_li_company_` for LinkedIn scans) |
| `keywordRegex` | No | Only articles whose title/snippet match this regex |
| `dateFrom` / `dateTo` | No | Date range filter on `articles.created_at` |
| `minScore` | No | Scoring threshold (default 50) |
| `campaign` | No | Campaign tag for grouping in the UI |
| `maxArticles` | No | Cap — only applies when `keywordRegex` is NOT set (see Smart Cap below) |
| `preview` | No | If `true`, returns count only without scoring |

### Smart Cap: Keyword-matched vs unfiltered

| Scenario | Cap behavior | Rationale |
|----------|-------------|-----------|
| `keywordRegex` provided (e.g. `dji\|dock`) | **No cap** — all matching articles flow through | Keyword-matched articles are already relevant; exact matches are typically few (10-50) |
| No `keywordRegex` (broad filter) | **maxArticles cap applied** (default 200) | Prevents runaway LLM cost on unfiltered queries |
| Keyword-matched count exceeds 200 | **Alert returned** in response, scoring continues | `"alert": "High volume: 347 keyword-matched articles. Review filter specificity."` |

**Response (preview=true):**
```json
{
  "preview": true,
  "totalMatching": 247,
  "alreadyScored": 150,
  "alreadyQueued": 8,
  "toScore": 89,
  "cappedAt": null,
  "alert": null
}
```

**Response (preview=false):**
```json
{
  "results": [...],
  "runId": "run_bridge_linkedin_20260322",
  "scored": 45,
  "alreadyQueued": 8,
  "alreadyQueuedArticles": [
    { "id": "...", "title": "GeoAerospace DJI Dock 3...", "score": 90 }
  ],
  "skipped": 5,
  "alert": null
}
```

Note: `alreadyQueuedArticles` are returned in the response (not silently dropped) so the user sees "15 new + 8 already in queue" rather than just "15 scored."

---

## Internal Flow

```
1. Query `articles` table with source/date/keyword filters
2. Exclude already-scored (check `scored_articles` table by article_id)
3. Exclude ever_queued (already in Step 3 from prior run) — but RETURN them in response as "already queued"
4. Apply maxArticles cap (only if no keywordRegex)
5. Create synthetic Run record (e.g. run_bridge_linkedin_20260322)
6. Feed to existing /api/score (same LLM, same dedup, same gates)
7. Return ArticleWithScore[] — same format as regular scoring
```

No changes to the existing scoring pipeline. The bridge is purely a new entry point.

---

## Dry Run: Last Night's LinkedIn Campaign

```
Input: { source: "linkedin", runIdPrefix: "run_li_company_", keywordRegex: "dji|dock" }

Step 1 — Query articles: ~200 relevant (after pre-storage keyword filter)
Step 2 — Keyword regex applied: "dji|dock" → ~200 match (all stored are relevant post-Fix 2)
Step 3 — Exclude already-scored: ~150 scored from manual testing → 50 remaining
Step 4 — Exclude ever_queued: ~5 already in queue → 45 to score (8 returned as "already queued")
Step 5 — Cap check: keywordRegex provided → NO cap applied
Step 6 — Score: 2 batches of 40 → LLM scores each
Step 7 — Result: ~15 score >= 50 → enter Step 3 Queue as new DSP/SI leads

Response: { scored: 15, alreadyQueued: 8, alert: null }
```

**Cost:** ~$0.50-1.00 for 45 articles (GPT-4o)

---

## Key Safeguards

| Risk | Mitigation |
|------|-----------|
| Runaway LLM cost (broad filter) | `maxArticles` cap (default 200) when no keywordRegex; alert at 200+ keyword matches |
| Duplicate scoring | Scoring cache (Gate 4) returns cached results, no LLM call. If user runs bridge twice with same filter, cached results returned instantly |
| Duplicate queue entries | `ever_queued` gate skips articles already in queue. Bridge returns them as `alreadyQueuedArticles` for visibility |
| Missing campaign grouping | Synthetic Run record created → articles grouped in Step 3 UI |
| LinkedIn body fetch | Score API already skips body fetch for LinkedIn (uses snippet) |
| Stale DB data from before Fix 2 | `keywordRegex` filter applied at query time, independent of what's stored |

---

## Data Cleanup: Last Night's 1,900 Irrelevant Articles

The LinkedIn scanner stored ~2,100 articles last night. ~200 were relevant (mention DJI/dock keywords), ~1,900 are noise (birthday posts, hiring announcements, etc.).

**One-time cleanup SQL** (run in Supabase SQL Editor):
```sql
-- Preview: count irrelevant LinkedIn company post articles
SELECT COUNT(*) FROM articles
WHERE source = 'linkedin'
  AND run_id LIKE 'run_li_company_%'
  AND title !~* '\b(dji|dock|drone.in.a.box|bvlos|flighthub|autonomous.drone|remote.op)\b'
  AND (snippet IS NULL OR snippet !~* '\b(dji|dock|drone.in.a.box|bvlos|flighthub|autonomous.drone|remote.op)\b');

-- Delete them (only after verifying count looks right)
DELETE FROM articles
WHERE source = 'linkedin'
  AND run_id LIKE 'run_li_company_%'
  AND title !~* '\b(dji|dock|drone.in.a.box|bvlos|flighthub|autonomous.drone|remote.op)\b'
  AND (snippet IS NULL OR snippet !~* '\b(dji|dock|drone.in.a.box|bvlos|flighthub|autonomous.drone|remote.op)\b');
```

**Future runs are protected:** Fix 2 now filters before storage — only keyword-matching posts enter the `articles` table.

---

## What Was Fixed Today (Pre-requisites)

These fixes were shipped before this plan and are required for it to work correctly:

### Fix 1: Queue Query (P0) — SHIPPED
**File:** `src/lib/db.ts` — `loadAllScoredArticles()`

Changed from querying `articles` table (3,118 rows, mostly unscored LinkedIn posts) to querying `scored_articles` table (690 rows, all scored). The old query's `.limit(500)` was filled entirely by unscored articles, making all 54 queue-eligible articles invisible.

### Fix 2: Pre-Storage Keyword Filter (P1) — SHIPPED
**File:** `src/app/api/linkedin/company-posts/collect/route.ts`

LinkedIn company post scraper now filters articles before storing: only posts matching `dji|dock|drone-in-a-box|bvlos|flighthub|autonomous drone|remote ops` are saved to the `articles` table. UI still sees all posts for per-company breakdown.

### Fix 3: Pagination for Unbounded Queries (P1) — SHIPPED
**Files:** `src/lib/db.ts`, `src/app/api/analytics/route.ts`

Added pagination loops to 4 queries that hit Supabase's default 1,000-row limit:
- `loadDedupKeysFromScoredArticles()` — dedup keys
- `loadHitListData()` — partner dashboard
- `loadDiscoveredCompanies()` — discovered companies
- Analytics query — chart data

---

## Nightly Batch Job: Automated Collection + Scoring

### Concept

A scheduled job that runs every midnight, collecting fresh articles from Google News (multi-region via VPN) and LinkedIn (company page scans), deduping, scoring, and populating the Step 3 queue — ready for morning review.

### Relationship to Bridge

These are **modular and independent**:

| Component | Purpose | Runs when |
|-----------|---------|-----------|
| **Bridge** (`/api/score-existing`) | Score articles already in DB from any source | On-demand (manual trigger or after a campaign) |
| **Nightly Batch** | Collect + Score + Queue in one automated pipeline | Scheduled (cron, midnight) |

The nightly batch **uses** the bridge internally for the scoring step, but also includes collection. Think of it as:

```
Nightly Batch = Collection + Bridge + Queue population
```

### Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Nightly Batch Job (node scripts/nightly-batch.mjs)             │
│                                                                 │
│  Phase 1: Collect (parallel, ~30 min)                           │
│  ├── Google News: 5 keyword groups × 8 regions = 40 queries     │
│  │   (regions rotate based on VPN config)                       │
│  ├── LinkedIn keyword search: 5 keywords × global               │
│  └── LinkedIn company scans: B4-B11 (if scheduled)              │
│                                                                 │
│  Phase 2: Dedup (~1 min)                                        │
│  ├── Cross-run URL dedup                                        │
│  ├── Title+publisher dedup                                      │
│  └── Pre-storage keyword filter (LinkedIn company posts only)   │
│                                                                 │
│  Phase 3: Score via Bridge (~5-10 min)                           │
│  ├── POST /api/score-existing with keyword filter               │
│  ├── All keyword-matched articles scored (no cap)               │
│  └── Results flow into Step 3 Queue                             │
│                                                                 │
│  Phase 4: Report                                                │
│  ├── Summary to console + log file                              │
│  ├── Optional: Slack notification with signal count             │
│  └── Dashboard auto-refreshes in morning                        │
│                                                                 │
│  Output: "14 new signals in queue — 3 DJI Dock, 2 BVLOS, ..."   │
└─────────────────────────────────────────────────────────────────┘
```

### VPN Region Rotation

```
Night 1: VPN = US        → Google News US + Canada + Mexico regions
Night 2: VPN = UK        → Google News UK + Germany + France + Italy
Night 3: VPN = India     → Google News India + Singapore + Japan + UAE
Night 4: VPN = US        → (cycle repeats)
```

Each night's VPN determines which Google News regional editions are queried. LinkedIn doesn't need VPN (global results). The VPN config is a simple env var or config file that the script reads.

### Overlap Analysis

| Concern | Answer |
|---------|--------|
| Will nightly batch duplicate the bridge? | No — bridge scores EXISTING articles; batch COLLECTS new ones then scores |
| Will nightly batch duplicate the LinkedIn scanner? | Configurable — LinkedIn company scans can be included or excluded per run |
| Will nightly batch duplicate C1/C2/C3 campaigns? | No — campaigns are historical sweeps (past 6 months); batch is fresh daily collection |
| Can both run on the same night? | Yes — bridge is on-demand, batch is scheduled. No conflict |
| Do they share the scoring pipeline? | Yes — both use `/api/score`. Dedup gates prevent double-scoring |

### Key Design Decisions (for team discussion)

1. **VPN switching:** Manual (user sets VPN before running) vs automated (script calls VPN API)?
2. **LinkedIn company scans in nightly batch:** Include or keep separate? Including adds 2-3 hours.
3. **Slack notifications:** Send morning summary to a channel? Which fields?
4. **Scoring cost budget:** ~$2-5/night for 200-500 articles. Acceptable?
5. **Run schedule:** Fixed midnight or configurable? Multiple runs per day?

---

## Implementation Estimate

### Bridge (build first)

| Component | Lines | Files |
|-----------|-------|-------|
| `/api/score-existing/route.ts` | ~50 | New |
| Smart cap + alert logic | ~15 | In above |
| Preview mode | ~10 | In above |
| UI button on LinkedIn scan dashboard | ~20 | Existing |
| **Total** | **~95** | **2 files** |

### Nightly Batch (build second, reuses bridge)

| Component | Lines | Files |
|-----------|-------|-------|
| `scripts/nightly-batch.mjs` | ~200 | New |
| VPN region config | ~20 | Config file |
| Slack notification (optional) | ~30 | New or existing |
| **Total** | **~250** | **2-3 files** |

### Dependency order

```
Fix 1-3 (SHIPPED) → Bridge API → Nightly Batch
                   → UI button
```

---

## Usage Scenarios

### 1. Score LinkedIn scan results (bridge)
```bash
# Preview first
curl -X POST localhost:3000/api/score-existing \
  -d '{"source":"linkedin","runIdPrefix":"run_li_company_","keywordRegex":"dji|dock","preview":true}'

# Score — no cap because keyword filter is applied
curl -X POST localhost:3000/api/score-existing \
  -d '{"source":"linkedin","runIdPrefix":"run_li_company_","keywordRegex":"dji|dock","minScore":50}'
```

### 2. Score imported CSV articles (bridge)
```bash
curl -X POST localhost:3000/api/score-existing \
  -d '{"source":"import","dateFrom":"2026-03-22","minScore":50}'
```

### 3. Nightly batch (automated)
```bash
# Add to crontab or run manually
0 0 * * * cd /path/to/Dock-radar && node scripts/nightly-batch.mjs >> data/nightly-batch.log 2>&1
```

### 4. Morning check
Open `localhost:3000` → Step 3 Queue shows overnight signals.
Open `localhost:3000/utilities/linkedin-scan-results` for LinkedIn scan dashboard.
