# PRD: Multi-Source Funnel Expansion

## v1.0 | 2026-03-16 · Expert Review: 2026-03-16

---

## 0. Expert Panel Review — Findings & Open Questions

> **Status**: Implementation paused pending LinkedIn extraction priority (see §0.4).
> This section documents analysis conducted before any implementation work begins.
> All original PRD content (§1 onward) is unchanged — gaps are annotated here, not inline.

---

### 0.1 Foundational Architecture Mismatch (Blocker for All Phases)

**Finding**: The PRD specifies all new collectors as Supabase Edge Functions (`supabase/functions/collect-*/index.ts`, Deno runtime). The actual codebase has **no Supabase Edge Functions** — all backend logic runs as Next.js API routes (`src/app/api/collect/route.ts`, Node.js runtime).

**Impact**: Every file path in §13 ("Files to Create / Modify") is wrong. All new collectors must follow the existing pattern:

| PRD specifies | Correct path |
|---|---|
| `supabase/functions/collect-alert-rss/index.ts` | `src/app/api/collect-alert-rss/route.ts` |
| `supabase/functions/collect-news-api/index.ts` | `src/app/api/collect-news-api/route.ts` |
| `supabase/functions/collect-trade-rss/index.ts` | `src/app/api/collect-trade-rss/route.ts` |
| `supabase/functions/collect-news-api-alt/index.ts` | `src/app/api/collect-news-api-alt/route.ts` |

The shared utilities (§14) also do not go in `supabase/functions/_shared/` — they belong in `src/lib/` alongside existing shared logic (`dedup.ts`, `db.ts`, `google-news-rss.ts`).

**Resolution**: All implementation plans must use the Next.js API route pattern. No code changes to Supabase needed beyond DB migrations.

---

### 0.2 Shared Utilities — What Already Exists vs. What Needs Extracting

§14 proposes extracting shared utilities from `collect-news/index.ts`. That file does not exist. The equivalent logic already lives in:

| PRD proposes extracting | Already exists at |
|---|---|
| `rss-parser.ts` | `src/lib/google-news-rss.ts` — `searchGoogleNewsRss`, XML regex parser |
| `dedup.ts` | `src/lib/dedup.ts` — `deduplicateWithinRun`, `gateTwoDedup`, Jaccard logic |
| `article-store.ts` | `src/lib/db.ts` — `insertArticles`, `insertRun` |

No extraction work is needed before Phase I. New collectors import directly from these existing `src/lib/` modules.

---

### 0.3 Phase I-A Deep Analysis: Alert-Based RSS Monitor

#### Integration shape (corrected)

```
User selects "Alert Feed" checkbox + clicks Collect
  → CollectPanel calls /api/collect-alert-rss
  → Route fetches RSS for each keyword from configured feed URLs
  → Parses XML (reuse google-news-rss.ts parser pattern)
  → Resolves redirect-wrapped destination URLs
  → Strips HTML from titles/snippets
  → Dedup via deduplicateWithinRun + DB-level normalized_url check
  → Stores with source = "alert_rss"
  → Returns PipelineStats to client for merge with other source stats
```

#### Code changes required

| File | Change |
|------|--------|
| `src/app/api/collect-alert-rss/route.ts` | New collector — alert RSS fetch, parse, dedup, store |
| `src/lib/types.ts` | Add `"alert_rss"` to `ArticleSource` union |
| `src/lib/constants.ts` | Add `alert_rss` to `SOURCE_LABELS` + `SOURCE_BADGE_COLORS` |
| `src/hooks/use-collect.ts` | Extend for multi-source calls |
| `src/components/collect/CollectPanel.tsx` | Wire source selection into collect flow |
| `src/components/collect/SourcesPanel.tsx` | Make source checkboxes stateful (currently decorative) |

#### Open questions (must be answered before implementation)

**Q1 (Blocker): Which alert service, and does it support keyword-parameterized URLs?**

The PRD config shows `"feedUrlTemplate": "https://<alert-service>/rss?q={keyword}&hl=en"` — implying you can construct a feed URL by substituting a keyword at runtime. No major alert service works this way:

- **Google Alerts**: Feed URLs are `google.com/alerts/feeds/{userId}/{alertId}` — one URL per saved alert, per account. Cannot be parameterized. You must manually create an alert per keyword and get a unique URL.
- **Talkwalker Alerts**: Same per-account, per-keyword model.
- **Programmatic RSS with keyword query param**: Does not exist as a free service.

If Google Alerts is the intended provider, the architecture changes: the collector fetches a **list of pre-configured feed URLs** (stored in DB or env config), not parameterized keyword templates. The keyword → alert URL mapping must be maintained manually.

> Decision needed: (a) Which service? (b) Are per-keyword alert URLs pre-created and ready, or does this require account setup first?

**Q2 (Blocker): Server-side fan-out or client-side parallel source calls?**

The PRD (§10) describes client-side orchestration — `handleCollect()` fires `Promise.allSettled` across multiple source endpoints. But the current architecture has a single `useCollect()` hook calling one endpoint. Two valid paths:

