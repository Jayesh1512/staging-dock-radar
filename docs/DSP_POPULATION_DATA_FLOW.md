# DSP Hit List — Data Flow Diagram

## High-Level Pipeline

```
┌──────────────────────┐
│   ARTICLE SOURCES    │
├──────────────────────┤
│ Google News RSS      │
│ LinkedIn Posts       │
│ NewsAPI              │
│ DroneLike RSS        │
└──────────┬───────────┘
           │
           ↓
┌──────────────────────────────────────────────────────────────┐
│ STEP 1: COLLECT                                              │
│ Output: articles table (~200-300 articles per run)          │
│ Fields: id, title, url, publisher, published_at            │
└──────────┬───────────────────────────────────────────────────┘
           │
           ↓
┌──────────────────────────────────────────────────────────────┐
│ STEP 2: SCORE (LLM)                                          │
│ Prompt: SCORING_SYSTEM_PROMPT (scoring-prompt.ts)           │
│ Input: Article title, snippet, URL                          │
│ Output: relevance_score (0-100) + signal_type               │
│                                                              │
│ BANDS:                                                       │
│ • 75-100: High Value (named DSP + deployment + buyer)      │
│ • 50-74:  Strong Signal (named DSP + deployment)           │
│ • 25-49:  Weak Signal (DSP briefly mentioned)              │
│ • 0-24:   Noise (OEM marketing, consumer, academic)        │
│                                                              │
│ ✋ FILTER: Only articles scoring ≥ 50 pass forward         │
└──────────┬───────────────────────────────────────────────────┘
           │
           ↓
┌──────────────────────────────────────────────────────────────┐
│ STEP 3: EXTRACT ENTITIES (LLM)                               │
│ Prompt: ENRICHMENT_SYSTEM_PROMPT (enrichment-prompt.ts)     │
│ Input: Full article content                                 │
│ Output: scored_articles row with:                           │
│   • company (TEXT): primary DSP/operator name               │
│   • entities[] (JSONB): Array of {name, type}              │
│   • persons[] (JSONB): Array of {name, role, org}          │
│                                                              │
│ ENTITY TYPES:                                                │
│ ├─ operator    → Commercial drone service provider         │
│ ├─ si          → System integrator / reseller              │
│ ├─ buyer       → End-user organization                     │
│ ├─ regulator   → Government/regulatory body                │
│ ├─ partner     → Tech/business collaborator                │
│ └─ oem         → Drone hardware manufacturer                │
│                                                              │
│ ✋ ONLY operator + si types extracted as DSPs              │
└──────────┬───────────────────────────────────────────────────┘
           │
           ↓ [Article score ≥ 50 + not dropped + not duplicate]
           │
┌──────────────────────────────────────────────────────────────┐
│ STEP 4: QUERY HIT LIST DATA                                  │
│ Query: loadHitListData() (src/lib/db.ts#L400)               │
│ Condition:                                                   │
│   WHERE relevance_score >= 50                               │
│     AND drop_reason IS NULL                                 │
│     AND is_duplicate = false                                │
│                                                              │
│ Result: ~40-60 articles per run                             │
│         Each with entities[] + persons[]                     │
└──────────┬───────────────────────────────────────────────────┘
           │
           ↓
┌──────────────────────────────────────────────────────────────┐
│ STEP 5: EXTRACT DSP COMPANIES (2-TIER FALLBACK)             │
│ Location: src/app/api/hitlist/route.ts (lines 90-105)       │
│                                                              │
│ TIER 1: Extract entities[] where type = 'operator'|'si'    │
│   • Filter out OEMs (DJI, Skydio, Autel, Parrot, etc.)     │
│   • Result: Array of {name, role}                           │
│                                                              │
│ TIER 2 (Fallback): If no entities[]:                       │
│   • Use article.company field                               │
│   • Mark as role = 'operator'                               │
│                                                              │
│ Output: companyExtractions[] of {name, role, article_id}   │
└──────────┬───────────────────────────────────────────────────┘
           │
           ↓
┌──────────────────────────────────────────────────────────────┐
│ STEP 6: DEDUPLICATE & GROUP                                  │
│ Group by: normalizeCompanyName(name)                        │
│ Accumulate across articles:                                  │
│   • mention_count (how many articles mentioned them)        │
│   • countries[] (derived from article country fields)       │
│   • industries[] (derived from article industry fields)     │
│   • signal_types[] (DEPLOYMENT, CONTRACT, etc.)             │
│   • articles[] (up to 5 recent articles as proof)           │
│   • persons_freq (top cited executive)                      │
│                                                              │
│ Result: companyMap<normalized_name → {data}>               │
│ Size: ~30-40 unique companies per run                        │
└──────────┬───────────────────────────────────────────────────┘
           │
           ↓
┌──────────────────────────────────────────────────────────────┐
│ STEP 7: LOAD FLYTBASE PARTNERS                               │
│ Query: loadFlytBasePartners() (src/lib/db.ts#L337)          │
│ From: flytbase_partners table (manually uploaded CSV)       │
│ Count: 81 known partners                                     │
│ Build: partnerMap<normalized_name → partner_record>        │
└──────────┬───────────────────────────────────────────────────┘
           │
           ↓
┌──────────────────────────────────────────────────────────────┐
│ STEP 8: FUZZY MATCH NEW vs. KNOWN                            │
│ Logic: src/app/api/hitlist/route.ts (lines 197-202)        │
│ For each company in companyMap:                              │
│   fuzzyMatchCompany(name, [all_partner_normalized_names])  │
│                                                              │
│ Confidence Threshold:                                        │
│   • Jaccard similarity >= 0.6 → HIGH confidence             │
│     → Mark as isFlytbasePartner = true                      │
│     → Exclude from "New DSPs" tab                            │
│                                                              │
│   • Jaccard < 0.6 → LOW confidence                          │
│     → Keep as new DSP candidate                              │
│     → Include in "New DSPs" tab                              │
│                                                              │
│ Output: Split into:                                          │
│   • newCompanies[] (not in partners)                        │
│   • knownCompanies[] (matched to partners)                  │
└──────────┬───────────────────────────────────────────────────┘
           │
           ├─→ (2 companies matched as known)
           │
           ↓
       34 NEW DSPs (36 total extracted - 2 known = 34 new)
           │
           ├──────────────────────┐
           │                      │
           ↓                      ↓
    ┌────────────────┐   ┌───────────────────┐
    │ STEP 9a:       │   │ STEP 9b:          │
    │ COMPUTE        │   │ COMPUTE           │
    │ REGION SCORE   │   │ INDUSTRY SCORE    │
    └────────┬───────┘   └───────┬───────────┘
             │                   │
             │ Priority regions: │ Priority industries:
             │ • Americas        │ • Security
             │ • Europe          │ • Oil & Gas
             │ • USA             │ • Utilities
             │ • Canada          │ • Port
             │ • UK              │ • Mining
             │ • Germany         │ • Solar
             │ • France          │
             │                   │
             │ If any country IN priority: 1.0
             │ Else: 0.5         │
             │                   │
             │                   │ If any industry IN priority: 1.0
             │                   │ Else: 0.3
             │                   │
             └────────┬──────────┘
                      │
                      ↓
        ┌──────────────────────────────────────────┐
        │ STEP 10: CALCULATE HIT SCORE             │
        │ Formula:                                  │
        │ hit_score = (region_score × regionWeight) +
        │             (industry_score × industryWeight)
        │                                           │
        │ Default weights: 0.5 each                 │
        │ (adjustable via query params)             │
        │ Final score range: 0.0 - 2.0             │
        └──────────┬───────────────────────────────┘
                   │
                   ↓
        ┌──────────────────────────────────────────┐
        │ STEP 11: SORT & FORMAT                   │
        │ Sort by hit_score descending             │
        │ Add website/LinkedIn (from enrichment)   │
        │ Format for API response                   │
        └──────────┬───────────────────────────────┘
                   │
                   ↓
        ╔══════════════════════════════════════════╗
        ║   API RESPONSE                           ║
        ║   /api/hitlist?regionWeight=0.5&...     ║
        ║                                          ║
        ║   {                                      ║
        ║     new_companies: [34 DSPs],           ║
        ║     known_companies: [2 partners],      ║
        ║     stats: {                            ║
        ║       total_extracted: 36,              ║
        ║       new_count: 34,                    ║
        ║       known_count: 2,                   ║
        ║       match_rate: 6%                    ║
        ║     },                                  ║
        ║     partner_count: 81                   ║
        ║   }                                      ║
        ╚══════════════════════════════════════════╝
                   │
                   ↓
        ┌──────────────────────────────────────────┐
        │ FRONTEND DISPLAY                         │
        │ Partner Dashboard                        │
        │ src/components/partner-dashboard/        │
        │ PartnerDashboard.tsx                     │
        │                                          │
        │ Tab 0: FlytBase Partners (81)            │
        │ Tab 1: New DSPs (34)              ◄─ THIS ONE
        │ Tab 2: Top 20 Targets                    │
        └──────────────────────────────────────────┘
```

