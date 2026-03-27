# Company Activity Analytics — Complete Plan

## The Problem

Dock Radar collects articles and LinkedIn posts daily. Over time, the same companies appear repeatedly — some post about DJI Dock weekly, others once and disappear. Today, there's no way to answer:

- "Which companies are **most active** talking about DJI Dock?"
- "Is Aerosmart posting **more or less** than last month?"
- "Who should BD reach out to **first** based on sustained activity?"
- "Are there companies that **just started** posting — early movers?"

## The Opportunity

Activity patterns reveal **intent strength**. A company posting 8x about DJI Dock in 60 days is a warmer lead than one that mentioned it once. This is the missing layer between "we found them" (discovery) and "we should call them" (pipeline).

---

## Architecture: What Exists vs What's Needed

### Already in the DB (no new tables required)

```
scored_articles
  ├── company (TEXT)         — extracted company name
  ├── relevance_score (INT)  — 0-100
  ├── signal_type (TEXT)     — DEPLOYMENT/CONTRACT/PARTNERSHIP/EXPANSION/OTHER
  ├── created_at (TIMESTAMP) — when scored
  └── article_id → articles
        ├── source (TEXT)     — 'linkedin' / 'google_news' / etc.
        ├── published_at      — when published
        ├── publisher (TEXT)  — author name
        └── url (TEXT)

discovered_companies
  ├── normalized_name (PK)
  ├── display_name
  ├── mention_count (INT)    — total unique articles
  ├── first_seen_at
  ├── last_seen_at
  ├── types[] (JSONB)        — ['si', 'operator', 'buyer']
  ├── countries[] (JSONB)
  ├── industries[] (JSONB)
  ├── signal_types[] (JSONB)
  ├── website, linkedin
  └── status ('active'/'dismissed')
```

### What's Missing (new columns on discovered_companies)

| Column | Type | Purpose |
|--------|------|---------|
| `post_frequency_30d` | INTEGER | Posts in last 30 days |
| `post_frequency_60d` | INTEGER | Posts in last 60 days |
| `avg_score` | REAL | Average relevance score across all articles |
| `max_score` | INTEGER | Highest single article score |
| `latest_signal_type` | TEXT | Most recent signal type |
| `activity_trend` | TEXT | 'rising' / 'stable' / 'declining' / 'new' |
| `sources_seen` | TEXT[] | ['linkedin', 'google_news'] |
| `activity_updated_at` | TIMESTAMP | When metrics were last computed |

These are **computed/cached columns** — refreshed on each scoring run or via a dedicated refresh endpoint.

---

## Analytics Views (3 Panels)

### Panel 1: Activity Leaderboard (Primary View)

**Purpose:** Rank companies by DJI Dock posting activity. Answer "who is most active?"

