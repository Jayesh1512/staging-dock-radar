# PRD — Partner Hit List

**Project:** Dock Radar
**Status:** Built (v1 live) — Known issues documented
**Date:** 2026-03-19
**Owner:** FlytBase BD Team
**Location in app:** Navbar → "Partner Hit List ↗" (purple button)

---

## 1. Problem Statement

FlytBase BD needs a systematic way to discover net-new Drone Service Providers (DSPs) and Systems Integrators (SIs) from the news intelligence it already collects. Without this, the team:

- Has no view of which companies in the news are potential FlytBase partners
- Cannot distinguish leads that are already in the partner database vs truly new ones
- Has no scoring mechanism to prioritise which new DSPs to contact first
- Must manually review hundreds of articles to find actionable partner leads

The Partner Hit List solves all of this by mining scored articles for DSP/SI entities, deduplicating and normalising company names, cross-referencing against the existing FlytBase partners list, and presenting prioritised results with a tunable scoring engine.

---

## 2. User Goals

| User | Goal |
|------|------|
| BD Analyst | See which new DSPs/SIs are appearing in drone news, prioritised by region and industry fit |
| BD Manager | Confirm a partner is truly new (not already in the CRM/partner DB) before spending time on outreach |
| BD Team | Export a clean CSV of top-ranked targets to hand off for outreach |
| BD Analyst | Tune scoring weights to shift ranking between region-priority and industry-priority |

---

## 3. Feature Overview

Partner Hit List is a standalone page (not part of the Campaigns flow) accessible via the Navbar. It has:

- **KPI bar** — 3 summary cards at the top
- **Tab 1: FlytBase Partners** — full list of known partners from the DB
- **Tab 2: New DSPs** — net-new companies extracted from articles, not in the partner DB
- **Tab 3: Top 20 Targets** — ranked new DSPs with scoring sliders and proof articles

---

## 4. Data Pipeline

### 4.1 Source Data

All data flows from the `scored_articles` table — specifically articles from **Campaign runs** (C2 DSP 6-month sweep, C3 etc.) that were scored using `CAMPAIGN_SCORING_SYSTEM_PROMPT`.

**Article filter criteria** (applied in `loadHitListData()`):
- `relevance_score >= 50`
- `is_dropped = false`
- `is_duplicate = false`
- Campaign articles only (scored with industry + entities fields populated)

### 4.2 Entity Extraction

Each qualifying article's `entities[]` JSON array is scanned for DSP/SI entries.

**Extraction logic (2-tier fallback):**

```
Tier 1: article.entities[] where type === 'operator' OR type === 'si'
Tier 2 (fallback): if entities[] is empty → use article.company field with role = 'operator'
```

**Entity type taxonomy** (from `CAMPAIGN_SCORING_SYSTEM_PROMPT`):

| Type | Meaning |
|------|---------|
| `si` | Systems Integrator — integrates drone hardware/software for clients |
| `operator` | Commercial drone operator — runs drone operations (see Known Issue §9.1) |
| `buyer` | End-client or buyer — the organisation purchasing the service |
| `partner` | Technology or distribution partner |
| `oem` | Drone manufacturer (DJI, Skydio, etc.) — never extracted as a lead |
| `regulator` | Government or regulatory body |

Only `si` and `operator` types are extracted as potential FlytBase partner leads.

### 4.3 Normalisation & Deduplication

Each extracted company name is passed through `normalizeCompanyName()`:

1. Lowercase
2. Remove legal suffixes: `inc, ltd, llc, gmbh, corp, corporation, solutions, services, technologies, systems, group, limited, co, plc, pty`
3. Strip punctuation (keep alphanumeric + spaces)
4. Collapse whitespace

Companies with the same normalized name are merged into a single entry. Aggregated fields:
- `mention_count` — total article mentions
- `countries` — set of countries from all articles
- `industries` — set of industry sectors from all articles
- `signal_types` — set of signal types (DEPLOYMENT, CONTRACT, etc.)
- `articles[]` — up to 5 most recent articles as proof

### 4.4 Partner Matching (Fuzzy Dedup)

After normalisation, each extracted company is fuzzy-matched against the `flytbase_partners` table using `fuzzyMatchCompany()`:

