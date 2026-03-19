# Partner Hit List — UI/Layout Context File

> Share this file with any chat window working on the Partner Hit List UI.
> Last updated: 2026-03-19

---

## What Is This Feature

**Dock Radar** is an internal FlytBase BD tool. It scrapes Google News, LinkedIn posts, and other sources, runs them through an LLM scoring pipeline, and surfaces companies deploying drones commercially. The **Partner Hit List** is the final output view — it answers: "Which new drone service providers (DSPs) and system integrators (SIs) should we contact?"

---

## Page Location

- **Route**: Accessible via the main navbar — "Partner Hit List" tab
- **Component file**: `src/components/partner-dashboard/PartnerDashboard.tsx`
- **Rendered by**: `src/app/page.tsx` (main dashboard, same page as the article queue)

---

## Three Tabs — What Each One Is

### Tab 1 · FlytBase Partners
- **Source**: `flytbase_partners` Supabase table — the existing CRM partner list, uploaded manually via CSV
- **Purpose**: Reference view of companies FlytBase already works with
- **Data**: name, region, type (partner/reseller/etc.), website, linkedin
- **API**: `GET /api/partners/list`

### Tab 2 · New DSPs
- **Source**: `scored_articles` + `articles` tables — companies extracted from news articles and LinkedIn posts by the LLM scoring pipeline
- **Purpose**: Companies discovered from articles that are NOT in the existing partner list
- **Data**: company name, countries, industries, mention count, signal types, latest article link, website (if enriched)
- **API**: `GET /api/hitlist?regionWeight=0.5&industryWeight=0.5`
- **Key logic**: Companies are extracted from `entities[]` (type = `operator` or `si`) with fallback to the `company` field. Then fuzzy-matched against `flytbase_partners` — only high-confidence matches (Jaccard >= 0.6) are removed from this tab (marked as `isFlytbasePartner=true`).

### Tab 3 · Top 20 Targets
- **Source**: Derived directly from Tab 2 — `new_companies.slice(0, 20)` after sorting by `hit_score` desc
- **Purpose**: The 20 highest-priority new DSPs for BD outreach, ranked by region + industry fit
- **Scoring formula**:
  ```
  hit_score = (regionScore × regionWeight) + (industryScore × industryWeight)
  regionScore:   1.0 if country ∈ Americas/Europe, else 0.5
  industryScore: 1.0 if industry ∈ Security/Oil&Gas/Utilities/Port/Mining/Solar, else 0.3
  regionWeight + industryWeight: user-adjustable sliders (0–1), default 0.5 each
  ```

---

## TypeScript Types

### `DspHitListEntry` — the core row type for Tab 2 and Tab 3
```typescript
interface DspHitListEntry {
  name: string;                 // display name (original LLM extraction)
  normalized_name: string;      // dedup key — lowercase, suffixes stripped
  mention_count: number;        // number of articles mentioning this company
  avg_score: number;            // unused, kept for compat (always 0)
  latest_article_date: string;  // ISO date of most recent article
  latest_article_url: string;   // URL of most recent article
  countries: string[];          // sorted unique countries from all articles
  industries: string[];         // sorted unique industries (campaign articles only)
  signal_types: string[];       // DEPLOYMENT | CONTRACT | PARTNERSHIP | EXPANSION | OTHER
  hit_score: number;            // computed weighted score (see formula above)
  articles: {                   // top 5 most recent source articles
    id: string;
    title: string;
    url: string;
    score: number;              // relevance score 0–100
    date: string;
  }[];
  website?: string;             // from discovered_companies table (Comet-enriched)
  linkedin?: string;            // from discovered_companies table (Comet-enriched)
  isFlytbasePartner?: boolean;  // true = matched existing partner (hidden from Tab 2)
}
```

### `HitListData` — full API response shape
```typescript
interface HitListData {
  new_companies: DspHitListEntry[];    // Tab 2 + Tab 3 source
  known_companies: DspHitListEntry[];  // matched existing partners (not shown in UI yet)
  stats: {
    total_extracted: number;
    new_count: number;
    known_count: number;
    match_rate: number;               // % matched to existing partners
  };
  partner_count: number;
}
```

### `Partner` — Tab 1 row type (local to component)
```typescript
interface Partner {
  id: string;
  name: string;
  region: string;
  type: string;
  website?: string;
  linkedin?: string;
}
```

---

## API Routes

### `GET /api/hitlist`
**Query params**: `regionWeight` (0–1), `industryWeight` (0–1)

**What it does**:
1. Loads `flytbase_partners` (Tab 1 reference)
2. Loads qualified scored articles (score >= 50, not dropped, not duplicate)
3. Extracts entities (operator/si) → groups by normalized company name
4. Loads `discovered_companies` (enriched website/linkedin)
5. Fuzzy-matches against partners — high-confidence = `isFlytbasePartner: true`
6. Computes hit_score per company
7. Returns `new_companies` (Tab 2/3) and `known_companies`

**Response**: `HitListData`