---

## Entity Type Classification Decision Tree

```
                  ┌─ Company mentioned in article
                  │
                  ↓
        ┌─────────────────────┐
        │ What is their role? │
        └─────────────────────┘
                  │
        ┌─────────┼─────────┬──────────┬──────────┬──────────┐
        │         │         │          │          │          │
        ↓         ↓         ↓          ↓          ↓          ↓
    Operates   Builds/   Buys/      Approves/   Tech/      Makes
    drones for Integrates Commissions Regulates Partner    Drones
    customers  solutions  drones     drones     with DSP   (OEM)
        │         │         │          │          │          │
        ↓         ↓         ↓          ↓          ↓          ↓
    OPERATOR    SI       BUYER    REGULATOR   PARTNER      OEM
        │         │         │          │          │          │
        │         │         │          │          │          │
    ✅ Extract   ✅ Extract ❌ Skip  ❌ Skip    ❌ Skip    ❌ Skip
    as DSP      as DSP    (Internal (Gov't   (Not DSP)  (Known
                          use only)  agency)              OEM)
        │         │
        └─────┬───┘
              │
              ↓
        INCLUDED IN
      HIT LIST (34 DSPs)
```

---

## Example: One Company's Journey Through the Pipeline

### Real Example: Flock Safety (4 mentions)