**Algorithm:**
1. Exact match on `normalized_name` → confidence = `high`
2. Jaccard similarity on word sets (stop words filtered, tokens ≥ 3 chars):
   - Score ≥ 0.6 → confidence = `high` (treated as known)
   - Score ≥ 0.4 → confidence = `low` (treated as known)
   - Score < 0.4 → `none` (treated as new)

**Result:** Companies split into `new_companies` (not in partner DB) and `known_companies` (already a partner).

### 4.5 Hit Score Calculation

Each new company is scored using a **2-parameter formula**:

```
hit_score = (region_score × regionWeight) + (industry_score × industryWeight)
```

**Region Score:**
- `1.0` — company is associated with any Americas or Europe country
  - Priority list: `Americas, Europe, USA, Canada, United States, UK, Germany, France`
- `0.5` — all other regions

**Industry Score:**
- `1.0` — company is associated with any high-priority industry
  - Priority list: `Security, Oil & Gas, Oil&Gas, Utilities, Port, Mining, Solar`
- `0.3` — all other industries

**Weights (user-adjustable sliders, default 0.5 each):**
- `regionWeight` — range [0, 1]
- `industryWeight` — range [0, 1]
- Slider changes trigger an automatic API refetch with new weights

**Score range:** 0.15 (low region + low industry, both weights at 0.5) to 1.0 (both high priority, both weights at 1.0)

---

## 5. API

### `GET /api/hitlist`

Returns the full hit list data.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `regionWeight` | float [0–1] | `0.5` | Weight applied to region score |
| `industryWeight` | float [0–1] | `0.5` | Weight applied to industry score |

**Response shape:**

```json
{
  "new_companies": [DspHitListEntry],
  "known_companies": [DspHitListEntry],
  "stats": {
    "total_extracted": 45,
    "new_count": 24,
    "known_count": 21,
    "match_rate": 47
  },
  "partner_count": 81
}
```

**`DspHitListEntry` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Original company name from article |
| `normalized_name` | string | Normalised form used for dedup |
| `mention_count` | number | Total article mentions |
| `countries` | string[] | Countries where company appears |
| `industries` | string[] | Industry sectors from articles |
| `signal_types` | string[] | Signal types (DEPLOYMENT, CONTRACT, etc.) |
| `hit_score` | number | Calculated 2-param score |
| `articles` | array | Up to 5 proof articles (id, title, score, date) |
| `website` | string\|null | From flytbase_partners (if known match) |
| `linkedin` | string\|null | From flytbase_partners (if known match) |
| `isKnown` | boolean | True if fuzzy-matched to a known partner |

---

## 6. UI Specification

### 6.1 Page Layout

```
┌─ Navbar (purple "Partner Hit List ↗" active) ─────────────────────────────┐
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐          │
│  │  FlytBase         │ │  New DSPs Found  │ │  Top 20 Targets  │          │
│  │  Partners         │ │                  │ │                  │          │
│  │  81               │ │  24              │ │  20              │          │
│  │  [click → Tab 1]  │ │  [click → Tab 2] │ │  [click → Tab 3] │          │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘          │
│                                                                            │
│  [FlytBase Partners] [New DSPs (24)] [Top 20 Targets]                     │
│  ─────────────────────────────────────────────────────────────────────    │
│  <tab content>                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 KPI Cards

Three cards, horizontally arranged, each:
- Shows a label (small, grey) and a large count
- Has `cursor: pointer` and a green hover ring (`box-shadow: 0 0 0 2px #15803D`)
- Clicking navigates to the corresponding tab (setActiveTab(0/1/2))

### 6.3 Tab 1 — FlytBase Partners

**Purpose:** Verify and audit existing partner data.

**Columns:**
| Column | Source |
|--------|--------|
| Name | `flytbase_partners.name` |
| Region | `flytbase_partners.region` |
| Type | `flytbase_partners.type` |
| Website | `flytbase_partners.website` (hyperlink, opens new tab) |
| LinkedIn | `flytbase_partners.linkedin` (hyperlink, opens new tab) |

**Controls:**
- Export CSV button (downloads all partners)
- `—` shown for empty website/linkedin fields

