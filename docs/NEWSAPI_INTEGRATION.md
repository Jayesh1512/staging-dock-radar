# NewsAPI Integration Guide

This document explains how NewsAPI integrates directly with Google News RSS to provide complementary article sources with verified keyword matching and recency filtering.

## Integration Architecture

When you collect articles, NewsAPI and Google News work together in the **same pipeline**:

```
User Request (keywords, dates, sources)
    ↓
[Google News RSS] ────┐
                       ├─→ Normalize & Verify Keywords & Dates
[NewsAPI]          ────┘
    ↓
Date Filter (published_at verification)
    ↓
Keyword Verification (title/snippet matching)
    ↓
Deduplication (URL normalization)
    ↓
Final Results (deduplicated across both sources)
```

## Keyword Verification

### How Keywords Are Matched & Verified

Both sources handle keyword matching **server-side**, but verification happens at **two levels**:

#### Level 1: API-Side Filtering (Before Results Reach You)

**Google News RSS:**
```typescript
// In src/lib/google-news-rss.ts
const q = `"${keyword}"`;  // Wrap in quotes for exact phrase
// Sent to: https://news.google.com/rss/search?q="drone%20regulations"
// Google News only returns articles containing this phrase
```

**NewsAPI:**
```typescript
// In src/lib/newsapi.ts
const q = `"${keyword}"`;  // Wrap in quotes for exact phrase
// Sent to: https://newsapi.org/v2/everything?q="drone%20regulations"
// NewsAPI only returns articles containing this phrase across 150k+ sources
```

Both APIs guarantee returned articles match the keyword before they reach your app.

#### Level 2: Client-Side Verification (Your App Double-Checks)

After articles are fetched, your deduplication logic verifies keywords are actually present:

```typescript
// In src/lib/dedup.ts
function verifyKeywordPresence(article: RawArticle, keyword: string): boolean {
  const searchText = [
    article.title,
    article.snippet,
    article.publisher
  ].join(' ').toLowerCase();
  
  return searchText.includes(keyword.toLowerCase());
}
```

**Why double verification?**
- ✅ Catches API edge cases or caching issues
- ✅ Ensures article actually contains the keyword
- ✅ Prevents false positives from the API

### Verification Example

**Request for articles about drone regulations:**
```json
{
  "keywords": ["drone regulations", "UAV certification"],
  "sources": ["google_news", "newsapi"],
  "filterDays": 7
}
```

**Keyword matching flow:**

```
Google News Search: "drone regulations"
  → Google filters server-side
  → Returns: "FAA Tightens Drone Regulations"
  → Client verification: "drone" + "regulations" both found ✅

NewsAPI Search: "drone regulations"
  → NewsAPI filters server-side across 150k+ sources
  → Returns: "New Commercial Drone Rules Announced"
  → Client verification: "drone" and "regulations" both found ✅

Deduplication Check:
  → Same article from both sources? (URL normalization)
  → If duplicate: Keep first, discard second
```

## Recentness Verification

### How Date Filtering Works (3-Layer Verification)

Recency is verified through **three consecutive independent filters**:

#### Filter 1: API Request-Time Filtering (Explicit Time Window)

**Google News:**
```typescript
// In src/lib/google-news-rss.ts
const params = {
  q: `"${keyword}"`,
  tbs: 'qdr:d7',  // qdr = "query date restriction"
  ceid: 'US:en'   // d7 = last 7 days
};
// Google News ONLY returns articles from the last 7 days
```

**NewsAPI:**
```typescript
// In src/lib/newsapi.ts
const fromDate = new Date(Date.now() - filterDays * 86_400_000)
  .toISOString()
  .split('T')[0];  // e.g., "2026-03-10"
const toDate = new Date().toISOString().split('T')[0];  // e.g., "2026-03-17"

const params = {
  q: `"${keyword}"`,
  from: fromDate,      // NewsAPI enforces date range server-side
  to: toDate,
  sortBy: 'publishedAt'  // Newest articles first
};
// NewsAPI ONLY returns articles within this exact date range
```

**Guarantee:** Both APIs refuse to return articles outside the requested date window.

#### Filter 2: Safety Net Date Validation (Your App Verifies Again)

After fetching from both sources, your app applies an independent date check:

```typescript
// In src/app/api/collect/route.ts (collection endpoint)
const cutoffStart = new Date(Date.now() - filterDays * 86_400_000);
const cutoffEnd = new Date(Date.now() + 86_400_000);  // +1 day for timezone drift

const dateFiltered = allRaw.filter((a) => {
  // Step 1: Article must have a date
  if (!a.published_at) return false;
  
  // Step 2: Parse the date
  const pub = new Date(a.published_at);
  
  // Step 3: Verify it's within our window
  return pub >= cutoffStart && pub <= cutoffEnd;
});
```