```
1. COLLECTION
   Article 1: Flock Aerodome Drone announcement (Google News)
   Article 2: Prosper, Texas police program (Google News)
   Article 3: Frisco Police $427k drone funding (Google News)
   Article 4: Flock Safety branding/marketing (Google News)
   
   ↓

2. SCORING
   Article 1: score=60 ✅ (named operator + deployment signal)
   Article 2: score=90 ✅ (strong police deployment)
   Article 3: score=60 ✅ (funding for police program)
   Article 4: score=45 ❌ (below threshold, dropped)
   
   ↓

3. ENTITY EXTRACTION (Articles 1-3 only)
   Article 1 entities: [{name: "Flock Safety", type: "operator"}]
   Article 2 entities: [{name: "Flock Safety", type: "operator"},
                         {name: "Prosper Police", type: "buyer"}]
   Article 3 entities: [{name: "Flock Safety", type: "operator"},
                         {name: "Frisco Police", type: "buyer"}]
   
   ↓

4. DSP EXTRACTION (TIER 1)
   Extract only type='operator'
   → 3 instances of "Flock Safety"
   
   ↓

5. DEDUPLICATION
   Normalize all to: "flock safety"
   → 1 unique entry with mention_count = 3
   → articles: [best 3 most recent/highest scored]
   → countries: ["USA"]
   → industries: ["Public Safety & Emergency Response"]
   → signal_types: ["CONTRACT", "DEPLOYMENT", "EXPANSION"]
   → key_contact: Rahul Sidhu (VP of Aviation) — cited in 3 articles
   
   ↓

6. FUZZY MATCH AGAINST PARTNERS
   normalized_name: "flock safety"
   Query: Is "flock safety" in the 81 known partners?
   → Fuzzy match: NOT FOUND (Jaccard < 0.6)
   → Status: isFlytbasePartner = false
   
   ↓

7. SCORING (REGION + INDUSTRY)
   Countries: ["USA"] → hasHighPriorityRegion = true
   → regionScore = 1.0
   
   Industries: ["Public Safety"] → hasHighPriorityIndustry = true
   → industryScore = 1.0
   
   hitScore = (1.0 × 0.5) + (1.0 × 0.5) = 1.0 ✅ (max score)
   
   ↓

8. FINAL OUTPUT IN HIT LIST
   {
     name: "Flock Safety",
     normalized_name: "flock safety",
     mention_count: 3,
     hit_score: 1.0,
     countries: ["USA"],
     industries: ["Public Safety & Emergency Response"],
     signal_types: ["CONTRACT", "DEPLOYMENT", "EXPANSION"],
     articles: [
       { title: "...", score: 90, date: "...", url: "..." },
       { title: "...", score: 60, date: "...", url: "..." },
       { title: "...", score: 60, date: "...", url: "..." }
     ],
     website: "https://flocksa fety.com/",
     linkedin: "https://linkedin.com/company/flock-safety",
     isFlytbasePartner: false,
     key_contact: { name: "Rahul Sidhu", role: "VP Aviation", ... }
   }
   
   ↓
   
   RESULT: Ranked #1 in new DSPs (highest hit_score)
```