**Data source:** `loadFlytBasePartners()` → `flytbase_partners` table, columns: `id, name, normalized_name, region, type, website, linkedin`

### 6.4 Tab 2 — New DSPs

**Purpose:** Browse all net-new DSPs extracted from articles (not yet in the partner DB), with filters and article proof.

**Filter controls:**
- Region dropdown (derived from `countries` across all entries)
- Industry dropdown (derived from `industries` across all entries)

**Table columns:**
| Column | Details |
|--------|---------|
| Company | Name + country tags |
| Industry | Comma-separated industries |
| Mentions | Article mention count |
| Signal | Signal type badges |
| Website | Link if available, `—` otherwise |
| LinkedIn | Link if available, `—` otherwise |
| ▶ Expand | Click row to reveal proof articles |

**Expandable row:**
- Shows up to 5 articles: title, relevance score badge, date
- Each article title is a clickable link (article URL)

**Controls:**
- Re-sync button — re-calls `fetchHitList()` to refresh from DB
- Export CSV button — downloads all new DSPs

### 6.5 Tab 3 — Top 20 Targets

**Purpose:** Prioritised ranking of the top 20 new DSPs to pursue, with scoring controls and full score breakdown.

**Scoring rules box** (green background, top of tab):
```
Scoring Rules:
Region Priority (Americas / Europe) → +1.0 × region weight
Other regions → +0.5 × region weight
High-value industries (Security, Oil & Gas, Utilities, Port, Mining, Solar) → +1.0 × industry weight
Other industries → +0.3 × industry weight
```

**Scoring sliders:**
- Region Weight: slider 0–1, default 0.5, step 0.01
- Industry Weight: slider 0–1, default 0.5, step 0.01
- Any slider change triggers `fetchHitList(regionWeight, industryWeight)` automatically

**Table columns:**
| Column | Details |
|--------|---------|
| Rank | 1–20 |
| Company | Name |
| Hit Score | Rounded to 2 decimal places |
| Region Priority | Green pill ("High") or grey pill ("Standard") |
| Industry Priority | Green pill ("High") or grey pill ("Standard") |
| Website | Hyperlink or `—` |
| LinkedIn | Hyperlink or `—` |
| Proof | Link count badge (e.g. "3 articles") |
| ▶ Expand | Expandable row |

**Expandable row (split layout):**
- Left panel: Score breakdown
  - Region Score: X.X × regionWeight = X.X
  - Industry Score: X.X × industryWeight = X.X
  - Total Hit Score: X.XX
- Right panel: Proof articles
  - Up to 5 articles: title (linked), score badge, date

**Controls:**
- Export CSV button — downloads top 20 with all fields

---

## 7. Database Schema

### `flytbase_partners`

```sql
id             uuid PRIMARY KEY
name           text NOT NULL
normalized_name text NOT NULL
region         text
type           text  -- e.g. 'si', 'operator', 'reseller'
website        text
linkedin       text
created_at     timestamptz DEFAULT now()
```

Partners are loaded via `loadFlytBasePartners()` in `src/lib/db.ts`.

### `scored_articles` (read-only from this feature)

Key fields used:
```sql
article_id     uuid (FK → articles.id)
relevance_score int
entities       jsonb  -- [{"name": "...", "type": "si"|"operator"|...}]
company        text   -- fallback if entities is empty
country        text
industry       text
signal_type    text
is_dropped     boolean
is_duplicate   boolean
```

---

## 8. File Map

| File | Role |
|------|------|
| `src/app/api/hitlist/route.ts` | GET endpoint — full scoring pipeline |
| `src/components/partner-hitlist/PartnerHitList.tsx` | Page component — 3-tab UI |
| `src/lib/db.ts` → `loadFlytBasePartners()` | Loads partner list with website/linkedin |
| `src/lib/db.ts` → `loadHitListData()` | Loads qualifying scored articles |
| `src/lib/company-normalize.ts` → `normalizeCompanyName()` | Name normalisation |
| `src/lib/company-normalize.ts` → `fuzzyMatchCompany()` | Fuzzy partner matching |
| `src/lib/types.ts` → `DspHitListEntry`, `HitListData` | Shared types |
| `src/lib/scoring-prompt.ts` → `CAMPAIGN_SCORING_SYSTEM_PROMPT` | LLM prompt (entity type definitions) |
| `src/app/page.tsx` | Routing — `showPartnerHitList` state |
| `src/components/shared/Navbar.tsx` | Nav button — `onPartnerHitList` / `partnerHitListActive` |

