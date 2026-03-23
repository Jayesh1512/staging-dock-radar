# PRD: Google Dock Crawler — Regional Partner Discovery Utility

**Project:** Dock Radar (sub-utility)
**Sprint:** Hunt for Instadrone — 10hr hack
**Author:** FlytBase BD
**Date:** 2026-03-23
**Litmus test:** Can this utility surface `instadrone.fr` from a cold search?

---

## 1. Problem

FlytBase BD needs to discover drone service providers deploying DJI Dock in specific regions (starting with France). Current channels (coupon news, LinkedIn) miss operators who don't actively market on social platforms. A Google search for `france "DJI Dock"` surfaces Instadrone on page 4 — proving the signal exists but requires manual effort to extract at scale.

## 2. What This Utility Does

A standalone Node.js CLI script that:

1. Runs a set of Google search queries filtered by country/region
2. Extracts all unique domains from the search results (pages 1–N)
3. Crawls each discovered domain's homepage for relevance signals
4. Scores and ranks domains by Dock deployment likelihood
5. Outputs a scored CSV lead list

**This is NOT a full product.** It's a repeatable CLI tool that can be run weekly for any region.

## 3. Existing Context — What Already Exists

### Dock Radar Project
- Has a **Facility Radar** concept with a scoring heuristic (SIRENE + DJI + DGAC signals)
- Has a `scoreProspect()` function pattern already designed (see below)
- Existing scoring weights: SIRENE match (+30), DJI dealer (+25), DGAC waivers (+20), employees ≥10 (+15), LiDAR projects (+15), regional branches (+10)

### BD Pulse (mkt-intelligence repo)
- **Stack:** React, TypeScript, Vite, Tailwind, shadcn/ui, Supabase Edge Functions/Deno, PostgreSQL
- **Repo:** `xragrawal/mkt-intelligence`
- **Pattern:** Steps 1–3 implemented (signal capture → deep dive → opportunity pack). Step 4 (outreach) in progress.
- **Crawler pattern:** Cheerio for static HTML, Puppeteer mentioned for JS-heavy sites

### Key Decision: Where Does This Live?

**Option A (Recommended for hack sprint):** Standalone script in a new folder within dock-radar repo, e.g. `tools/google-dock-crawler/`. No UI dependency. Just CLI → CSV.

**Option B (Future):** Integrate into BD Pulse as a new signal source feeding into Step 1.

## 4. Architecture

```
┌─────────────────────────────────────────────┐
│          google-dock-crawler CLI             │
├─────────────────────────────────────────────┤
│                                             │
│  1. SEARCH MODULE                           │
│     ├─ Input: query templates + region      │
│     ├─ Method: Google Custom Search API     │
│     │   OR SerpAPI OR direct scrape         │
│     └─ Output: Array<{url, title, snippet}> │
│                                             │
│  2. DOMAIN EXTRACTOR                        │
│     ├─ Input: raw search results            │
│     ├─ Dedup by root domain                 │
│     ├─ Exclude: google.*, youtube.*,        │
│     │   linkedin.*, dji.com, wikipedia.*,   │
│     │   govt sites, news aggregators        │
│     └─ Output: uniqueDomains[]              │
│                                             │
│  3. HOMEPAGE CRAWLER                        │
│     ├─ Input: domain list                   │
│     ├─ Fetch homepage + /services, /about,  │
│     │   /solutions (if they exist)          │
│     ├─ Extract text content                 │
│     └─ Output: {domain, text, pages[]}      │
│                                             │
│  4. RELEVANCE SCORER                        │
│     ├─ Input: crawled text per domain       │
│     ├─ Keyword matching (weighted)          │
│     ├─ Context signals                      │
│     └─ Output: {domain, score, signals[]}   │
│                                             │
│  5. CSV EXPORTER                            │
│     └─ Sorted by score, top N               │
└─────────────────────────────────────────────┘
```

## 5. Module Specs

### 5.1 Search Module

**Search queries to run (France region):**

```javascript
const QUERIES_FRANCE = [
  '"DJI Dock" site:.fr',
  '"DJI Dock 2" site:.fr',
  '"DJI Dock 3" site:.fr',
  '"drone-in-a-box" site:.fr',
  '"drone autonome" "DJI" site:.fr',
  '"Matrice 30" dock France',
  '"Matrice 3D" dock France',
  '"DJI Dock" drone services France',
  '"station drone" "DJI" France',
  '"BVLOS" "DJI" site:.fr',
];
```