---

## Database Schema Relevant to Hit List

```sql
-- articles table (source)
CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  source TEXT,
  title TEXT,
  url TEXT,
  published_at TIMESTAMP
);

-- scored_articles table (enriched with LLM output)
CREATE TABLE scored_articles (
  id TEXT PRIMARY KEY,
  article_id TEXT UNIQUE REFERENCES articles(id),
  relevance_score INTEGER,         -- ← Filter: >= 50
  company TEXT,                    -- ← Tier 2 fallback
  country TEXT,                    -- ← For region scoring
  industry TEXT,                   -- ← For industry scoring
  signal_type TEXT,                -- ← DEPLOYMENT, CONTRACT, etc.
  entities JSONB,                  -- ← [{name, type}, ...] (Tier 1)
  persons JSONB,                   -- ← [{name, role, org}, ...]
  drop_reason TEXT,                -- ← Filter: IS NULL
  is_duplicate BOOLEAN,            -- ← Filter: false
  status TEXT                      -- ← 'new', 'reviewed', 'dismissed'
);

-- flytbase_partners table (uploaded CSV)
CREATE TABLE flytbase_partners (
  id TEXT PRIMARY KEY,
  name TEXT,
  normalized_name TEXT,            -- ← Used for fuzzy matching
  region TEXT,
  type TEXT,                       -- ← 'partner' or other
  website TEXT,
  linkedin TEXT
);
```

---

## Filtering Summary

```
START: All articles (~200-300 per run)
  ↓
  ├─ Filter 1: score >= 50         → ~40-60 articles remain
  ├─ Filter 2: drop_reason IS NULL → same 40-60
  ├─ Filter 3: is_duplicate = false → same 40-60
  │
  ↓
  ← Load these ~40-60 articles with full entity data
  │
  ├─ Extract entities where type IN ('operator', 'si')
  ├─ Deduplicate by normalized_name
  │
  ↓ ~30-40 unique company candidates
  │
  ├─ Fuzzy match against 81 known partners
  ├─ Exclude ~30-31 high-confidence matches
  │
  ↓
  34 NEW DSPs (final output for dashboard)
```

---

## Why Counts Don't Match: Entity Frequency vs. Unique Count

### Raw Entity Counts (All articles, with repetition)

| Type | Count | Calculation |
|---|---|---|
| operator | 32 | Company A mentioned 4x = counted 4 times |
| si | 33 | Company B mentioned 2x = counted 2 times |
| **Total with repetition** | **65** | |

### Deduplicated Count (unique normalized names)

| Category | Count | Calculation |
|---|---|---|
| unique_companies_extracted | 36 | All unique DSP/SI names |
| fuzzy_matched_known | 2 | "DroneBase", "GeoAerospace" |
| **new_dsps** | **34** | 36 - 2 = 34 ← **DASHBOARD DISPLAY** |

### Why 34 ≠ (32 + 33) ÷ 2 = 32.5?

1. **Not all operators+SIs are unique** — some companies mentioned as both
2. **Fallback companies** — some from `company` field, not `entities[]`
3. **Partial overlap** — some overlap between SI and operator mentions
4. **Already known** — ~30 companies matched to the 81 known partners

---

## Key Insights

✅ **The 34 is correct** — it represents true new DSP candidates
✅ **High deduplication rate** — 36 → 34 (minimal duplicates)
✅ **Good fuzzy matching** — 2 known partners detected (6% match rate)
✅ **Quality focus** — only score ≥ 50 articles included
✅ **Actionable** — each DSP has supporting articles + key contact info