- **Option A — Client-side parallel** (PRD's intent): `CollectPanel` calls multiple `/api/collect-*` endpoints in parallel, merges results. More UI work, enables per-source progress display. Requires `SourcesPanel` to become stateful and wire into `CollectPanel`.
- **Option B — Server-side fan-out**: A single `/api/collect-all` endpoint fans out to multiple sources internally, returns merged results. Minimal UI change, but loses per-source error isolation in the UI.

> Decision needed before any orchestration code is written.

**Q3 (Soft): `PipelineStats` type — extend or wrap?**

The PRD introduces `PipelineBreakdown` with per-source fields (`perSource`, `crossSourceDedupRemoved`, `uniquePerSource`). The codebase has `PipelineStats` (different field names) used throughout the UI. Two options:

- **Extend in place**: Add optional `perSource?: Record<ArticleSource, number>` to existing `PipelineStats`. Low risk, backward-compatible.
- **New wrapper type**: `MultiSourceStats` wraps per-source `PipelineStats` entries. Cleaner long-term but requires updating all call sites.

**Q4 (Soft): Redirect resolution in Node.js context**

Alert feeds wrap destination URLs in redirect chains (e.g., `google.com/url?q=…`). The PRD says use `fetch` with `redirect: 'follow'` and read `response.url`. In Node.js undici (Next.js runtime), this works — but Google's redirect wrapper may return a 403 or intermediate page without a browser User-Agent header. Need to probe whether bare `fetch` + a realistic User-Agent is sufficient or whether we need explicit URL extraction from the query parameter.

#### Implementation steps (post-decision)

1. Confirm alert service + have feed URLs ready
2. Add `"alert_rss"` to types + constants (safe, additive, 5 min)
3. Build `src/app/api/collect-alert-rss/route.ts` (~100 lines, reuses existing lib)
4. Make `SourcesPanel` stateful; wire into `CollectPanel`
5. Extend `useCollect` or add orchestration per chosen model (Q2)
6. Extend `PipelineStats` type + update display component

---

### 0.4 Implementation Priority Change

**Decision (2026-03-16)**: Phase I-A (Alert RSS) and subsequent phases are paused.

**Immediate priority: LinkedIn content extraction** — LinkedIn is already listed as a source type (`ArticleSource = "linkedin"`) but has no implementation behind it. Extracting real LinkedIn content produces immediate signal value with no dependency on external alert service accounts or API keys.

LinkedIn work will proceed before returning to Phase I-A. This PRD will be updated with Phase I-A decisions once LinkedIn extraction is complete and the orchestration model decision (Q2 above) is settled by that implementation.

---

## 1. Context & Motivation

The current top-of-funnel relies on a single scalable news source (a search engine news RSS feed) plus two social media scrapers that require local browser sessions. This creates three blind spots:

1. **Editorial filtering** — the primary news RSS applies opaque editorial ranking; niche drone trade publications, press releases, and regional outlets often don't surface
2. **Algorithm monoculture** — a single search algorithm means a single set of biases; articles surfaced by one search engine may be entirely absent from another
3. **No always-on monitoring** — there is no "set and forget" alerting layer that catches articles between manual collection runs

For competitive intelligence around products like DJI Dock, where relevant signals appear in trade journals, regional government procurement sites, and non-English press, we need **diverse, complementary sources** — not just more volume from the same pipe.

---

## 2. Phased Roadmap

| Phase | Source Type | Description | Effort |
|-------|-----------|-------------|--------|
| **I-A** | Alert-based RSS Monitor | Always-on keyword alerts delivered as RSS — catches long-tail sources the primary feed misses | 1-2 days |
| **I-B** | News Search API | A second news aggregator with JSON API, different editorial algorithm, better non-English coverage | 1-2 days |
| **I-C** | Curated Trade RSS Feeds | Hand-picked industry publication RSS feeds (drone/UAV vertical press) | 1 day |
| **II-A** | Secondary News Search API | A third news search engine API for maximum dedup-resistant coverage | 2-3 days |
| **II-B** | Community Forum Monitor | Technical community discussions (early adopter feedback, deployment reports, competitor comparisons) | 3-4 days |

---

## 3. Architecture Principles

### 3.1 Convention Over Contract

The codebase uses a **convention-based source pattern**, not a formal interface. Every source:

- Accepts `{ keywords, filterDays, ...sourceSpecificParams }`
- Returns `{ run, articles, allFetched, pipeline }`
- Writes to `collected_articles` with a unique `source` value
- Shares `collection_runs` for run tracking

New sources MUST follow this exact convention. No orchestrator changes are needed — the UI calls each source's endpoint conditionally and merges results.

### 3.2 Additive, Non-Blocking

Each source is independent. If one source fails, others still return results. The UI shows a warning toast for failed sources but does not block the pipeline.

### 3.3 Cross-Source Dedup

With 5+ sources hitting the same stories, **cross-source dedup at collection time** becomes critical. Currently, Gate 1 dedup runs per-source. We need a unified dedup pass after all sources return (see §6.3).

### 3.4 Source Attribution

Every article carries a `source` field. The scoring pipeline is source-agnostic but the UI shows source badges. Source-specific scoring adjustments (e.g., engagement metrics from social sources) are handled in the scoring prompt, not the collector.

---

## 4. Database Changes

### 4.1 Extend `ArticleSource` Type

```sql
-- Migration: extend source column to support new sources
-- No ALTER needed — source is TEXT, not ENUM
-- Application-level type update only
```

In `src/lib/types.ts`:
```typescript
// Before
export type ArticleSource = "google_news" | "linkedin" | "facebook";

// After (Phase I + II)
export type ArticleSource =
  | "google_news"
  | "linkedin"
  | "facebook"
  | "alert_rss"        // Phase I-A: Alert-based RSS monitor
  | "news_api"         // Phase I-B: News search API
  | "trade_rss"        // Phase I-C: Curated trade publication feeds
  | "news_api_alt"     // Phase II-A: Secondary news search API
  | "community_forum"; // Phase II-B: Community forum monitor
```

### 4.2 New Table: `source_configs` (Phase I)

Stores configuration for each source — API keys, feed URLs, enabled state. Avoids hardcoding source-specific config in edge functions.

```sql
CREATE TABLE source_configs (
  id TEXT PRIMARY KEY,                   -- e.g., "news_api", "trade_rss"
  source_type TEXT NOT NULL,             -- matches ArticleSource
  display_name TEXT NOT NULL,            -- e.g., "Industry News API"
  enabled BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',             -- source-specific: { apiKey, baseUrl, feeds[], ... }
  rate_limit_per_day INTEGER,            -- optional daily call cap
  calls_today INTEGER DEFAULT 0,         -- rolling counter, reset by cron
  last_reset_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Why JSONB config?** Each source has different parameters (API base URL, feed list, auth headers). A flexible JSONB column avoids schema changes for each new source.

### 4.3 New Table: `trade_feeds` (Phase I-C)

Stores curated RSS feed URLs for trade publications.

```sql
CREATE TABLE trade_feeds (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,                    -- e.g., "sUAS News"
  feed_url TEXT NOT NULL UNIQUE,
  category TEXT DEFAULT 'drone',         -- for future filtering
  language TEXT DEFAULT 'en',
  enabled BOOLEAN DEFAULT true,
  last_fetched_at TIMESTAMPTZ,
  articles_lifetime INTEGER DEFAULT 0,   -- total articles ever fetched
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed with initial feeds (indicative — actual feeds to be curated)
INSERT INTO trade_feeds (name, feed_url, category) VALUES
  ('Trade Publication A', 'https://example-drone-news.com/feed/', 'drone'),
  ('Trade Publication B', 'https://example-uav-journal.com/rss', 'drone'),
  ('Trade Publication C', 'https://example-commercial-drones.com/feed', 'drone'),
  ('Trade Publication D', 'https://example-inside-unmanned.com/feed', 'drone'),
  ('Trade Publication E', 'https://example-uas-magazine.com/rss', 'drone');
  -- Developer to populate with real feed URLs during implementation
```

### 4.4 Extend `SOURCE_LABELS` and `SOURCE_COLORS`

```typescript
export const SOURCE_LABELS: Record<ArticleSource, string> = {
  google_news: "Google News",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  alert_rss: "Alert Feed",
  news_api: "News API",
  trade_rss: "Trade Press",
  news_api_alt: "News API (Alt)",
  community_forum: "Community",
};

export const SOURCE_COLORS: Record<ArticleSource, string> = {
  google_news: "bg-source-gnews/15 text-source-gnews border-source-gnews/30",
  linkedin: "bg-source-linkedin/15 text-source-linkedin border-source-linkedin/30",
  facebook: "bg-[#1877F2]/15 text-[#1877F2] border-[#1877F2]/30",
  alert_rss: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  news_api: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  trade_rss: "bg-violet-500/15 text-violet-600 border-violet-500/30",
  news_api_alt: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  community_forum: "bg-orange-500/15 text-orange-600 border-orange-500/30",
};
```

---

## 5. Phase I-A: Alert-Based RSS Monitor

### 5.1 Concept

A keyword-alert service that generates RSS feeds for monitored terms. This catches articles from long-tail sources that the primary news RSS deprioritizes — regional outlets, press releases, niche blogs.

**Why it's different from primary news RSS**: The primary RSS applies editorial ranking (popularity, authority). Alert feeds use a broader net — they surface anything matching the keywords regardless of source authority.

### 5.2 Backend

**New edge function**: `supabase/functions/collect-alert-rss/index.ts`

**How it works**:
1. For each keyword, fetch from the alert service's RSS endpoint
2. Parse XML/Atom feed (reuse existing RSS XML regex parser from primary news collector)
3. Extract: title, link, snippet, published date, source name
4. Resolve redirected URLs (alert feeds often use redirect wrappers)
5. Generate article ID: `sha256(normalizedUrl | keyword)`
6. Apply Gate 1 dedup (URL normalization + title Jaccard 0.80)
7. Apply date filter
8. Store in `collected_articles` with `source = "alert_rss"`

**Request**:
```typescript
{
  keywords: string[];
  filterDays: number;
  // Alert feed URLs are either derived from keywords or stored in source_configs
}
```

**Response**: Standard shape `{ run, articles, allFetched, pipeline }`

**Key implementation notes**:
- Alert feeds often use URL redirects — the collector MUST resolve the final URL before dedup (use `fetch` with `redirect: 'follow'` and read `response.url`)
- Alert feeds may include HTML in titles/snippets — strip tags before storage
- Rate: No API key needed for most alert RSS services. No cost.
- The feed URL format is source-specific — store the URL template in `source_configs.config.feedUrlTemplate` so the developer can swap providers without code changes

### 5.3 Configuration

Store in `source_configs`:
```json
{
  "id": "alert_rss",
  "source_type": "alert_rss",
  "display_name": "Alert Feed",
  "config": {
    "feedUrlTemplate": "https://<alert-service>/rss?q={keyword}&hl=en",
    "supportedLanguages": ["en", "zh-CN", "ja", "ko"],
    "resolveRedirects": true,
    "maxArticlesPerKeyword": 30
  }
}
```

### 5.4 Multilingual Alerts

For DJI Dock competitive intelligence, create alerts in multiple languages:
- English: "DJI Dock", "DJI Dock 2", "drone dock station"
- Chinese: "大疆机场", "大疆机场2"
- Japanese: "DJIドック"
- Korean: "DJI 독"

These are **additional keywords**, not separate sources. The user adds them in the keyword input (Step1Panel already supports any string as a keyword). The alert collector passes them through as-is.

---

## 6. Phase I-B: News Search API

### 6.1 Concept

A JSON-based news aggregation API that provides:
- Full-text keyword search (not just title matching)
- Language and country filters
- Different editorial algorithm from the primary news RSS
- Better coverage of press releases and trade publications

**Why it's different**: The primary news RSS searches titles and applies popularity ranking. A news search API searches full article text and uses recency + relevance ranking — surfacing different articles for the same query.

### 6.2 Backend

**New edge function**: `supabase/functions/collect-news-api/index.ts`

**How it works**:
1. Read API key and base URL from `source_configs` (or Supabase secrets)
2. For each keyword × language combination, call the search endpoint
3. Parse JSON response → extract: title, url, description, publishedAt, sourceName
4. Generate article ID: `sha256(normalizedUrl | keyword)`
5. Apply Gate 1 dedup
6. Apply date filter
7. Store with `source = "news_api"`

**Request**:
```typescript
{
  keywords: string[];
  filterDays: number;
  languages?: string[];   // Optional — defaults to ["en"]
  countries?: string[];   // Optional — maps to API's country param
}
```

**Response**: Standard shape `{ run, articles, allFetched, pipeline }`

**Key implementation notes**:
- API pagination: Most news APIs return 10-100 results per page. Fetch up to 3 pages per keyword (cap at 100 results per keyword)
- Rate limits: Respect the provider's rate limit. If the provider enforces daily caps, check `source_configs.calls_today` before calling. Increment after each call.
- The API base URL, auth header name, and response schema should be configurable in `source_configs.config` so the provider can be swapped without code changes:

```json
{
  "id": "news_api",
  "source_type": "news_api",
  "display_name": "News Search API",
  "config": {
    "baseUrl": "https://<provider>/api/v4/search",
    "authHeader": "X-Api-Key",
    "maxResultsPerKeyword": 100,
    "maxPagesPerKeyword": 3,
    "defaultLanguage": "en",
    "supportedLanguages": ["en", "es", "de", "fr", "pt", "ja", "ko", "zh"],
    "responseMapping": {
      "articlesPath": "articles",
      "titleField": "title",
      "urlField": "url",
      "descriptionField": "description",
      "publishedField": "publishedAt",
      "sourceField": "source.name"
    }
  }
}
```

### 6.3 Response Mapping Abstraction

Different news API providers return slightly different JSON shapes. The `responseMapping` config allows the collector to adapt without code changes:

```typescript
function mapApiResponse(raw: any, mapping: ResponseMapping): RSSArticle[] {
  const articles = getNestedValue(raw, mapping.articlesPath) || [];
  return articles.map((item: any) => ({
    title: getNestedValue(item, mapping.titleField),
    url: getNestedValue(item, mapping.urlField),
    snippet: getNestedValue(item, mapping.descriptionField),
    publishing_agency: getNestedValue(item, mapping.sourceField),
    published_at: getNestedValue(item, mapping.publishedField),
  }));
}
```

This way, switching from Provider A to Provider B requires only a config change in `source_configs`, not a code deployment.

### 6.4 Cost Management

- Store the provider's daily call limit in `source_configs.rate_limit_per_day`
- Before each collection run, check `calls_today < rate_limit_per_day`
- Increment `calls_today` after each API call (not per keyword — per actual HTTP request)
- Reset `calls_today` to 0 daily (Supabase cron or application-level check against `last_reset_at`)
- Show remaining quota in the UI (Step1Panel) as a subtle indicator next to the source checkbox

---

## 7. Phase I-C: Curated Trade Publication RSS Feeds

### 7.1 Concept

A curated list of drone/UAV industry publication RSS feeds. These are niche sources that the primary news RSS and general news APIs underindex — trade journals, industry blogs, and specialized press.

**Why it's different**: Trade publications publish in-depth deployment case studies, product comparisons, and regulatory analysis that general news aggregators often miss or bury.

### 7.2 Feed Curation

The initial feed list should include 15-20 publications covering:

| Category | Example Publications (indicative) |
|----------|----------------------------------|
| Drone news vertical | Leading drone news sites, UAV journals, commercial UAV publications |
| Enterprise/industrial | Industrial drone magazines, unmanned systems journals |
| Government/regulatory | Aviation authority feeds, government procurement RSS |
| Regional (Asia) | Asia-Pacific drone industry publications |
| Tech press (selective) | Technology news sites with drone/robotics sections |

**Feed management**: Feeds are stored in the `trade_feeds` table. The developer adds/removes feeds via direct DB inserts. A future Phase 3 enhancement could add a UI for feed management.

### 7.3 Backend

**New edge function**: `supabase/functions/collect-trade-rss/index.ts`

**How it works**:
1. Fetch all enabled feeds from `trade_feeds` table
2. For each feed, fetch and parse RSS/Atom XML
3. For each article in each feed:
   a. Check if any keyword appears in title OR description (case-insensitive substring match)
   b. If no keyword match → skip (trade feeds are unfiltered, so keyword relevance filtering is essential)
4. Generate article ID: `sha256(normalizedUrl | keyword_matched)`
5. Apply Gate 1 dedup
6. Apply date filter
7. Store with `source = "trade_rss"`
8. Update `trade_feeds.last_fetched_at` and `articles_lifetime`

**Request**:
```typescript
{
  keywords: string[];
  filterDays: number;
  // Feed list comes from DB, not request
}
```

**Response**: Standard shape `{ run, articles, allFetched, pipeline }`

**Key implementation notes**:
- RSS/Atom format detection: Some feeds use RSS 2.0 (`<item>`), others use Atom (`<entry>`). The parser should handle both.
- Feed errors are non-fatal: If one feed is down, log a warning and continue with others
- Keyword matching in description is important because trade publication titles are often generic ("New Partnership Announced") while the description contains the specifics ("DJI and XYZ Corp...")
- Max 50 articles per keyword match across all feeds (same cap as other sources)
- Feeds with `enabled = false` are skipped

### 7.4 Feed Health Monitoring

Track feed reliability:
- If a feed returns 0 articles 5 consecutive times → auto-set `enabled = false` and log
- If a feed consistently returns errors → mark disabled
- `articles_lifetime` counter helps identify which feeds are productive

---

## 8. UI Changes (Phase I)

### 8.1 Step1Panel: Source Selection

The existing `AVAILABLE_SOURCES` object in Step1Panel expands:

```typescript
const AVAILABLE_SOURCES = {
  // Existing
  google_news: { id: "google_news", label: "Primary News", icon: Newspaper, group: "news" },
  linkedin: { id: "linkedin", label: "LinkedIn", icon: Linkedin, group: "social" },
  facebook: { id: "facebook", label: "Facebook (Coming soon)", icon: Facebook, group: "social" },

  // Phase I new sources
  alert_rss: { id: "alert_rss", label: "Alert Feed", icon: Bell, group: "news" },
  news_api: { id: "news_api", label: "News Search API", icon: Search, group: "news" },
  trade_rss: { id: "trade_rss", label: "Trade Press", icon: BookOpen, group: "news" },
} as const;
```

### 8.2 Source Selection UI Redesign

With 6+ sources, a flat list of checkboxes becomes unwieldy. Group sources into categories:

```
┌─ Data Sources ─────────────────────────────────────────┐
│                                                         │
│  News Sources                                           │
│  [x] Primary News    [x] Alert Feed                    │
│  [x] News Search API [x] Trade Press                   │
│                                                         │
│  Social Sources                                         │
│  [x] LinkedIn        [ ] Facebook (Coming soon)         │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│  Quick: [All News]  [All Social]  [All]  [None]         │
│                                                         │
│  Quota: News API — 87/100 calls remaining today         │
└─────────────────────────────────────────────────────────┘
```

**Key changes**:
- Sources grouped by category (`news` vs `social`)
- Quick-select buttons for common combinations
- Quota indicator for rate-limited APIs (reads from `source_configs.rate_limit_per_day - calls_today`)
- Each source checkbox shows an indicative icon

### 8.3 Region Selector Scope

- Region selector applies ONLY to sources that support regional editions (primary news RSS, news search API)
- Alert feed and trade RSS are region-agnostic (they fetch globally)
- Social sources have their own scoping (LinkedIn = global, Facebook = global)
- Show a subtle note: "Region filter applies to: Primary News, News Search API"

### 8.4 Pipeline Breakdown: Per-Source Stats

After collection, the pipeline breakdown should show per-source contribution:

```
┌─ Pipeline Breakdown ──────────────────────────────────────┐
│                                                            │
│  Fetched from sources               247                    │
│    ├─ Primary News                    89                   │
│    ├─ Alert Feed                      43                   │
│    ├─ News Search API                 72                   │
│    ├─ Trade Press                     18                   │
│    └─ LinkedIn                        25                   │
│                                                            │
│  ↓ −62 duplicates removed (cross-source)                   │
│  After dedup                         185                   │
│  ↓ −31 older than 30 days                                  │
│  After date filter                   154                   │
│  ↓ −104 capped at 50                                       │
│  Stored for scoring                   50                   │
│                                                            │
│  Source diversity: 4 sources contributed                    │
│  Unique from Alert Feed: 12 (articles found ONLY here)     │
│  Unique from Trade Press: 8 (articles found ONLY here)     │
└────────────────────────────────────────────────────────────┘
```

**New pipeline fields**:
```typescript
interface PipelineBreakdown {
  // ... existing fields ...
  perSource?: Record<string, number>;        // articles fetched per source
  crossSourceDedupRemoved?: number;          // removed by cross-source dedup
  uniquePerSource?: Record<string, number>;  // articles found ONLY by this source
}
```

### 8.5 Article Table: Source Column

Already exists in the article table dialog. The `source` badge now shows the new source types with their respective colors. No structural change needed — just ensure `SOURCE_LABELS` and `SOURCE_COLORS` include the new values.

### 8.6 Step2Panel: No Changes

The scoring pipeline is source-agnostic. `score-articles` already handles all article types. No changes needed.

### 8.7 Step3Panel: Source Attribution

In the opportunity pack view, show which source the original article came from. This helps the user understand which sources are producing actionable leads.

---

## 9. Cross-Source Dedup (Phase I Critical)

### 9.1 Problem

With 4+ news sources, the same story will be fetched by multiple collectors. Current per-source dedup catches within-source duplicates but not cross-source ones.

### 9.2 Solution: Client-Side Cross-Source Dedup

After all source collectors return, **before storing**, apply a cross-source dedup pass in Step1Panel's `handleCollect()`:

```typescript
// After all sources return results
const allArticlesFromAllSources = [
  ...googleNewsArticles,
  ...alertRssArticles,
  ...newsApiArticles,
  ...tradeRssArticles,
  ...linkedInArticles,
];

// Cross-source dedup (same logic as existing clientDedup)
const { kept, removed } = clientDedup(allArticlesFromAllSources);
// 'kept' set contains IDs of articles that survive dedup
// Priority: keep the article from the source with richer metadata
```

### 9.3 Dedup Priority

When two sources return the same article, keep the one with richer metadata:
1. **Has snippet** > no snippet
2. **Has publishing_agency** > no agency
3. **Has published_at** > no date
4. **Primary news** > alert feed (primary news has better source attribution)
5. **First seen** wins (if tied)

### 9.4 Backend Cross-Source Dedup

The existing DB-level dedup (checking `collected_articles` for existing URLs and fuzzy title matches) already handles cross-batch cross-source duplicates. Each collector independently checks the DB before inserting. This is sufficient — no additional backend coordination needed.

---

## 10. Orchestration Changes in `handleCollect()`

### 10.1 Parallel Execution

All news sources (primary, alert, news API, trade RSS) can run **in parallel** since they're independent. Social sources (LinkedIn, Facebook) also run in parallel with news sources.

```typescript
const handleCollect = async () => {
  // ... validation ...

  // Fire all selected sources in parallel
  const promises: Promise<SourceResult>[] = [];

  if (selectedSources.includes("google_news")) {
    promises.push(collectFromPrimaryNews(keywords, filterDays, resolvedRegions));
  }
  if (selectedSources.includes("alert_rss")) {
    promises.push(collectFromAlertRSS(keywords, filterDays));
  }
  if (selectedSources.includes("news_api")) {
    promises.push(collectFromNewsAPI(keywords, filterDays, resolvedRegions));
  }
  if (selectedSources.includes("trade_rss")) {
    promises.push(collectFromTradeRSS(keywords, filterDays));
  }
  if (selectedSources.includes("linkedin")) {
    promises.push(collectFromLinkedIn(keywords, filterDays));
  }

  // Wait for all, handle individual failures gracefully
  const results = await Promise.allSettled(promises);

  // Merge results, show warnings for failed sources
  for (const result of results) {
    if (result.status === "fulfilled") {
      mergeIntoAggregated(result.value);
    } else {
      showSourceWarning(result.reason);
    }
  }

  // Cross-source dedup on merged results
  applyCrossSourceDedup(aggregatedArticles);
};
```

### 10.2 Each Source Collector Function

Extract each source's fetch logic into a standalone async function (currently inline in `handleCollect`). This keeps the orchestration clean:

```typescript
async function collectFromPrimaryNews(keywords, filterDays, regions): Promise<SourceResult> { ... }
async function collectFromAlertRSS(keywords, filterDays): Promise<SourceResult> { ... }
async function collectFromNewsAPI(keywords, filterDays, regions): Promise<SourceResult> { ... }
async function collectFromTradeRSS(keywords, filterDays): Promise<SourceResult> { ... }
async function collectFromLinkedIn(keywords, filterDays): Promise<SourceResult> { ... }
```

Each returns a standardized `SourceResult`:
```typescript
interface SourceResult {
  sourceId: ArticleSource;
  run: CollectionRunSummary | null;
  articles: FetchedArticleSummary[];
  allFetched: FetchedArticleSummary[];
  pipeline: PipelineBreakdown;
}
```

---

## 11. Phase II-A: Secondary News Search API (Incremental)

### 11.1 Concept

A second news search API from a different provider. Different search algorithm = different articles surfaced for identical queries. Maximizes coverage diversity.

### 11.2 What's Different from Phase I-B

- Different provider, different editorial algorithm
- May have different rate limits and pricing
- Uses the **same collector pattern** as Phase I-B but with its own `source_configs` entry
- `source = "news_api_alt"`

### 11.3 Implementation

**Edge function**: `supabase/functions/collect-news-api-alt/index.ts`

Structurally identical to `collect-news-api/index.ts` — same response mapping abstraction, same dedup logic, same pipeline output. The only differences are:
- Reads from a different `source_configs` entry (`id = "news_api_alt"`)
- Different `responseMapping` in config (adapted to this provider's JSON schema)
- Different auth mechanism (some use query params, others use headers)
- `source = "news_api_alt"` on stored articles

**UI**: Appears as another checkbox in the "News Sources" group. Same UX pattern.

**DB**: No schema changes beyond the `ArticleSource` type already extended in Phase I.

### 11.4 When to Add

Add this source when Phase I sources are stable and you have data showing coverage gaps — i.e., articles appearing in this provider's results that neither the primary news RSS nor the first news API caught. Don't add preemptively.

---

## 12. Phase II-B: Community Forum Monitor (Incremental)

### 12.1 Concept

Monitor technical community forums for early adoption signals, deployment reports, and competitor discussions. These surfaces are **not news** — they're first-person accounts from practitioners.

**Value for DJI Dock intelligence**:
- Real-world deployment feedback ("just set up our DJI Dock 2, here's what we found...")
- Competitor comparisons ("DJI Dock vs [FlytBase alternative]...")
- Problem reports that signal market gaps FlytBase can fill
- Purchase intent discussions ("looking for a dock-in-a-box solution for...")

### 12.2 Backend

**New endpoint**: Add to `social-media-server.ts` as `/api/collect-community`

**Why server-side, not edge function?** Community forum APIs may require OAuth flows, cookie management, or have strict rate limits better managed by a persistent server process.

**How it works**:
1. For each keyword, search the forum's API (most major forums have JSON APIs)
2. Filter by subreddit/subforum relevant to drones (configured in `source_configs`)
3. Extract: post title, post URL, author, post body (truncated to 500 chars as snippet), post date, engagement (upvotes/comments)
4. Encode engagement in `publishing_agency` field (same pattern as LinkedIn: `"AuthorName [U:42,C:15]"` for upvotes and comments)
5. Apply keyword relevance check on title + body
6. Generate article ID, dedup, date filter, store with `source = "community_forum"`

**Configuration**:
```json
{
  "id": "community_forum",
  "source_type": "community_forum",
  "display_name": "Community Forums",
  "config": {
    "subforums": ["dji", "drones", "commercialdrones", "UAV"],
    "minEngagement": 3,
    "maxPostsPerKeyword": 25,
    "includeComments": false
  }
}
```

### 12.3 Scoring Considerations

Community posts need a modified scoring approach (similar to how LinkedIn posts already have a separate scoring prompt):
- **Source quality scoring**: Based on author karma/reputation + post engagement
- **Signal type mapping**: Posts are more likely "EXPANSION" or "OTHER" than "CONTRACT_AWARD"
- **Lead clarity**: Usually lower — community posters may not name their company
- The scoring function already has a `LINKEDIN_SCORING_PROMPT` path. Add a similar `COMMUNITY_SCORING_PROMPT` path that adjusts weights for community content.

### 12.4 UI

- Appears in "Social Sources" group alongside LinkedIn and Facebook
- Note: "Requires local server (social media server)"
- Post engagement shown in article table (decoded from `publishing_agency`)

### 12.5 Data Considerations

- Community posts are **user-generated content**, not editorial articles. They may contain opinions, inaccuracies, or promotional content.
- The scoring prompt should account for this: lower `sourceQualityScore` ceiling for community posts (max 10 instead of 20)
- Community posts rarely have named companies or people → `leadClarityScore` will typically be lower
- These posts are most valuable for **market signal detection** (what people are buying, what problems they have), not lead generation

---

## 13. Files to Create / Modify

### Phase I — New Files

| File | Purpose |
|------|---------|
| `supabase/functions/collect-alert-rss/index.ts` | Alert-based RSS collector |
| `supabase/functions/collect-news-api/index.ts` | News search API collector |
| `supabase/functions/collect-trade-rss/index.ts` | Curated trade RSS collector |
| `supabase/migrations/YYYYMMDD_source_configs.sql` | `source_configs` + `trade_feeds` tables |

### Phase I — Modified Files

| File | Change |
|------|--------|
| `src/lib/types.ts` | Extend `ArticleSource`, `SOURCE_LABELS`, `SOURCE_COLORS`, `PipelineBreakdown` |
| `src/components/signal/Step1Panel.tsx` | Grouped source selection UI, parallel orchestration, cross-source dedup, per-source pipeline stats |

### Phase II — New Files

| File | Purpose |
|------|---------|
| `supabase/functions/collect-news-api-alt/index.ts` | Secondary news search API collector |
| Server endpoint in `server/social-media-server.ts` | Community forum monitor (add route) |

### Phase II — Modified Files

| File | Change |
|------|--------|
| `supabase/functions/score-articles/index.ts` | Add community-specific scoring prompt path |
| `src/components/signal/Step1Panel.tsx` | Add Phase II sources to selection UI |

---

## 14. Shared Utilities to Extract

Before building Phase I collectors, extract common logic into shared modules to avoid duplication:

### `supabase/functions/_shared/rss-parser.ts`

Extracted from `collect-news/index.ts`:
- `parseRSSXml(xml: string): RSSArticle[]` — handles both RSS 2.0 and Atom
- `fetchWithRetry(url, retries, delayMs): Promise<Response | null>`
- `parallelBatch(tasks, concurrency, delay): Promise<T[]>`

### `supabase/functions/_shared/dedup.ts`

Extracted from `collect-news/index.ts`:
- `normalizeTitle(title: string): string`
- `getContentWords(title: string): Set<string>`
- `titleSimilarity(a: Set<string>, b: Set<string>): number`
- `normalizeUrl(url: string): string`
- `getUrlSlug(url: string): string`
- `deduplicateArticles(articles: RSSArticle[]): { deduped, removed }`
- `sha256(str: string): string`

### `supabase/functions/_shared/article-store.ts`

Extracted from `collect-news/index.ts`:
- `checkExistingArticles(supabase, articles)` — DB dedup check
- `storeNewArticles(supabase, articles, batchId, source)` — insert + re-associate logic
- `updateCollectionRun(supabase, batchId, stats)` — finalize run record

This refactoring ensures all 5+ collectors share identical dedup, storage, and run-tracking logic.

---

## 15. Testing Strategy

### Phase I Validation

For each new source, validate:

1. **Additive coverage**: Run all sources for "DJI Dock" and count articles unique to each source (found ONLY by that source). Target: each Phase I source contributes at least 5 unique articles per run.

2. **Cross-source dedup effectiveness**: Verify that the same article from 2+ sources is correctly deduplicated (URL match or title similarity ≥ 0.80). Target: zero duplicate articles in `collected_articles` after a multi-source run.

3. **Pipeline integrity**: All articles flow correctly through scoring (Step 2) regardless of source. Source-specific fields (`publishing_agency` encoding, etc.) don't break the scoring prompt.

4. **Failure isolation**: Disable one source mid-run (e.g., revoke API key). Verify other sources still complete and results are shown.

5. **Rate limit handling**: For the news search API, trigger the daily limit. Verify the UI shows a clear message and the source is skipped gracefully.

### Phase II Validation

6. **Community scoring**: Verify that community posts receive appropriately lower `sourceQualityScore` (capped at 10) and don't pollute the Hot Lead band (90-100) with opinion posts.

7. **Engagement encoding**: Verify upvote/comment counts are correctly encoded in `publishing_agency` and decoded by the scoring prompt.

---

## 16. Success Criteria

### Phase I

- [ ] 3 new sources operational and selectable in Step1Panel
- [ ] Cross-source dedup removes >80% of duplicate articles across sources
- [ ] Each source contributes unique articles not found by other sources
- [ ] Per-source pipeline stats visible in the UI
- [ ] News search API rate limit respected and quota shown in UI
- [ ] Trade RSS feeds curated (15+ feeds) and keyword-filtered
- [ ] Zero changes needed in scoring or deep-dive pipelines
- [ ] Source badges display correctly in article tables and opportunity cards

### Phase II

- [ ] Secondary news API adds measurable unique coverage
- [ ] Community forum posts scored with adjusted weights
- [ ] No false Hot Leads from community opinion posts
- [ ] All 6+ sources run in parallel with graceful failure isolation

---

## 17. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| News API provider changes pricing/terms | Source becomes unavailable | Provider-agnostic config in `source_configs`; swap provider without code changes |
| Alert RSS feed format changes | Parser breaks silently | Feed health monitoring auto-disables broken feeds |
| Too many sources = too much noise | Scoring pipeline overwhelmed, user fatigue | Max articles cap (50) applies after cross-source dedup; quality filters in Step 2 unchanged |
| Trade RSS feeds go stale | No new articles from trade sources | `articles_lifetime` counter + `last_fetched_at` tracking; auto-disable after 5 empty fetches |
| Cross-source dedup misses edge cases | Duplicate articles in scoring | DB-level UNIQUE constraint on `normalized_url` as final safety net |
| Community posts lower average signal quality | Users lose trust in scoring | Separate scoring prompt path with capped `sourceQualityScore`; source badge makes origin visible |




## Other sources suggestions from Comet browser

| Source              | Type           | Signal Type            | Automation Feasibility | DJI Dock Relevance |
| ------------------- | -------------- | ---------------------- | ---------------------- | ------------------ |
| DroneDJ             | Dedicated News | Breaking news          | RSS feed               | High               |
| DroneXL             | Dedicated News | Rumors & leaks         | RSS feed               | High               |
| TheNewCamera        | Dedicated News | Product timelines      | RSS feed               | High               |
| sUAS News           | Trade Media    | Enterprise/regulatory  | RSS feed               | Very High          |
| DJI Enterprise Blog | First-party    | Official announcements | RSS feed               | Very High          |
| GlobeNewswire       | Wire Service   | PR/partnerships        | Search + RSS           | High               |
| PR Newswire         | Wire Service   | PR/partnerships        | Search                 | High               |
| Reddit r/dji        | Community      | Sentiment/UGC          | API / keyword alert    | Medium             |
| X/Twitter           | Social         | Real-time chatter      | Keyword monitoring     | Medium             |
| Bing News           | Aggregator     | Broad news             | RSS via rss.app        | High               |
| Feedly/Inoreader    | RSS Aggregator | Multi-source           | Direct API             | High               |