**Search API options (pick one):**

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| **Google Custom Search JSON API** | Official, reliable, structured JSON | 100 free queries/day, then $5/1000 | Free tier likely sufficient |
| **SerpAPI** | Easy, handles pagination, anti-bot | Paid ($50/mo for 5000 searches) | Overkill for hack |
| **Direct scrape via puppeteer** | Free, no API key | Fragile, Google blocks bots | Not recommended |

**Recommended:** Google Custom Search API (free tier = 100 queries/day = 10 queries × 10 pages each).

**Config:**
```javascript
// config.js
module.exports = {
  GOOGLE_CSE_API_KEY: process.env.GOOGLE_CSE_API_KEY,
  GOOGLE_CSE_CX: process.env.GOOGLE_CSE_CX, // Custom Search Engine ID
  RESULTS_PER_QUERY: 100,  // 10 pages × 10 results
  REGION: 'countryFR',
  LANGUAGE: 'lang_fr',
};
```

**Setup required:**
1. Create a Google Custom Search Engine at https://programmablesearchengine.google.com/
2. Set it to search the entire web (not a specific site)
3. Get API key from Google Cloud Console
4. Enable Custom Search API in the console

### 5.2 Domain Extractor

```javascript
// Pseudocode
function extractDomains(searchResults) {
  const dominated = new Set();
  
  const EXCLUDE_DOMAINS = [
    'google.com', 'google.fr', 'youtube.com', 'wikipedia.org',
    'linkedin.com', 'facebook.com', 'twitter.com', 'x.com',
    'dji.com', 'amazon.fr', 'reddit.com', 'gouv.fr',
    'flytbase.com', // exclude ourselves
  ];
  
  for (const result of searchResults) {
    const domain = new URL(result.link).hostname.replace('www.', '');
    if (!EXCLUDE_DOMAINS.some(ex => domain.endsWith(ex))) {
      dominated.add(domain);
    }
  }
  
  return [...dominated];
}
```

### 5.3 Homepage Crawler

For each domain, fetch up to 3 pages: homepage, `/services` or `/solutions`, `/about`.

```javascript
// Pseudocode
async function crawlDomain(domain) {
  const PATHS = ['/', '/services', '/solutions', '/about', '/produits', '/nos-services'];
  const results = [];
  
  for (const path of PATHS) {
    try {
      const response = await fetch(`https://${domain}${path}`, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DockRadar/1.0)' }
      });
      if (response.ok) {
        const html = await response.text();
        const text = extractTextFromHTML(html); // use cheerio
        results.push({ path, text: text.substring(0, 5000) }); // cap text length
      }
    } catch (e) {
      // skip unreachable pages
    }
  }
  
  return { domain, pages: results, fullText: results.map(r => r.text).join(' ') };
}
```

**Use Cheerio** for text extraction (not Puppeteer — we don't need JS rendering for this use case, and it's much faster).

### 5.4 Relevance Scorer

Weighted keyword matching against the crawled text.

```javascript
const SIGNAL_KEYWORDS = {
  // Tier 1: Direct Dock signals (highest weight)
  tier1: {
    weight: 30,
    keywords: [
      'dji dock', 'dock 2', 'dock 3', 'drone-in-a-box', 'drone in a box',
      'station drone autonome', 'hangar drone', 'drone box',
    ],
  },
  // Tier 2: DJI Enterprise + BVLOS signals
  tier2: {
    weight: 20,
    keywords: [
      'matrice 30', 'matrice 3d', 'matrice 4d', 'flighthub',
      'bvlos', 'hors vue', 'beyond visual line of sight',
      'vol automatique', 'automated flight', 'remote operations',
    ],
  },
  // Tier 3: Drone service provider signals
  tier3: {
    weight: 10,
    keywords: [
      'inspection par drone', 'drone inspection', 'surveillance drone',
      'opérateur drone', 'prestataire drone', 'télépilote',
      'thermographie', 'photogrammétrie', 'lidar',
      'sora', 'dgac', 'catégorie spécifique',
    ],
  },
  // Tier 4: Industry vertical signals
  tier4: {
    weight: 5,
    keywords: [
      'infrastructure', 'énergie', 'sécurité', 'industrie',
      'oil and gas', 'mining', 'construction', 'railway',
      'solar', 'wind farm', 'pipeline',
    ],
  },
};

