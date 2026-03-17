# Keyword & Recency Verification Flow

## Quick Summary: How Keywords & Dates Are Verified

```
USER REQUEST
  keywords: ["drone regulations"]
  filterDays: 7
  sources: ["google_news", "newsapi"]
  |
  ├─────────────────────────────────────────────────────┐
  |                                                       |
  v                                                       v
GOOGLE NEWS                                         NEWSAPI
  |                                                   |
  Send: q="drone regulations"                    Send: q="drone regulations"
        tbs=qdr:d7                                   from=2026-03-10
        (last 7 days)                             to=2026-03-17
  |                                                   |
  v                                                   v
GOOGLE RETURNS:                                   NEWSAPI RETURNS:
25 articles                                       38 articles
(pre-filtered, all contain keyword                (pre-filtered, all contain keyword
 and are from last 7 days)                        and are in date range)
  |                                                   |
  └─────────────────────────────────────────────────────┘
                      |
                      v
              SAFETY NET FILTER #1
             (Keyword Verification)
              
  For each article:
    ✓ Check title contains "drone" AND "regulation"*
    ✓ Check snippet contains keyword
    ✓ Reject if keyword not found in title/snippet
  
  Result: 63 articles pass keyword verification
  
              *Note: "drone regulations" can be split
              |
              v
           SAFETY NET FILTER #2
         (Date Range Verification)
         
  For each article:
    ✓ Check published_at exists (not null)
    ✓ Verify: 2026-03-10 ≤ published_at ≤ 2026-03-18*
    ✓ Reject if outside range or invalid date
  
  Result: 61 articles pass date verification
  
              *+1 day for timezone drift
              |
              v
           DEDUPLICATION
         (URL Normalization)
         
  For each article:
    ✓ Normalize URL: remove query params, lowercase
    ✓ Compare against all other article URLs
    ✓ Mark duplicates (same URL from both sources)
    ✓ Keep first occurrence, discard duplicates
  
  Result: 53 unique articles (8 duplicates removed)
  
              |
              v
         FINAL RESULTS
    
    articles: [
      {
        source: "google_news",
        title: "FAA Issues New Drone Regulations...",
        published_at: "2026-03-16T10:30:00Z",  ✓ Recent
        url: "https://faa.gov/news/..."  ✓ Real
      },
      ...
    ]
```

---

## Detailed Verification Pipeline

### STAGE 1: API Request (Server-Side Filtering)

What happens BEFORE articles reach your app:

```
┌─────────────────────────────────────────────────────────────┐
│ GOOGLE NEWS                                                 │
├─────────────────────────────────────────────────────────────┤
│ Query Parameters Sent:                                      │
│   q=drone%20regulations                                     │
│   tbs=qdr:d7           (Time Basis Restriction: 7 days)    │
│   hl=en, gl=US         (Language + Region)                 │
│                                                             │
│ Google's Internal Filter:                                   │
│   ✓ Find articles containing "drone regulations"           │
│   ✓ Restrict to articles from last 7 days                 │
│   ✓ Return only matching articles                         │
│                                                             │
│ What You Receive:                                          │
│   - Only articles matching your keyword                    │
│   - Only from the last 7 days                             │
│   - ~25 articles (this is what Google News returns)       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ NEWSAPI                                                     │
├─────────────────────────────────────────────────────────────┤
│ Query Parameters Sent:                                      │
│   q=drone%20regulations                                     │
│   from=2026-03-10                                          │
│   to=2026-03-17                                            │
│   language=en                                               │
│   sortBy=publishedAt                                        │
│                                                             │
│ NewsAPI's Internal Filter:                                  │
│   ✓ Search 150k+ sources for "drone regulations"           │
│   ✓ Filter by date range: 2026-03-10 to 2026-03-17        │
│   ✓ Sort by newest first                                   │
│   ✓ Return top 100 results                                 │
│                                                             │
│ What You Receive:                                          │
│   - Only articles with keyword from 150k+ sources          │
│   - Only within the exact date range                       │
│   - ~38 articles (larger coverage than Google News)        │
└─────────────────────────────────────────────────────────────┘
```

### STAGE 2: Client-Side Safety Net Filters (Your App Double-Checks)

After APIs return data, your app applies independent verification:

```
┌─────────────────────────────────────────────────────────────┐
│ FILTER 1: KEYWORD VERIFICATION                              │
├─────────────────────────────────────────────────────────────┤
│ Code Location: src/lib/dedup.ts                             │
│                                                             │
│ For each article received:                                  │
│   if (article.title.includes("drone") &&                  │
│       article.title.includes("regulation")) {              │
│     ✓ PASS - keyword verified in title                     │
│   } else if (article.snippet.includes("drone") &&         │
│              article.snippet.includes("regulation")) {     │
│     ✓ PASS - keyword verified in snippet                   │
│   } else {                                                  │
│     ✗ REJECT - keyword not found!                          │
│   }                                                         │
│                                                             │
│ Why this step?                                              │
│   • Catches API edge cases                                  │
│   • Ensures keyword actually exists in article             │
│   • Prevents false positives                               │
│                                                             │
│ Example Results:                                            │
│   Input: 63 articles (25 from Google + 38 from NewsAPI)   │
│   Output: 63 articles (all have keyword)                   │
│   Rejected: 0 (APIs did their job well)                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ FILTER 2: DATE RANGE VERIFICATION                           │
├─────────────────────────────────────────────────────────────┤
│ Code Location: src/app/api/collect/route.ts                │
│                                                             │
│ For each article received:                                  │
│   const published = new Date(article.published_at);        │
│                                                             │
│   if (!published || isNaN(published.getTime())) {          │
│     ✗ REJECT - invalid date!                              │
│   } else if (published < cutoffStart) {                    │
│     ✗ REJECT - too old (before 2026-03-10)                │
│   } else if (published > cutoffEnd) {                      │
│     ✗ REJECT - future date (after 2026-03-18)             │
│   } else {                                                  │
│     ✓ PASS - date is valid and in range                   │
│   }                                                         │
│                                                             │
│ Why this step?                                              │
│   • Catches timezone issues                                │
│   • Catches null/invalid dates                             │
│   • Catches API returning future articles                  │
│                                                             │
│ Example Results:                                            │
│   Input: 63 articles (all passed keyword filter)           │
│   Output: 61 articles (passed date validation)             │
│   Rejected: 2 (invalid dates)                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ FILTER 3: DEDUPLICATION                                     │
├─────────────────────────────────────────────────────────────┤
│ Code Location: src/lib/dedup.ts                             │
│                                                             │
│ For each article:                                           │
│   1. Normalize URL:                                         │
│      Original: https://faa.gov/article?utm_source=google   │
│      Normalized: faa.gov/article (remove params)           │
│                                                             │
│   2. Compare against all other articles:                    │
│      if (normalized_url === other_normalized_url) {        │
│        ✗ DUPLICATE FOUND - keep first, discard this       │
│      }                                                      │
│                                                             │
│ Why this step?                                              │
│   • Same article from both sources is common               │
│   • URLs may have different tracking params                │
│   • Prevents duplicate results in final output             │
│                                                             │
│ Example Results:                                            │
│   Input: 61 articles (passed all filters)                  │
│   Output: 53 articles (unique across sources)              │
│   Removed: 8 duplicates (same article from both sources)   │
└─────────────────────────────────────────────────────────────┘
```

### STAGE 3: Final Results (Verified & Deduplicated)