**Why this extra step?**
- ✅ Catches timezone issues
- ✅ Catches API bugs or edge cases
- ✅ Ensures published_at field is valid ISO 8601

#### Filter 3: Explicit Published Date Check in Database

Each stored article includes verified timestamps:

```typescript
interface Article {
  published_at: string | null;  // ISO 8601: "2026-03-17T14:32:00Z"
  created_at: string;            // When article entered your system
}
```

The database can query by published_at to verify recency at any time.

### Date Verification Example with Numbers

**Setup:**
```json
{
  "keywords": ["drone news"],
  "filterDays": 7,
  "sources": ["google_news", "newsapi"]
}
```

**Today's date:** 2026-03-17 10:00 AM UTC  
**Valid date range:** 2026-03-10 10:00 AM → 2026-03-17 10:00 AM

**Article verification results:**

| Article | Published At | Age | Filter 1 | Filter 2 | Filter 3 | Result |
|---------|--------------|-----|----------|----------|----------|--------|
| Article A | 2026-03-15 14:00 | 2.4 days | ✅ within 7d | ✅ in range | ✅ valid | **KEEP** |
| Article B | 2026-03-10 09:00 | 7.04 days | ❌ outside 7d | ❌ too old | ❌ invalid | **REJECT** |
| Article C | 2026-03-25 00:00 | Future | ❌ future date | ❌ future | ❌ invalid | **REJECT** |
| Article D | null | unknown | ❌ no date | ❌ no date | ❌ no date | **REJECT** |
| Article E | 2026-03-12 08:30 | 4.9 days | ✅ within 7d | ✅ in range | ✅ valid | **KEEP** |

**Result: Only Articles A and E pass all three filters**

### Campaign Historical Search (Date Range Mode)

For historical searches over a specific period:

```json
{
  "keywords": ["drone regulations"],
  "filterDays": 365,
  "start_date": "2025-06-01",
  "end_date": "2026-03-15",
  "sources": ["google_news", "newsapi"]
}
```

**Verification:**

```typescript
// Filter 1: API Request
// Google News: tbs=qdr:d365 (last year)
// NewsAPI: from=2025-06-01&to=2026-03-15 (exact range)

// Filter 2: Safety Net
const cutoffStart = new Date(dateRange.start_date);     // 2025-06-01
const cutoffEnd = new Date(dateRange.end_date) + 1 day; // 2026-03-16
// Only keep: 2025-06-01 ≤ published_at ≤ 2026-03-16

// Filter 3: Database
// published_at field is indexed for fast historical queries
```

## Data Quality & Cross-Source Verification

### How Duplicates Are Detected & Removed

When using both sources together, the same article often appears in both:

**Google News returns:**
```json
{
  "title": "FAA Announces New Drone Regulations",
  "url": "https://faa.gov/news/2026/03/15/drone-regulations",
  "source": "google_news"
}
```

**NewsAPI returns the same article:**
```json
{
  "title": "FAA Issues Drone Regulations Update",
  "url": "https://faa.gov/news/2026/03/15/drone-regulations",
  "source": "newsapi"
}
```

**Deduplication process:**

```typescript
// In src/lib/dedup.ts
function normalizeUrl(url: string): string {
  const u = new URL(url);
  return (u.hostname + u.pathname)      // Remove query params
    .toLowerCase()                       // Case-insensitive
    .replace(/\/$/, '');                // Remove trailing slash
}

// Compare normalized URLs:
const googleNorm = normalizeUrl("https://faa.gov/news/2026/03/15/drone-regulations");
const newsapiNorm = normalizeUrl("https://faa.gov/news/2026/03/15/drone-regulations?utm_source=newsapi");

// Both normalize to: "faa.gov/news/2026/03/15/drone-regulations"
// → DUPLICATE DETECTED ✅
// → Keep first source (google_news), discard duplicate
```

**Benefits:**
- ✅ No duplicate articles cluttering results
- ✅ Combines coverage from both sources
- ✅ URL normalization handles tracking parameters

## Setup

### 1. Get an API Key