function scoreDomain(crawledData) {
  const text = crawledData.fullText.toLowerCase();
  let totalScore = 0;
  const matchedSignals = [];

  for (const [tier, config] of Object.entries(SIGNAL_KEYWORDS)) {
    for (const keyword of config.keywords) {
      const count = (text.match(new RegExp(keyword, 'gi')) || []).length;
      if (count > 0) {
        const points = config.weight * Math.min(count, 3); // cap at 3 mentions
        totalScore += points;
        matchedSignals.push({ tier, keyword, count, points });
      }
    }
  }

  return {
    domain: crawledData.domain,
    score: totalScore,
    signals: matchedSignals,
    topSignal: matchedSignals[0]?.keyword || 'none',
    tier1Hit: matchedSignals.some(s => s.tier === 'tier1'),
  };
}
```

### 5.5 CSV Exporter

```javascript
// Output columns
const CSV_HEADERS = [
  'rank',
  'domain',
  'score',
  'tier1_hit',        // boolean: has direct Dock mention
  'top_signal',       // strongest keyword matched
  'signal_count',     // total signals matched
  'url',              // full homepage URL
  'snippet',          // Google search snippet (first match)
  'signals_detail',   // JSON string of all matched signals
];
```

**Output file:** `output/dock-leads-france-YYYY-MM-DD.csv`

## 6. File Structure

```
tools/google-dock-crawler/
├── config.js              # API keys, region, query templates
├── index.js               # Main CLI entry point
├── lib/
│   ├── search.js          # Google Custom Search API wrapper
│   ├── extract-domains.js # Domain dedup + filtering
│   ├── crawl.js           # Homepage crawler (Cheerio)
│   ├── score.js           # Keyword-based relevance scorer
│   └── export.js          # CSV writer
├── output/                # Generated CSV files
├── package.json
└── README.md
```

## 7. Dependencies

```json
{
  "dependencies": {
    "cheerio": "^1.0.0",
    "csv-writer": "^1.6.0",
    "node-fetch": "^3.3.0"
  }
}
```

No heavy deps. No Puppeteer. No database. Just fetch + parse + score + write.

## 8. How to Run

```bash
cd tools/google-dock-crawler
npm install
export GOOGLE_CSE_API_KEY=your_key
export GOOGLE_CSE_CX=your_cx_id

# Run for France
node index.js --region=FR

# Run with custom query
node index.js --region=FR --query='"DJI Dock 3" site:.fr'

# Limit pages per query
node index.js --region=FR --pages=5
```

## 9. Expected Output

For France, with 10 queries × 10 pages = ~1000 raw results:

- **~100-200 unique domains** after dedup + exclusion
- **~20-40 scored leads** with score > 0 (have at least one keyword match)
- **~5-15 high-confidence leads** with tier1 hit (direct Dock mention)
- **Instadrone should appear** with tier1 hit based on the LinkedIn post confirming they deploy DJI Dock 3

## 10. Litmus Test Validation

After running the tool:

| Check | Expected Result |
|-------|-----------------|
| `instadrone.fr` in output? | Yes |
| Score > 50? | Yes (tier1 "DJI Dock" + tier2 "inspection" + tier3 "opérateur drone") |
| Ranked in top 20? | Likely yes |
| `flyingeye.fr` in output? | Yes (known DJI partner, BVLOS authorized) |
| `azurdrones.com` in output? | Possible (drone-in-a-box, may not be .fr domain) |

## 11. Future Extensions (Not in Hack Sprint)

- **Region templates:** Replace `QUERIES_FRANCE` with `QUERIES_GERMANY`, `QUERIES_UK`, etc.
- **LinkedIn subdomain crawl:** Add `site:fr.linkedin.com "DJI Dock"` queries to capture social signals
- **BD Pulse integration:** Feed scored leads into opportunity_packs table as a new signal_source type
- **Scheduled runs:** Cron job weekly, diff against previous output to surface new entrants
- **LLM scoring layer:** Replace keyword matching with an LLM call to classify each crawled page (higher accuracy, higher cost)

## 12. Build Sequence for IDE

Implement in this order:

1. **`config.js`** — hardcode France queries + API config
2. **`lib/search.js`** — Google CSE API wrapper, pagination, rate limiting
3. **`lib/extract-domains.js`** — URL parsing, dedup, exclusion list
4. **`lib/crawl.js`** — Cheerio-based homepage text extraction
5. **`lib/score.js`** — keyword matcher with tiered weights
6. **`lib/export.js`** — CSV writer
7. **`index.js`** — wire everything together with CLI args
8. **Test:** Run once, verify Instadrone appears in output

Each file is independent, testable in isolation, and under 100 lines.