---

## 9. Known Issues & Backlog

### 9.1 High False Positive Rate (~55%) — OPEN

**Root cause:** The `operator` entity type in `CAMPAIGN_SCORING_SYSTEM_PROMPT` is ambiguous. The LLM applies it to:
- ✅ Commercial DSPs offering drone services to third-party clients (correct)
- ❌ End-users operating drones for internal use (police, hospitals, fire departments, food delivery companies) — these should be `buyer`

**Impact:** ~11 of 20 top-ranked companies in the current dataset are end-users, not potential FlytBase DSP partners.

**Examples of false positives observed:**
- Amazon (internal logistics drone ops)
- NPAS (UK National Police Air Service — public safety end-user)
- Various US police departments and fire departments
- Hospital drone delivery programs
- Grubhub / Wonder (food delivery — consumer-facing)

**Proposed fix (not yet applied):**
Add to `CAMPAIGN_SCORING_SYSTEM_PROMPT` under CRITICAL RULES:
> `"operator"` = a company commercially offering drone services to third-party clients. If the company operates drones only for its own internal use, classify them as `"buyer"` instead.

**Status:** Confirmed. Awaiting user approval to apply to scoring prompt.

### 9.2 Partner Website/LinkedIn Fields Empty — OPEN

All 81 partners currently have `NULL` for `website` and `linkedin` in the DB. The schema and `loadFlytBasePartners()` select them correctly — the data just hasn't been populated.

**Impact:** Website and LinkedIn columns in Tab 1 and Tab 2 all show `—`.

**Fix:** Enrichment pass against partner names (manual or via enrichment agent). Marked "later."

### 9.3 New DSP Website/LinkedIn Also Empty — OPEN

Same issue for the `new_companies` list — website/linkedin only populates if the company is a known partner match (pulled from `flytbase_partners`). New companies have no enrichment yet.

**Fix:** Run enrichment on extracted DSP names. Marked "later."

### 9.4 Contact Person Identification — BACKLOG

No named contacts are surfaced per DSP yet. Article `persons[]` field contains named individuals per article — these could be aggregated per company and shown in the expandable row.

### 9.5 CRM / Outreach Integration — BACKLOG

No push-to-CRM or outreach workflow exists. Partners must be manually tracked externally after export.

---

## 10. Scoring Tuning Guide

The 2-param scoring model is intentionally simple and tunable. Use the sliders to shift priorities:

| Scenario | regionWeight | industryWeight |
|----------|-------------|---------------|
| Prioritise European/American markets equally with industry | 0.5 | 0.5 (default) |
| Pure industry fit regardless of region | 0.0 | 1.0 |
| Pure geography regardless of industry | 1.0 | 0.0 |
| Americas/Europe dominant, industry secondary | 0.8 | 0.2 |
| Energy/Security dominant, any region | 0.2 | 0.8 |

**Score interpretation:**
| Score | Meaning |
|-------|---------|
| 0.9–1.0 | High-priority region + high-priority industry |
| 0.6–0.8 | One dimension high, one medium/low |
| 0.3–0.5 | Low fit on both dimensions |

---

## 11. Future Enhancements

| Enhancement | Priority | Notes |
|-------------|----------|-------|
| Fix `operator` type prompt — reduce false positives | High | See §9.1 — one-line prompt change |
| Enrich website/LinkedIn for all partners | Medium | Can use enrichment agent already built |
| Enrich website/LinkedIn for new DSPs | Medium | Same agent, different input |
| Add contact person per DSP (from persons[]) | Medium | Data already in scored_articles |
| "Mark as Reviewed" / "Add to Pipeline" actions on rows | Medium | Needs new DB table |
| Add a 3rd scoring param for mention frequency | Low | Signal strength proxy |
| CRM push (HubSpot / Attio integration) | Low | Post-validation |
| Slack alert when a new high-score DSP appears | Low | Would need cron or run hook |