### `GET /api/partners/list`
Returns all rows from `flytbase_partners` table.
Fields: `id, name, normalized_name, region, type, website, linkedin`

### `POST /api/companies/enrich`
Comet / manual enrichment endpoint.
**Body**: `[{ name: "DroneForce", website?: "https://...", linkedin?: "https://..." }]`
**Response**: `{ updated: N, not_found: N, total: N }`

---

## Database Tables (relevant to this feature)

### `flytbase_partners` — Tab 1 source
```sql
id uuid, name text, normalized_name text UNIQUE,
region text, type text DEFAULT 'partner',
website text, linkedin text,
domain text, country text, notes text,
last_synced_at timestamptz, created_at timestamptz
```
Populated by CSV upload via `/api/hitlist/upload`.

### `scored_articles` — Tab 2/3 source
Key fields used by hitlist:
```sql
relevance_score integer,    -- filter: >= 50
company text,               -- fallback if no entities
country text,               -- geographic signal
industry text,              -- campaign articles only (often null)
signal_type text,           -- DEPLOYMENT | CONTRACT | PARTNERSHIP | EXPANSION | OTHER
entities jsonb,             -- [{name, type: operator|si|buyer|oem|partner|regulator}]
persons jsonb,              -- [{name, role, organization}]
drop_reason text,           -- null = not dropped
is_duplicate boolean        -- false = not a duplicate
```

### `discovered_companies` — enrichment layer (website/linkedin for new DSPs)
```sql
normalized_name text PRIMARY KEY,
display_name text,
types jsonb,          -- ['operator','si','buyer','oem','partner','regulator']
website text,         -- from Comet or manual entry
linkedin text,        -- from Comet or manual entry
countries jsonb,
industries jsonb,
signal_types jsonb,
mention_count integer,
first_seen_at timestamptz,
last_seen_at timestamptz,
enriched_at timestamptz,
enriched_by text      -- 'scoring' | 'comet' | 'manual'
```
**Important**: website/linkedin for new DSPs come from here, NOT from `flytbase_partners`.

### `discovered_contacts` — people linked to discovered companies
```sql
id uuid PRIMARY KEY,
company_normalized_name text,   -- nullable (orphan contacts allowed)
name text, name_normalized text,
role text, organization text,
linkedin text, email text,
source_article_id text,
enriched_by text
```

---

## Component State

```typescript
// Tab navigation
activeTab: 0 | 1 | 2

// Data
hitListData: HitListData | null   // from /api/hitlist
partners: Partner[]               // from /api/partners/list

// UI state
loading: boolean
syncing: boolean           // re-sync new DSPs
syncingPartners: boolean   // re-sync partners tab
expandedRows: Record<string, boolean>  // key = normalized_name or 'top-{normalized_name}'

// Tab 2 filters
selectedRegion: string     // 'all' or specific country
selectedIndustry: string   // 'all' or specific industry

// Tab 3 scoring weights (triggers API refetch on change)
scoringWeights: { regionWeight: number; industryWeight: number }

// Sort state (one per tab)
partnerSort: SortConfig    // Tab 1 — default null
dspSort: SortConfig        // Tab 2 — default { key: 'mentions', dir: 'desc' }
top20Sort: SortConfig      // Tab 3 — default { key: 'score', dir: 'desc' }
```

---

## Derived Data (computed in component, not stored in state)

```typescript
newDsps = hitListData.new_companies          // Tab 2 full list
top20 = newDsps.slice(0, 20)                 // Tab 3 (before user sorts)

regionOptions = unique countries from newDsps // Tab 2 filter dropdown
industryOptions = unique industries from newDsps

filteredNewDsps = newDsps filtered by selectedRegion + selectedIndustry
sortedPartners = partners sorted by partnerSort
sortedFilteredDsps = filteredNewDsps sorted by dspSort
sortedTop20 = top20 sorted by top20Sort
```

---

## Sortable Columns Per Tab

| Tab | Sortable | Not sortable |
|---|---|---|
| Tab 1 Partners | Name, Region, Type | Website, LinkedIn |
| Tab 2 New DSPs | Company, Region, Industry, Mentions, Signal | Website, Latest Article |
| Tab 3 Top 20 | Company, Score, Region, Industry, Articles | Website, Latest Article |

Sort indicator: active column shows green ▲/▼, inactive columns show faint grey ▼.

---

## Expandable Rows

Both Tab 2 and Tab 3 rows are clickable and expand to show **Source Articles** — up to 5 most recent articles that mention this company. Each article shows:
- Score badge (blue pill, 0–100)
- Title (linked to article URL)
- Date

Expand key for Tab 2: `dsp.normalized_name`
Expand key for Tab 3: `'top-' + dsp.normalized_name`

---

## Link Columns Logic

**WEBSITE column** (Tab 2 + Tab 3):
- Shows blue "Website ↗" button if `dsp.website` is set
- `dsp.website` comes from `discovered_companies` table (Comet-enriched)
- Currently null for most companies until Comet workflow runs
- Shows `—` if empty