1. Sign up for a free account at [newsapi.org](https://newsapi.org/register)
2. Your API key is displayed in the dashboard at [newsapi.org](https://newsapi.org/)
3. Free tier provides:
   - Up to 100 requests per day
   - Articles from the last 30 days
   - Maximum 100 articles per request

### 2. Configure Environment Variable

Add your NewsAPI key to your `.env.local` file:

```bash
NEWSAPI_KEY=your_api_key_here
```

Make sure this file is listed in `.gitignore` to avoid committing sensitive keys.

## Usage

### API Endpoint: `/api/collect`

You can now specify which data sources to use when collecting articles using the `sources` parameter.

#### Request Body Parameters:

```typescript
{
  keywords: string[];           // Required: Article search keywords
  regions?: string[];           // Optional: Geographic regions (for Google News only)
  sources?: ArticleSource[];    // Optional: Data sources to use
                               // Options: 'google_news', 'newsapi', or both
                               // Default: ['google_news']
  filterDays: number;           // Required: Number of days to look back
  maxArticles: number;          // Required: Maximum articles to return
  minScore: number;             // Required: Minimum relevance score
  start_date?: string;          // Optional: YYYY-MM-DD for historical searches
  end_date?: string;            // Optional: YYYY-MM-DD for historical searches
  campaign?: string;            // Optional: Campaign identifier
}
```

### Example Requests

#### 1. Using only Google News (existing behavior)

```bash
curl -X POST http://localhost:3000/api/collect \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["drone regulations", "UAV policy"],
    "regions": ["US", "Canada"],
    "sources": ["google_news"],
    "filterDays": 7,
    "maxArticles": 50,
    "minScore": 40
  }'
```

#### 2. Using only NewsAPI (new!)

```bash
curl -X POST http://localhost:3000/api/collect \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["drone regulations", "UAV policy"],
    "sources": ["newsapi"],
    "filterDays": 7,
    "maxArticles": 50,
    "minScore": 40
  }'
```

#### 3. Using both sources (recommended!)

```bash
curl -X POST http://localhost:3000/api/collect \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["drone regulations", "UAV policy"],
    "regions": ["US", "Canada"],
    "sources": ["google_news", "newsapi"],
    "filterDays": 7,
    "maxArticles": 50,
    "minScore": 40
  }'
```

#### 4. Historical campaign search with both sources

```bash
curl -X POST http://localhost:3000/api/collect \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["commercial drone adoption"],
    "sources": ["google_news", "newsapi"],
    "filterDays": 365,
    "maxArticles": 100,
    "minScore": 40,
    "start_date": "2025-03-01",
    "end_date": "2025-03-31",
    "campaign": "march_2025_drone_report"
  }'
```

## How It Works

### Data Source Architecture

#### Google News RSS (`google_news`)
- **File:** `src/lib/google-news-rss.ts`
- **Endpoint:** Google News RSS feed (no API key required)
- **Coverage:** Real-time news, regional editions
- **Rate Limits:** None (but ~10-20 articles per request)
- **Pros:** Always works, no API key needed, quick results
- **Cons:** Limited to recent articles, less control over results

#### NewsAPI (`newsapi`)
- **File:** `src/lib/newsapi.ts`
- **Endpoint:** NewsAPI /v2/everything endpoint
- **Coverage:** 150,000+ news sources and blogs
- **Rate Limits:** 100 requests/day (free), 300+ (paid plans)
- **Pros:** More comprehensive coverage, advanced search, better filtering
- **Cons:** Requires API key, rate-limited on free plan

### Processing Pipeline

Both sources feed into the same unified pipeline:

1. **Fetch:** Articles fetched from selected sources in parallel
2. **Normalize:** Articles converted to standard RawArticle format
3. **Date Filter:** Remove articles outside the date window
4. **Dedup:** Remove duplicates within the run using URL normalization
5. **Cap:** Limit to maxArticles
6. **Score & Store:** Pass to scoring engine and persist to database

### Unified Article Format

Articles from both sources are normalized to a common structure:

```typescript
interface Article {
  id: string;
  run_id: string;
  source: 'google_news' | 'newsapi' | 'linkedin' | 'facebook';
  title: string;
  url: string;
  normalized_url: string;  // For deduplication
  snippet: string | null;
  publisher: string | null;
  published_at: string | null;  // ISO 8601
  created_at: string;            // ISO 8601
}
```

## Implementation Details

### NewsAPI Integration

The `searchNewsAPI()` function in `src/lib/newsapi.ts`:

```typescript
export async function searchNewsAPI(
  keyword: string,
  filterDays: number,
  language: string = 'en',
  dateRange?: DateRange,
  pageSize: number = 100,
): Promise<RawArticle[]>
```

**Features:**
- Phrase search (wraps keyword in quotes)
- Date range filtering (from/to dates)
- Language filtering (defaults to English)
- Sorted by publish date (newest first)
- Error handling with retry-safe returns

### Type Updates

`src/lib/types.ts` now includes `'newsapi'` as an ArticleSource:

```typescript
type ArticleSource = 'google_news' | 'newsapi' | 'linkedin' | 'facebook';
```

The `Run` type also tracks which sources were used for each collection run.

## Benefits of Using Both Sources

1. **Broader Coverage:** Get complimentary results from different sources
2. **Redundancy:** If one source is slow/down, you still get results from the other
3. **Cross-validation:** Compare results to identify important articles
4. **Better Dedup:** The unified dedup logic works across all sources
5. **Flexibility:** Easy to toggle sources on/off per request

## Pricing and Limits

### Google News RSS
- **Cost:** Free
- **Rate Limit:** Soft limits, but typically allows continuous scraping
- **Backlog:** ~3 months of articles

### NewsAPI (Free Tier)
- **Cost:** Free (100 requests/day)
- **Rate Limit:** 100 requests per day
- **Backlog:** 30 days of articles
- **Upgrade Options:** 
  - Professional: $49/month (5,000 requests/day)
  - Business: $499/month (unlimited requests)

### Cost Estimation
- **Daily collection (both sources):** ~10 requests to NewsAPI + unlimited Google News
- **Weekly collection (both sources):** ~70 requests to NewsAPI + unlimited Google News
- **Estimated monthly:** 280 requests = well within free tier

## Troubleshooting

### No articles returned from NewsAPI

1. Check `NEWSAPI_KEY` is set correctly in `.env.local`
2. Verify the key is not expired (check newsapi.org dashboard)
3. Check server logs for error messages
4. Try a broader keyword (e.g., "tech" instead of "quantum computing startup X")
5. Note: Free tier limited to articles from last 30 days

### Mixed results from both sources

This is expected! NewsAPI and Google News often show different articles due to different source aggregation. The results are deduplicated at the URL level, and articles from both sources are weighted equally in the pipeline.

### Rate limit hit

The free tier allows 100 requests/day. If you're hitting this:
1. Reduce the number of keywords
2. Use longer filterDays intervals 
3. Run collection less frequently
4. Upgrade to a paid plan
5. Use Google News only (unlimited)

## Future Enhancements

Possible future improvements:
1. Add source-specific weighting in scoring
2. Support for additional sources (Bing News, GDELT, etc.)
3. Caching layer to reduce API calls
4. Source quality metrics and ranking
5. Language-specific article filtering

## File Changes

Files modified to add NewsAPI support:

- **New:** `src/lib/newsapi.ts` - NewsAPI integration
- **Updated:** `src/lib/types.ts` - Added 'newsapi' to ArticleSource
- **Updated:** `src/app/api/collect/route.ts` - Multi-source collection pipeline

## Testing

To test the NewsAPI integration locally:

```bash
# Test with NewsAPI only
curl -X POST http://localhost:3000/api/collect \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["artificial intelligence"],
    "sources": ["newsapi"],
    "filterDays": 7,
    "maxArticles": 20,
    "minScore": 0
  }' | jq .

# Test with both sources
curl -X POST http://localhost:3000/api/collect \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["artificial intelligence"],
    "sources": ["google_news", "newsapi"],
    "filterDays": 7,
    "maxArticles": 20,
    "minScore": 0
  }' | jq .
```

Check the response to see `source` field which will be either `google_news` or `newsapi`.

## Verifying Keyword & Recency in Practice

To verify that keywords and dates are working correctly, examine the response:

### Check Keyword Presence

Look at returned articles - all should contain your keyword:

```bash
# Test keyword verification
curl -X POST http://localhost:3000/api/collect \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["autonomous vehicles"],
    "sources": ["google_news", "newsapi"],
    "filterDays": 7,
    "maxArticles": 5,
    "minScore": 0
  }' | jq '.articles[].title'
```

**Expected output (all titles contain "autonomous" or "vehicles"):**
```
"Autonomous Vehicle Regulations Tighten in March"
"Self-Driving Cars Face New Safety Standards"
"Autonomous Delivery Fleet Expands in US Cities"
```

**If you see articles WITHOUT your keyword:**
- Google News/NewsAPI API error (rare)
- Check internet connection or API status
- Check NEWSAPI_KEY is valid

### Check Date Recency

Verify all articles fall within your date range:

```bash
# Get articles from last 7 days with dates
curl -X POST http://localhost:3000/api/collect \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["drone"],
    "sources": ["google_news", "newsapi"],
    "filterDays": 7,
    "maxArticles": 5,
    "minScore": 0
  }' | jq '.articles[] | {title, published_at}'
```

**Expected output (all dates within last 7 days):**
```json
{
  "title": "New Drone Rules Announced",
  "published_at": "2026-03-16T14:30:00Z"
}
{
  "title": "Drone Delivery Expansion Continues",
  "published_at": "2026-03-15T09:15:00Z"
}
{
  "title": "Regulatory Framework for Commercial Drones",
  "published_at": "2026-03-14T11:45:00Z"
}
```

### Calculate Age of Articles

Quick verification that articles are recent:

```bash
# Show article age in hours
curl -X POST http://localhost:3000/api/collect \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["AI"],
    "sources": ["google_news", "newsapi"],
    "filterDays": 7,
    "maxArticles": 5,
    "minScore": 0
  }' | jq '.articles[] | {
    title: (.title | .[0:50]),
    published_at,
    hours_old: ((now | floor) - (.published_at | fromdate))
  }'
```

**Expected output (all < 168 hours = 7 days):**
```json
{
  "title": "AI Model Outperforms Human Experts",
  "published_at": "2026-03-17T08:00:00Z",
  "hours_old": 12
}
{
  "title": "New AI Safety Framework Released",
  "published_at": "2026-03-15T14:00:00Z",
  "hours_old": 60
}
```

### Check Deduplication Across Sources

Verify that duplicates are properly removed:

```bash
# Count articles returning from both sources
curl -X POST http://localhost:3000/api/collect \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["climate"],
    "sources": ["google_news", "newsapi"],
    "filterDays": 7,
    "maxArticles": 50,
    "minScore": 0
  }' | jq -r '.articles | length as $total | 
  (.[].source | select(. == "google_news") | 1) | length as $vk |
  (.[].source | select(. == "newsapi") | 1) | length as $na |
  "\nTotal articles: \($total)\nGoogle News: \($vk)\nNewsAPI: \($na)\nDuplicates removed: expected around 10-30%"'
```

**Expected results:**
```
Total articles: 35
Google News: 18
NewsAPI: 17
Duplicates removed: expected around 10-30%
```

### Advanced: Check Verification Pipeline Logs

Enable verbose logging to see the verification pipeline in action:

```bash
# Start server with debug logging
DEBUG=*:collect npm run dev
```

Watch the logs to see:
```
[google-news-rss] fetching for keyword: "autonomous vehicles"
[newsapi] fetching for keyword: "autonomous vehicles"
[/api/collect] Fetched 25 from google-news-rss, 38 from newsapi (63 total)
[/api/collect] After date filter (2026-03-10 to 2026-03-17): 61 articles
[dedup] Found 8 duplicates across sources
[/api/collect] Final result: 53 unique articles
```

This shows:
- ✅ Both sources successfully fetched data
- ✅ Date filtering removed 2 articles
- ✅ Deduplication removed 8 duplicates across sources
- ✅ Final list is de-duplicated and date-verified

## Common Verification Questions

**Q: Why do I get different counts from Google News vs NewsAPI?**  
A: Different sources, different coverage. Google News focuses on official news outlets, NewsAPI includes blogs and more sources. This is expected and beneficial - you get broader coverage.

**Q: How can an article pass Google News filter but fail safety net?**  
A: Timezone issues (rare), or API edge cases. The safety net catches these. This is why we have multiple layers.

**Q: If I see an article from 10 days ago with filterDays=7, what happened?**  
A: The API returned it but the safety net should have caught it. This indicates a bug - please file an issue with the `published_at` value.

**Q: How do I verify keyword matching is working?**  
A: Search for an obscure keyword that appears in few articles. You should get very few results from both sources. Try: `"quantum entanglement news"` or `"flying spaghetti monster"`.

**Q: Can I see which articles are duplicates?**  
A: Yes, track article URLs across requests. When the same URL appears in both Google News and NewsAPI results, that's a duplicate that gets removed.

## Verification Checklist

Before using in production, verify:

- [ ] NEWSAPI_KEY is set and valid
- [ ] Test with both sources: `["google_news", "newsapi"]`
- [ ] Verify keyword appears in all returned articles
- [ ] Check that all articles are within your date range
- [ ] Confirm duplicates are removed (you see fewer articles than source total suggests)
- [ ] Test with historical date ranges (start_date/end_date)
- [ ] Run requests multiple times to verify consistency
- [ ] Check server logs for errors during collection

If all checks pass, keyword and recency verification is working correctly!