```
┌──────────────────────────────────────────────────────────────────────┐
│  COMPANY ACTIVITY LEADERBOARD                    [30d ▼] [Refresh]  │
├──────────────────────────────────────────────────────────────────────┤
│  Filter: [All ▼] [Rising ▼] [LinkedIn ▼] [France ▼]    🔍 Search   │
├──────────────────────────────────────────────────────────────────────┤
│  #  Company          Posts  Avg    Trend     Sources    Last Post    │
│  ── ──────────────── ───── ─────  ────────  ─────────  ──────────── │
│  1  Aerosmart         8    72    ▲ Rising    LI GN      2d ago      │
│  2  AERONEX           6    68    ▲ Rising    LI         5d ago      │
│  3  Escadrone         5    61    ─ Stable    LI GN      1d ago      │
│  4  DroneVolt         4    55    ▼ Declining GN         12d ago     │
│  5  Abot              3    58    ★ New       LI         3d ago      │
│  └── [Expand Row] ───────────────────────────────────────────────── │
│      Timeline: ●──●───●●──●──●──●                                   │
│      Posts:  [Mar 2] DJI Dock 2 deployment... (75)                   │
│              [Mar 8] Solar inspection fleet... (68)                  │
│              [Mar 15] Partnership with Total... (72)                 │
│      Contacts: Jean Dupont (CEO) • Marie L. (Ops Director)          │
│      [→ Add to Pipeline] [→ LinkedIn] [→ Website]                   │
├──────────────────────────────────────────────────────────────────────┤
│  Showing 24 active companies │ 3 rising │ 2 new in last 7d          │
└──────────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- Sortable by: post count, avg score, trend, last post date
- Trend indicator: computed from 30d vs prior 30d comparison
  - ▲ Rising: 30d count > prior 30d count
  - ─ Stable: roughly equal
  - ▼ Declining: 30d count < prior 30d count
  - ★ New: first_seen_at within last 14 days
- Source badges: LI (LinkedIn), GN (Google News)
- Expandable row: post timeline, individual articles, contacts, action buttons
- Filter by: trend, source, country, time window (30d/60d/90d/all)

### Panel 2: Activity Timeline (Trend View)

**Purpose:** Visualize posting patterns over time. Answer "is activity increasing?"

```
┌──────────────────────────────────────────────────────────────────────┐
│  ACTIVITY TIMELINE                               [60 days ▼]        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Posts/week across all tracked companies:                            │
│                                                                      │
│  12 │                                          ██                    │
│  10 │                              ██          ██  ██               │
│   8 │                    ██        ██    ██    ██  ██  ██           │
│   6 │          ██        ██  ██    ██    ██    ██  ██  ██           │
│   4 │    ██    ██  ██    ██  ██    ██    ██    ██  ██  ██           │
│   2 │    ██    ██  ██    ██  ██    ██    ██    ██  ██  ██           │
│     └────W1────W2──W3────W4──W5────W6────W7────W8──W9──W10──────    │
│          Feb                    Mar                                   │
│                                                                      │
│  ■ LinkedIn (67%)  ■ Google News (33%)                               │
│                                                                      │
│  Top 3 this period: Aerosmart (8) · AERONEX (6) · Escadrone (5)     │
└──────────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- Weekly bar chart (custom CSS bars — no charting library needed, matches existing pattern)
- Color-split bars: LinkedIn vs Google News proportions
- Hover/click on a week → drill down to see which companies posted
- Configurable time window: 30d / 60d / 90d
- Summary line: top 3 most active companies in period

### Panel 3: Reachability Matrix

**Purpose:** Cross-reference activity with contact data. Answer "who can we actually reach?"

```
┌──────────────────────────────────────────────────────────────────────┐
│  REACHABILITY MATRIX                              [Active only ▼]    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┬──────┬────────┬───────┬─────────┬──────────────┐   │
│  │ Company     │Posts │Website │LinkedIn│Contacts │ Pipeline     │   │
│  ├─────────────┼──────┼────────┼───────┼─────────┼──────────────┤   │
│  │ Aerosmart   │  8   │  ✓     │  ✓    │ 2 ppl   │ —            │   │
│  │ AERONEX     │  6   │  ✓     │  ✓    │ 1 ppl   │ Prospect     │   │
│  │ Escadrone   │  5   │  ✓     │  ✗    │ 0 ppl   │ —            │   │
│  │ Abot        │  3   │  ✗     │  ✓    │ 1 ppl   │ —            │   │
│  └─────────────┴──────┴────────┴───────┴─────────┴──────────────┘   │
│                                                                      │
│  Coverage: 18/24 have website │ 15/24 have LinkedIn │ 9/24 in pipe  │
│                                                                      │
│  ⚠ Enrichment gaps: 6 missing website, 9 missing LinkedIn,          │
│    15 with 0 contacts — [Run Enrichment]                             │
└──────────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- Shows data completeness per company
- Highlights enrichment gaps (missing website, LinkedIn, contacts)
- Pipeline status column — who's already in the deal pipeline
- "Run Enrichment" action for batch gap-filling
- Sort by gaps (companies with most missing data first → enrichment priority)

---

## Data Flow

```
                    ┌─────────────────┐
                    │ Daily Scheduler  │
                    │ (10:21 AM IST)   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Collect (Step 1)│  Google News + LinkedIn
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Score (Step 2)  │  Gemini → scored_articles
                    └────────┬────────┘
                             │
                    ┌────────▼─────────────────────┐
                    │  upsertDiscoveredFromArticles │  Aggregates entities
                    │  (already runs post-scoring)  │  into discovered_companies
                    └────────┬─────────────────────┘
                             │
                    ┌────────▼─────────────────────┐   ← NEW
                    │  refreshActivityMetrics()     │   Compute:
                    │  (runs after upsert)          │   - post_frequency_30d/60d
                    │                               │   - avg_score, max_score
                    │                               │   - activity_trend
                    │                               │   - sources_seen
                    └────────┬─────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Analytics Tab   │   Leaderboard + Timeline
                    │  (Partner Dash)  │   + Reachability Matrix
                    └─────────────────┘