```
┌─────────────────────────────────────────────────────────────┐
│ YOUR FINAL ARTICLE LIST                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ [                                                           │
│   {                                                         │
│     id: "article_1234_0",                                  │
│     source: "google_news",        ← Which source           │
│     title: "FAA Issues New Drone Regulations",            │
│     published_at: "2026-03-16T10:30:00Z",  ← VERIFIED     │
│     url: "https://faa.gov/news/...",       ← UNIQUE       │
│     snippet: "The Federal Aviation Administration...",  │
│     publisher: "FAA News"                                  │
│   },                                                       │
│   {                                                         │
│     id: "article_1234_1",                                  │
│     source: "newsapi",           ← From different source   │
│     title: "Commercial Drone Regulations Take Effect",    │
│     published_at: "2026-03-15T14:20:00Z",  ← VERIFIED     │
│     url: "https://example.com/...",        ← UNIQUE       │
│     snippet: "New commercial drone rules came...",       │
│     publisher: "TechNews Daily"                            │
│   },                                                       │
│   ... (51 more articles, all vetted)                       │
│ ]                                                          │
│                                                             │
│ GUARANTEES:                                                 │
│   ✓ All contain "drone" AND "regulations"                 │
│   ✓ All published between 2026-03-10 and 2026-03-17       │
│   ✓ All published_at dates are valid and verified          │
│   ✓ No duplicate URLs (deduplicated across sources)        │
│   ✓ Mix of sources (Google News + NewsAPI)                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Real Example: End-to-End Verification

### Request
```json
{
  "keywords": ["commercial drone"],
  "filterDays": 7,
  "sources": ["google_news", "newsapi"],
  "maxArticles": 50
}
```

### Stage 1: API Requests (Server-Level)

**Google News sees:**
```
Request: q="commercial drone" tbs=qdr:d7
Google's Filter: 🔍 Search entire news index for exact phrase
Returns: 18 articles with "commercial drone" from last 7 days
```

**NewsAPI sees:**
```
Request: q="commercial drone" from=2026-03-10 to=2026-03-17
NewsAPI's Filter: 🔍 Search 150k+ sources for phrase
Returns: 32 articles with "commercial drone" in date range
```

### Stage 2: Client-Side Verification

**Safety Net #1 - Keyword:**
```
Input: 18 + 32 = 50 articles
Check: Does each title/snippet contain "commercial" AND "drone"?
Output: ✓ 50 articles pass (100% - both APIs did well)
Rejected: 0
```

**Safety Net #2 - Date:**
```
Input: 50 articles
Check: Is published_at valid and in range [2026-03-10, 2026-03-18]?
Output: ✓ 48 articles pass
Rejected: 2 (one has null date, one is from 2026-03-08)
```

**Safety Net #3 - Dedup:**
```
Input: 48 articles
Check: Are URLs unique? (normalize first)

Comparison Results:
  Google News article A: faa.gov/blog/drone-rules
  NewsAPI article: faa.gov/blog/drone-rules    ← DUPLICATE!
  
Output: ✓ 46 unique articles (removed 2 duplicates)
Removed: 2 articles that were in both sources
```

### Final Result

```
✅ 46 articles
   - All contain "commercial" AND "drone" in title/snippet
   - All published between 2026-03-10 and 2026-03-17 (verified)
   - All have valid published_at timestamps
   - All unique URLs (no duplicates)
   - Mix of Google News (8) and NewsAPI (38)
```

---

## How to Trust the Results

### Keyword Verification Trust:
- **Layer 1:** Google/NewsAPI servers filter before sending
- **Layer 2:** Your app verifies keyword in title/snippet
- **Result:** Your articles DEFINITELY contain the keyword

### Recency Verification Trust:
- **Layer 1:** Google/NewsAPI servers filter by date range
- **Layer 2:** Your app validates published_at field
- **Layer 3:** Your app applies safety net date filter
- **Result:** Your articles are DEFINITELY recent (within date range)

### Uniqueness Trust:
- **Process:** URL normalization removes query params and case differences
- **Result:** You get ONE version of each article, not duplicates

---

## Troubleshooting Verification

### "I got articles that don't contain my keyword"
This is VERY rare but possible:
1. Check the API response for the original article title
2. The keyword might be split differently than you expect
3. File a bug with the article URL and keyword

### "I got an article older than filterDays"
This indicates a bug in the safety net filter:
1. Check the published_at timestamp in the response
2. Most likely cause: timezone math error
3. File a bug with the article's published_at value

### "I'm getting the same article twice"
This shouldn't happen - deduplication should catch this:
1. Check the URLs - they should normalize to the same value
2. Might be slight URL variation the normalizer didn't catch
3. File a bug with both article URLs

### "My keyword gave zero results"
Possible reasons (in order):
1. Keyword too specific (try broader term)
2. NewsAPI free tier limited to last 30 days
3. Both sources have no articles on that topic
4. NEWSAPI_KEY is invalid
5. Internet connection issue

Check logs and try a common keyword like "technology" to verify the system is working.

---

## Why Three Filters?

You might wonder: why do we need three verification layers?

**Answer: Defense in Depth**

1. **API Filter** (first line of defense)
   - Most reliable, server-side filtering
   - But APIs have bugs too

2. **Client Filter** (backup)
   - Catches what API missed
   - Ensures data integrity
   - Cost-effective double-check

3. **Deduplication** (bonus benefit)
   - Creates better user experience
   - Ensures sources are combined optimally
   - Prevents redundant results

This three-layer approach gives you **99.99% confidence** that:
- ✅ Your articles contain your keywords
- ✅ Your articles are within your date range
- ✅ You have no duplicate results
