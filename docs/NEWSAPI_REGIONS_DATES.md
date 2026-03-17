# NewsAPI Regional & Date Range Support

## TL;DR

❌ **NewsAPI does NOT support regional filtering** at the free tier or higher  
✅ **NewsAPI DOES support date range filtering**  
✅ **Supports historical searches across entire date range**

## API Capabilities

### Date Range Support ✅

NewsAPI's `/v2/everything` endpoint supports `from` and `to` parameters for date-based filtering:

```bash
# Example: Search for articles from Jan 1 - Jan 31, 2024
curl "https://newsapi.org/v2/everything?q=drones&from=2024-01-01&to=2024-01-31&sortBy=publishedAt"
```

**Supported formats:**
- ISO 8601 format: `YYYY-MM-DDTHH:MM:SS` or `YYYY-MM-DD`
- Timezone-aware dates are supported
- Maximum date range: Up to 1 month for free tier (higher tiers: up to 30+ days)

**Implementation in Dock Radar:**
- Relative searches: `filterDays` parameter calculates date window automatically
- Historical searches: `start_date` and `end_date` parameters support campaign lookbacks

```typescript
// Relative search (last 7 days)
{
  keywords: ["drones"],
  filterDays: 7
}

// Historical search (specific date range)
{
  keywords: ["drones"],
  start_date: "2024-01-01",
  end_date: "2024-12-31"
}
```

### Regional Filtering ❌

**NewsAPI does NOT support regional/country filtering** at any tier. The API:
- Returns **global news only**
- No `country`, `region`, or `gl` (geographic locale) parameters
- No language filtering option (though descriptions come in article's native language)
- Indexes articles from international publishers globally

**Why this matters for Dock Radar:**
- Google News: Can target 40+ regional editions (e.g., US, Canada, India, etc.)
- NewsAPI: Always returns global results
- Regions selected in UI don't apply if only NewsAPI is chosen

## UI/UX Behavior

When **only NewsAPI is selected**:
- ✅ Region selector is **hidden**
- ℹ️ Info message appears: "NewsAPI provides global news coverage and doesn't support regional filtering"
- The search is fully global (ignores any previously selected regions)

When **Google News is selected** (even with NewsAPI):
- ✅ Region selector is **shown and active**
- Regions apply to Google News portion
- NewsAPI portion still returns global results (no filtering by region)

## Data Comparison: Google News vs NewsAPI

| Criteria | Google News | NewsAPI |
|----------|-------------|---------|
| **Regional editions** | Yes (40+) | No (global only) |
| **Date range support** | ✓ Limited (~1 week default) | ✓ Yes (up to 1 month free) |
| **Historical searches** | ✓ Yes | ✓ Yes |
| **Language filtering** | Via edition | Via language param |
| **Publisher diversity** | Limited to Google News sources | 40,000+ sources |
| **Real-time updates** | Very fast | ~15 min delay |
| **Free tier source count** | Unlimited | Articles up to 1 month old |

## Practical Examples

### Example 1: Global News + Date Range

```bash
curl -X POST http://localhost:3000/api/collect-newsapi \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["drone regulations"],
    "filterDays": 30,
    "maxArticles": 50,
    "minScore": 40
  }'
```

**Result:** Last 30 days of articles mentioning "drone regulations" from 40,000+ global sources

### Example 2: Historical Campaign Search (2024 Q1)

```bash
curl -X POST http://localhost:3000/api/collect-newsapi \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["AI deployment", "machine learning enterprise"],
    "start_date": "2024-01-01",
    "end_date": "2024-03-31",
    "maxArticles": 100,
    "campaign": "q1_2024_ai_signals"
  }'
```

**Result:** Articles from Q1 2024 about AI in enterprise from global sources

### Example 3: Combined Sources (Google News by Region + NewsAPI Global)

```typescript
// On the UI: Select both Google News AND NewsAPI
sources: ['google_news', 'newsapi']
regions: ['US', 'Canada', 'UK']
keywords: ['autonomous vehicles']
filterDays: 14
```

**Result:**
- Google News: Articles from US, Canada, UK regional editions (past 14 days)
- NewsAPI: Global articles from 40,000+ sources (past 14 days)
- All deduplicated before scoring

## Cost & Rate Limits

**Free Tier (NewsAPI):**
- 100 requests/day
- 1 month historical data
- 100 results per request

**Dock Radar Usage:**
- 1 request per keyword (e.g., 5 keywords = 5 requests)
- 100 results capped, then further filtered by Dock Radar pipeline
- Budget: ~20 keywords per day on free tier

## Why We Keep Both Sources

| Scenario | Google News | NewsAPI | Both |
|----------|------------|---------|------|
| **Need regional news** | Use Google News only | N/A | Use both (GN for regions, NA global) |
| **Want global coverage** | Limited to GN sources | ✓ Use NewsAPI | ✓ Use both for maximum coverage |
| **Historical search** | ~Limited | ✓ Use NewsAPI | ✓ Use both |
| **Real-time alerts** | ✓ Use Google News | Has lag | ✓ Use both |
| **Source diversity** | Moderate | ✓ Excellent | ✓ Best |

## Architecture Decision

In Dock Radar, when you select sources:

**Option A: Only Google News**
```
Regional filtering: ✓ Applies
Date range: ✓ Last 7-30 days
Sources: ~40 news publishers per region
```

**Option B: Only NewsAPI** ← **NEW**
```
Regional filtering: ✗ Disabled (global only)
Date range: ✓ Up to 1 month
Sources: 40,000+
Route: POST /api/collect-newsapi
```

**Option C: Both Google News + NewsAPI** ← **RECOMMENDED**
```
Regional filtering: ✓ Applies to Google News only
NewsAPI: ✓ Always global
Date range: ✓ Both support
Dedup: ✓ Automatic across both
Route: POST /api/collect with sources: ['google_news', 'newsapi']
```

## Files Impacted

| File | Change |
|------|--------|
| `src/hooks/use-collect.ts` | Routes to `/api/collect-newsapi` when only newsapi selected |
| `src/components/collect/CollectPanel.tsx` | Hides RegionSelector when only NewsAPI selected; shows info message |
| `src/components/collect/SourcesPanel.tsx` | NewsAPI checkbox with "global news coverage" label |

## Recommendation

For best signal detection:
1. **Primary strategy:** Use **Google News + NewsAPI together**
   - Maximizes source diversity
   - Regional targeting where needed
   - Automatic deduplication
   
2. **Alternative:** Use **NewsAPI only** for:
   - Global monitoring (no regional interest)
   - Historical deep-dives (30 days back)
   - High source diversity

3. **Avoid:** If you need regional news only without global coverage, use Google News alone (NewsAPI is redundant in this case)

## Next Steps

- ✅ Try NewsAPI with different date ranges
- ✅ Monitor results for source quality differences
- 📊 Compare signal detection between sources
- 🎯 Consider regional + global combo for maximum coverage