```

### refreshActivityMetrics() — The Core Function

```sql
-- For each company in discovered_companies:
UPDATE discovered_companies SET
  post_frequency_30d = (
    SELECT COUNT(*) FROM scored_articles sa
    JOIN articles a ON sa.article_id = a.id
    WHERE LOWER(sa.company) = dc.normalized_name
    AND a.published_at >= NOW() - INTERVAL '30 days'
    AND sa.relevance_score >= 25
  ),
  post_frequency_60d = (similar for 60 days),
  avg_score = (SELECT AVG(sa.relevance_score) ...),
  max_score = (SELECT MAX(sa.relevance_score) ...),
  activity_trend = CASE
    WHEN first_seen_at >= NOW() - INTERVAL '14 days' THEN 'new'
    WHEN count_30d > count_prior_30d * 1.3 THEN 'rising'
    WHEN count_30d < count_prior_30d * 0.7 THEN 'declining'
    ELSE 'stable'
  END,
  sources_seen = (SELECT ARRAY_AGG(DISTINCT a.source) ...),
  activity_updated_at = NOW()
FROM discovered_companies dc;
```

---

## Implementation Phases

### Phase 1: Data Layer (1-2 hours)
1. Migration: Add 8 new columns to `discovered_companies`
2. `refreshActivityMetrics()` function in `db.ts`
3. Call it after `upsertDiscoveredFromArticles()` in score route
4. API endpoint: `GET /api/company-activity` with filters (trend, source, country, time window)

### Phase 2: Leaderboard Panel (2-3 hours)
1. New component: `CompanyActivityLeaderboard.tsx`
2. Sortable table with trend indicators, source badges
3. Expandable rows with article timeline + contacts
4. Filters: trend, source, country, time window
5. Add as new tab in Partner Dashboard

### Phase 3: Timeline Panel (1-2 hours)
1. Weekly aggregation query
2. Custom CSS bar chart (no library — matches existing UI pattern)
3. Source-split coloring (LinkedIn blue, GN green)
4. Drill-down on week click

### Phase 4: Reachability Matrix (1 hour)
1. Cross-reference discovered_companies with discovered_contacts + pipeline_leads
2. Gap highlighting
3. Coverage stats

### Phase 5: Auto-refresh Integration (30 min)
1. Hook `refreshActivityMetrics()` into the daily scheduler flow
2. Add "Last refreshed: X ago" indicator in UI

**Total estimate: 6-8 hours across phases**

---

## Forward-Looking Considerations

### 1. Company Clustering
Companies that post about the same projects/use cases could be clustered. "These 3 companies all post about solar inspection with DJI Dock in France" — group BD outreach.

### 2. Competitive Intelligence
If a company that was "Rising" suddenly goes "Declining," it could mean they chose a competitor. Worth flagging.

### 3. Social Graph
Over time, persons[] in scored_articles builds a contact network. "Jean Dupont posted for Aerosmart 5x and was tagged by AERONEX 2x" — relationship mapping.

### 4. Outreach Timing
"Aerosmart posts every Tuesday" — pattern detection for optimal outreach timing.

### 5. Activity Score (composite)
Combine post frequency + avg relevance + recency + contact completeness into a single "Activity Score" for pipeline prioritization. Formula:
```
activity_score =
  (post_frequency_30d × 3) +      -- recent activity weight
  (avg_score × 0.5) +              -- quality weight
  (contacts_count × 5) +           -- reachability weight
  (has_website ? 5 : 0) +          -- enrichment bonus
  (has_linkedin ? 5 : 0) +
  (trend == 'rising' ? 10 : 0)     -- momentum bonus
```

### 6. Email Digest Integration (backlog)
When email notifications are built, the weekly digest could include:
- "3 new companies discovered this week"
- "Aerosmart is Rising — 4 posts in 7 days"
- "5 companies have enrichment gaps — [Enrich Now]"