**LATEST ARTICLE column** (Tab 2 + Tab 3):
- Always populated — links to `dsp.latest_article_url`
- Label shows date: "19 Mar ↗" (en-GB short format)
- Grey button style (`sLinkBtnGray`) to distinguish from website link

**WEBSITE + LINKEDIN columns** (Tab 1 only):
- Direct from `flytbase_partners` DB table

---

## Styling Approach

All styles are **inline React CSSProperties objects** defined at the bottom of the file. No Tailwind, no CSS modules. Key style constants:

```typescript
sCard           // white card with border + shadow
sTable          // full-width, collapsed borders
sTHeadRow       // header row: grey bg + bottom border
sTH             // header cell: 11px, grey, uppercase
sTD             // data cell: 12px padding, top-aligned
sTRow           // regular row (non-clickable)
sClickableRow   // clickable row with cursor:pointer
sLink           // plain blue text link
sLinkBtn        // blue pill button (website)
sLinkBtnGray    // grey pill button (article link)
sCountryTag     // blue pill for country badges
sExpandedCell   // light grey expanded row cell
sBtnSecondary   // secondary action button (re-sync, export)
sFilterLabel    // filter dropdown label
sSelect         // filter dropdown
```

Brand green used throughout: `#15803D` (active tabs, scores, weight display, sort indicators)

---

## CSV Exports

| Tab | Filename | Columns |
|---|---|---|
| Tab 1 | `flytbase-partners.csv` | Name, Region, Type, Website, LinkedIn |
| Tab 2 | `new-dsps.csv` | Company, Countries, Industries, Mentions, Signals, Website, Latest Article URL, Latest Article Date |
| Tab 3 | `top-20-targets.csv` | Rank, Company, Hit Score, Countries, Industries, Website, Latest Article URL, Latest Article Date, Articles |

Exports respect current sort order and Tab 2 active filters.

---

## KPI Cards (above tabs)

Three clickable cards that also serve as tab navigation:
- **FLYTBASE PARTNERS**: `partners.length` — switches to Tab 1
- **NEW DSPS FOUND**: `newDsps.length` — switches to Tab 2
- **TOP 20 TARGETS**: `Math.min(20, top20.length)` — switches to Tab 3

Active tab card has green ring: `boxShadow: '0 0 0 2px #15803D'`

---

## Priority Logic (HIGH vs STD pills)

Used in Tab 3 Region and Industry columns:

```
HIGH_REGIONS    = ['Americas', 'Europe', 'USA', 'Canada', 'United States', 'UK', 'Germany', 'France']
HIGH_INDUSTRIES = ['Security', 'Oil & Gas', 'Oil&Gas', 'Utilities', 'Port', 'Mining', 'Solar']
```

If a company has ANY country/industry matching these lists → green HIGH pill, else grey STD pill.

---

## Signal Type Colors

```
DEPLOYMENT  → blue  (#DBEAFE / #1D4ED8)
CONTRACT    → yellow (#FEF9C3 / #854D0E)
PARTNERSHIP → purple (#F3E8FF / #6D28D9)
EXPANSION   → green  (#DCFCE7 / #15803D)
OTHER       → grey   (#F3F4F6 / #6B7280)
```

---

## Data Volume (as of 2026-03-19)

- `flytbase_partners`: ~unknown (uploaded via CSV)
- Qualified articles (score >= 50, not dropped, not duplicate): **65**
- Unique companies extracted: **~48**
- Articles with entities (operator/si): covers ~27/48 companies
- Rest fall back to `company` field
- Industry coverage: **44%** (only campaign-mode articles have industry)
- `discovered_companies`: empty until migration + backfill run

---

## Pending Setup Steps (not yet done as of this file)

1. **Apply migration** — creates `discovered_companies` + `discovered_contacts` tables:
   ```
   supabase db push
   ```
   Or run SQL from `supabase/migrations/20260319000001_add_discovered_tables.sql` in Supabase dashboard.

2. **Run backfill** — populates `discovered_companies` from existing 65 qualified articles:
   ```
   node scripts/backfill-discovered.mjs
   ```

Until these two steps are done, `website` column will be empty for all Tab 2/3 rows.

---

## Known Limitations / Future Work

- **Industry gaps**: 56% of companies have no industry (articles from non-campaign runs). Will improve as more campaign runs are executed.
- **Country normalization**: Some countries still appear as "US" and "USA" separately in countries[] — being normalized at write time going forward in `discovered_companies` but not retroactively fixed in `scored_articles`.
- **Comet enrichment not yet run**: `website` and `linkedin` on Tab 2/3 will be `—` until Comet runs and posts to `POST /api/companies/enrich`.
- **`known_companies`** (isFlytbasePartner=true) are suppressed from Tab 2/3 but not shown anywhere yet — future enhancement to show them in Tab 1 as "spotted in news".
- **Persons/contacts**: `discovered_contacts` table exists and is being populated, but not yet displayed in the UI. Future Tab 2/3 enhancement: expandable "People" section per company.
