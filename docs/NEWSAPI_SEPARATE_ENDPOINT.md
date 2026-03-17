# NewsAPI Separate Collection Endpoint

## Overview

Your system now supports standalone NewsAPI article collection through `/api/collect-newsapi`. This endpoint:

- Fetches **only from NewsAPI** (no Google News RSS)
- Uses the same filtering/deduplication pipeline as the main collection
- Returns articles in the same format for scoring
- Automatically stores articles in the database for queue integration
- Supports historical searches via date range

## API Endpoint

### POST `/api/collect-newsapi`

Dedicated endpoint for NewsAPI-only collection with a simplified interface (no regions since NewsAPI doesn't use them).

#### Request Body

```typescript
{
  keywords: string[];           // Required: Article search keywords
  filterDays: number;           // Required: Number of days to look back
  maxArticles?: number;         // Optional: Max articles to return (default: 20)
  minScore?: number;            // Optional: Minimum relevance score (default: 40)
  start_date?: string;          // Optional: YYYY-MM-DD for historical searches
  end_date?: string;            // Optional: YYYY-MM-DD for historical searches
  campaign?: string;            // Optional: Campaign identifier
}
```

#### Response

```typescript
{
  articles: Article[];
  stats: PipelineStats;
  runId: string;
  keywords: string[];
  filterDays: number;
  campaign?: string;
}
```

## Usage Examples

### 1. Basic Usage via cURL

```bash
curl -X POST http://localhost:3000/api/collect-newsapi \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["drone regulations", "UAV policy"],
    "filterDays": 7,
    "maxArticles": 30,
    "minScore": 40
  }' | jq .
```

### 2. Historical Search (Date Range)

```bash
curl -X POST http://localhost:3000/api/collect-newsapi \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["machine learning"],
    "filterDays": 365,
    "maxArticles": 50,
    "start_date": "2024-01-01",
    "end_date": "2024-12-31"
  }' | jq .
```

### 3. Campaign Collection

```bash
curl -X POST http://localhost:3000/api/collect-newsapi \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["AI deployment", "enterprise software"],
    "filterDays": 30,
    "maxArticles": 25,
    "campaign": "dsp_6mo_expansion"
  }' | jq .
```

## Comparison: Three Ways to Use NewsAPI

### Option 1: Separate Endpoint (New)
Use when you want **newsapi only**, isolated collection workflow.

```bash
curl -X POST http://localhost:3000/api/collect-newsapi \
  -H "Content-Type: application/json" \
  -d '{"keywords": ["test"], "filterDays": 7, "maxArticles": 20}' | jq .
```

**Pros:**
- Simplified parameters (no regions)
- Guaranteed single source
- Minimal response overhead

**Cons:**
- Separate endpoint to manage

---

### Option 2: Main Endpoint with `sources: ["newsapi"]`
Use when you want **NewsAPI only within existing multi-source pipeline**.

```bash
curl -X POST http://localhost:3000/api/collect \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["test"],
    "regions": [],
    "sources": ["newsapi"],
    "filterDays": 7,
    "maxArticles": 20,
    "minScore": 0
  }' | jq .
```

**Pros:**
- Uses existing unified pipeline
- Same endpoint as other sources
- Full control over regions parameter

**Cons:**
- Must pass regions (empty array OK)
- Slightly heavier response

---

### Option 3: Main Endpoint with Both Sources
Use when you want **Google News + NewsAPI together**.

```bash
curl -X POST http://localhost:3000/api/collect \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["drone regulations"],
    "regions": ["US", "Canada"],
    "sources": ["google_news", "newsapi"],
    "filterDays": 7,
    "maxArticles": 50,
    "minScore": 0
  }' | jq .
```

**Pros:**
- Complementary sources in one call
- Automatic deduplication across sources
- Single unified result

**Cons:**
- Slower (combines multiple API calls)
- Larger response

---

## React Hook Usage

### Using the NewsAPI Hook (Standalone)

```typescript
import { useCollectNewsAPI } from '@/hooks/use-collect-newsapi';

export function MyComponent() {
  const { isCollecting, stats, error, startCollect } = useCollectNewsAPI();

  const handleCollect = async () => {
    try {
      const result = await startCollect(
        ['drone regulations', 'UAV policy'],  // keywords
        7,                                      // filterDays
        30,                                     // maxArticles
        { campaign: 'my_campaign' }             // optional options
      );
      console.log(`Collected ${result.articles.length} articles`);
      // articles are ready for scoring
    } catch (err) {
      console.error('Collection failed:', err);
    }
  };

  return (
    <div>
      <button onClick={handleCollect} disabled={isCollecting}>
        {isCollecting ? 'Collecting...' : 'Start Collection'}
      </button>
      {error && <div>Error: {error}</div>}
      {stats && <div>Stored: {stats.stored}, Dedup removed: {stats.dedupRemoved}</div>}
    </div>
  );
}
```

### Using the Main Hook with NewsAPI

```typescript
import { useCollect } from '@/hooks/use-collect';

export function MyComponent() {
  const { isCollecting, stats, startCollect } = useCollect();

  const handleCollect = async () => {
    const result = await startCollect(
      ['drone regulations'],              // keywords
      [],                                 // regions (empty since NewsAPI doesn't use)
      7,                                  // filterDays
      30,                                 // maxArticles
      ['newsapi'],                        // sources (NewsAPI only)
    );
    console.log(`Collected ${result.articles.length} articles`);
  };

  return (
    <button onClick={handleCollect} disabled={isCollecting}>
      Collect
    </button>
  );
}
```

## Scoring Pipeline Integration

Once collected, articles are automatically:

1. **Stored in the database** - available for later scoring
2. **Deduplicated across runs** - same URL won't be collected twice
3. **Ready for AI scoring** - pass `articles` array to `/api/score`

### Example: Collect → Score Flow

```typescript
// Step 1: Collect from NewsAPI
const result = await startCollect(['drones'], 7, 20);

// Step 2: Pass articles directly to scoring
const scoreResponse = await fetch('/api/score', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    articles: result.articles,
    campaign: result.campaign,
  }),
});

const { results } = await scoreResponse.json();
// results[i].scored now has:
// - relevance_score
// - company, country, city
// - signal_type, use_case
// - flytbase_mentioned
// - persons, entities
// etc.
```

## Data Flow

```
┌─────────────────────────────────────┐
│  /api/collect-newsapi POST          │
│ (keywords, filterDays, etc)         │
└─────────────────┬───────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ searchNewsAPI()     │
        │ (fetch articles)    │
        └─────────┬───────────┘
                  │
                  ▼
     ┌────────────────────────────┐
     │ Step 1: Date Filter        │
     │ (cutoff based on filterDays)
     └────────────┬───────────────┘
                  │
                  ▼
     ┌────────────────────────────┐
     │ Step 2: Dedup Within Run   │
     │ (URL normalization)        │
     └────────────┬───────────────┘
                  │
                  ▼
     ┌────────────────────────────┐
     │ Step 3: Cap at maxArticles │
     └────────────┬───────────────┘
                  │
                  ▼
     ┌────────────────────────────┐
     │ Step 4: Map to Article{}   │
     │ (add IDs, timestamps)      │
     └────────────┬───────────────┘
                  │
                  ▼
     ┌────────────────────────────┐
     │ Step 5: Persist to DB      │
     │ (articles + run metadata)  │
     └────────────┬───────────────┘
                  │
                  ▼
      ┌─────────────────────────┐
      │ Return CollectResult    │
      │ (articles ready for     │
      │  scoring or queueing)   │
      └─────────────────────────┘
```

## Key Differences from Google News

| Aspect | Google News | NewsAPI |
|--------|------------|---------|
| **Regions** | Yes (multiple editions) | No (global only) |
| **Keyword matching** | Phrase search wrapped in quotes | Phrase search wrapped in quotes |
| **Date range** | ✓ Supported | ✓ Supported |
| **Dedup** | By URL after normalization | By URL after normalization |
| **Scoring format** | Same `ScoredArticle` schema | Same `ScoredArticle` schema |
| **Source field** | `"google_news"` | `"newsapi"` |

## Troubleshooting

### No articles returned
- Check if NEWSAPI_KEY is set in `.env.local`
- Verify keyword has results in last `filterDays` days
- Try broader keywords (e.g., "AI" instead of specific initiative name)

### Articles not persisting to DB
- Check Supabase connection in logs
- Verify tables exist: `articles`, `runs`
- DB failure is non-fatal; articles still returned to client

### Different results than Google News
- NewsAPI indexes different sources
- Time zones: article publish times may vary
- Keywords: phrase matching is applied, exact results may differ

## Files Modified/Created

| File | Change |
|------|--------|
| **NEW:** `src/app/api/collect-newsapi/route.ts` | Dedicated NewsAPI endpoint |
| **NEW:** `src/hooks/use-collect-newsapi.ts` | Hook for standalone NewsAPI collection |
| **UPDATED:** `src/hooks/use-collect.ts` | Added support for 'newsapi' in sources parameter |

## Next Steps

1. **Start collecting**: Use one of the three methods above (endpoint, hook, or UI)
2. **Verify scoring format**: Articles already compatible with existing `/api/score` pipeline
3. **Monitor dedup**: Same URL won't be collected twice across runs
4. **Queue articles**: Once scored, articles auto-queue for review

All articles (regardless of source) are scored and queued through the same pipeline, ensuring consistent signal detection.
