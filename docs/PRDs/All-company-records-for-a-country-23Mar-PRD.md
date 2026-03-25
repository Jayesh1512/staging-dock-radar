# PRD: SIRENE Company Registry Waterfall — Regional DSP Discovery

**Project:** Dock Radar (sub-utility)
**Sprint:** Hunt for Instadrone — 10hr hack
**Author:** FlytBase BD
**Date:** 2026-03-23
**Litmus test:** Can this waterfall surface `INSTADRONE` (SIREN 827837832) in the top 10 from a cold scan of the entire French company database — without ever querying for "instadrone" specifically?

**Result:** ✅ Instadrone at rank 5 out of 955 filtered companies, extracted from 29.3M total French entities.

---

## 1. Problem

FlytBase BD needs to discover drone service providers (DSPs) in target regions. Existing signal sources (coupon news, LinkedIn, DJI partner lists) miss operators who don't actively market on social platforms. The Google Dock Crawler (companion PRD) finds companies by crawling search results for DJI Dock keywords — but it only catches companies with a web presence mentioning specific products.

A complementary approach: **every business in a country must register with a government authority.** If we can download an entire country's company registry and apply progressive filters, we can surface drone companies that exist nowhere else in our pipeline.

## 2. What This Utility Does

A repeatable batch process that:

1. Downloads the full company registry for a target country (bulk CSV/parquet)
2. Loads it into memory and applies a waterfall of progressive filters
3. Scores and ranks surviving companies by DSP likelihood
4. Outputs a filtered, scored dataset (CSV) for upload to Supabase
5. Creates a `sirene_drone_companies` table for the BD team to work from

**This is NOT a real-time tool.** It's a batch process run once per region, refreshed quarterly when registry data updates.

## 3. How It Works — The Waterfall

```
COUNTRY COMPANY REGISTRY (e.g., France SIRENE: 29.3M entities)
    │
    ▼
STAGE 1: Active companies only
    Filter: etat_administratif = "A" (or country equivalent)
    Drop: closed, liquidated, dissolved entities
    │
    ▼
STAGE 2: Name substring match
    Filter: company name CONTAINS "drone" OR "uav" OR "telepilot" (etc.)
    Key: SUBSTRING match, not word-boundary — catches compound names
    like "INSTADRONE", "AZURDRONES", "SKYDRONE"
    │
    ▼
STAGE 3: NAF/SIC code blacklist
    Drop: agriculture, food, textiles, finance, real estate, healthcare,
    public admin — sectors where "drone" in name is coincidental
    Keep: engineering, technical services, IT, security, aerial transport,
    photography, consulting, R&D
    │
    ▼
STAGE 4: Company age filter
    Drop: companies created less than 1 year ago (likely not operational)
    │
    ▼
STAGE 5: Exclude training/hobby/toy
    Drop: companies with names indicating drone schools, racing, toys
    │
    ▼
STAGE 6: Composite scoring
    Score by: employee count, company age, legal form, NAF code,
    name keywords (services, inspection, surveillance, tech, etc.)
    Rank: highest score first
    │
    ▼
OUTPUT: Scored CSV → Supabase table
    ~500–1000 records per country
    Top 50 = high-confidence DSP leads
```

## 4. Country Registry Reference

Each country has an equivalent business registry. The waterfall logic is the same; only the data source and field mappings change.

| Country | Registry | Access | Format | Size | Name Field | Activity Code |
|---------|----------|--------|--------|------|------------|---------------|
| **France** | SIRENE (INSEE) | Free bulk download | Parquet/CSV | 651MB / 901MB | `denominationUniteLegale` | NAF (`activitePrincipaleUniteLegale`) |
| Germany | Handelsregister / Unternehmensregister | Partial open data | CSV | TBD | `name` | WZ code |
| UK | Companies House | Free bulk download | CSV | ~500MB | `CompanyName` | SIC code |
| Spain | CNAE (INE) | Partial | CSV | TBD | `denominacion` | CNAE code |
| Italy | Registro Imprese (InfoCamere) | Partial open data | CSV | TBD | `denominazione` | ATECO code |
| Netherlands | KVK (Kamer van Koophandel) | API | JSON | API-based | `naam` | SBI code |

### France Data Source (Proven)

- **URL:** `https://object.files.data.gouv.fr/data-pipeline-open/siren/stock/StockUniteLegale_utf8.parquet`
- **Also at:** `https://www.data.gouv.fr/en/datasets/base-sirene-des-entreprises-et-de-leurs-etablissements-siren-siret/`
- **Records:** 29,331,094 (as of March 2026)
- **Update frequency:** Monthly stock file, daily incremental updates
- **License:** Open data (Licence Ouverte / Open Licence)
- **No API key required** for bulk download

### France Column Mapping

| Our Field | SIRENE Column | Description |
|-----------|---------------|-------------|
| siren | `siren` | Unique 9-digit company identifier |
| company_name | `denominationUniteLegale` | Registered legal name |
| trade_name | `denominationUsuelle1UniteLegale` | Commercial/trade name |
| acronym | `sigleUniteLegale` | Company acronym |
| naf_code | `activitePrincipaleUniteLegale` | NAF activity classification |
| employee_band | `trancheEffectifsUniteLegale` | Employee count band (code) |
| has_employees | `caractereEmployeurUniteLegale` | "O"=yes, "N"=no |
| company_category | `categorieEntreprise` | PME / ETI / GE |
| legal_form_code | `categorieJuridiqueUniteLegale` | Legal form (SAS=57xx, SARL=54xx) |
| created_date | `dateCreationUniteLegale` | Company creation date |
| status | `etatAdministratifUniteLegale` | "A"=active, "C"=closed |

### Employee Band Codes (France)

| Code | Meaning | Estimated Count |
|------|---------|-----------------|
| NN | Not declared | 0 |
| 00 | 0 employees | 0 |
| 01 | 1–2 | 1 |
| 02 | 3–5 | 3 |
| 03 | 6–9 | 6 |
| 11 | 10–19 | 15 |
| 12 | 20–49 | 20 |
| 21 | 50–99 | 50 |
| 22 | 100–199 | 100 |
| 31 | 200–249 | 200 |
| 32 | 250–499 | 250 |
| 41 | 500–999 | 500 |
| 42 | 1000–1999 | 1000 |
| 51 | 2000–4999 | 2000 |
| 52 | 5000–9999 | 5000 |
| 53 | 10000+ | 10000 |

---

## 5. Filter Specifications

### Stage 2: Name Substring Keywords

These are the terms to search for in company names. **Substring match** (not word-boundary) — this is critical for catching compound names.

```yaml
# For France
drone_keywords:
  - "drone"       # catches: INSTADRONE, AZURDRONES, SKYDRONE, etc.
  - "uav"
  - "uas "         # trailing space to avoid "USASPORT" false positives
  - "telepilot"
  - "télépilot"
  - "rpas"

# For Germany (extend with local terms)
drone_keywords_de:
  - "drone"
  - "drohne"
  - "uav"
  - "fernpilot"
  - "unbemannt"    # unmanned

# For UK
drone_keywords_uk:
  - "drone"
  - "uav"
  - "uas"
  - "rpas"
  - "remote pilot"
```

### Stage 3: NAF Code Blacklist

Drop companies in these sector prefixes — "drone" in their name is coincidental or irrelevant.

```python
NAF_BLACKLIST_PREFIX = [
    "01.", "02.", "03.",  # Agriculture, forestry, fishing
    "10.", "11.", "12.",  # Food manufacturing
    "13.", "14.", "15.",  # Textiles, leather
    "16.", "17.", "18.",  # Wood, paper, printing
    "19.", "20.", "21.",  # Chemicals, pharma
    "23.", "24.", "25.",  # Materials, metals
    "35.",               # Electricity/gas supply
    "36.", "37.", "38.",  # Water, waste
    "41.", "42.",        # Construction of buildings/civil eng
    "45.",               # Vehicle trade
    "55.", "56.",        # Accommodation, food service
    "64.", "65.", "66.",  # Finance, insurance
    "68.",               # Real estate
    "84.",               # Public administration
    "86.", "87.", "88.",  # Health, social work
    "90.", "91.", "92.", "93.", "94.", "95.", "96.", "97.", "98.", "99.",
]
```

### Stage 5: Exclusion Patterns

```python
EXCLUDE_PATTERNS = [
    "formation drone", "école drone", "ecole drone",
    "drone academy", "drone school",
    "drone racing", "fpv racing",
    "jouet drone", "toy drone",
    "drone loisir",
]
```

### Stage 6: Scoring Weights

```python
# Employee size
EMP_SCORE = {
    "NN": 0, "00": 0, "01": 2, "02": 5, "03": 8,
    "11": 12, "12": 15, "21": 20, "22": 22,
    "31": 25, "32": 25, "41": 28, "42": 30,
    "51": 30, "52": 30, "53": 30,
}

# Has declared employees: +3
# Company category: ETI +12, GE +15, PME +5
# Company age: ≥7yr +8, ≥4yr +5, ≥2yr +2
# Legal form: SAS (57xx) +3, SARL (54xx) +2

# NAF code bonus (most relevant sectors)
PREMIUM_NAF = {
    "71.12B": 8,  # Engineering, technical studies
    "71.20B": 8,  # Technical testing & analysis
    "71.12A": 5,  # Architecture + engineering
    "74.90B": 5,  # Other professional activities
    "80.10Z": 5,  # Private security
    "51.10Z": 5,  # Air transport
    "62.01Z": 3,  # Computer programming
    "63.11Z": 3,  # Data processing
    "72.19Z": 5,  # R&D natural sciences
}

# Name keyword bonuses
SERVICE_KEYWORDS = [  # +4 each
    "inspection", "surveillance", "sécurité", "securite", "services",
    "industrie", "énergie", "energie", "infrastructure", "maintenance",
]
TECH_KEYWORDS = [  # +2 each
    "thermographie", "photogrammétrie", "topographie", "lidar",
    "cartographie", "ingenierie", "ingénierie", "technique",
    "solutions", "tech", "system", "aérien", "aerien",
]

# Penalties
# "photo" without "gramm" (photography, not photogrammetry): -3
# "video" / "vidéo": -3
# "film": -3
# "agri" / "épandage": -2
```

---

## 6. Supabase Table

### SQL Migration

Run this in your Supabase SQL editor or via migration file:

```sql
-- Table: sirene_drone_companies
-- Purpose: Stores filtered drone-related companies from national business registries
-- Source: Bulk registry download → waterfall filter → scored output
-- One row per company per region

CREATE TABLE IF NOT EXISTS sirene_drone_companies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    siren TEXT NOT NULL,
    company_name TEXT NOT NULL,
    trade_name TEXT,
    acronym TEXT,
    naf_code TEXT,
    legal_form_code TEXT,
    employee_band TEXT,
    has_employees BOOLEAN DEFAULT FALSE,
    company_category TEXT,
    created_date TEXT,
    composite_score INTEGER DEFAULT 0,
    rank INTEGER,
    region TEXT NOT NULL DEFAULT 'FR',
    signal_source TEXT DEFAULT 'sirene_bulk_db',
    filter_version TEXT DEFAULT 'waterfall_v1',
    extracted_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,

    UNIQUE(siren, region)
);

-- Indexes for common query patterns
CREATE INDEX idx_sirene_drone_score ON sirene_drone_companies(composite_score DESC);
CREATE INDEX idx_sirene_drone_region ON sirene_drone_companies(region);
CREATE INDEX idx_sirene_drone_siren ON sirene_drone_companies(siren);

-- Enable RLS (adjust policies as needed for your project)
ALTER TABLE sirene_drone_companies ENABLE ROW LEVEL SECURITY;
```

### France Seed Data

The attached file `sirene_drone_fr_filtered.csv` contains 955 pre-filtered, pre-scored French drone companies ready for import.

**To import via Supabase Dashboard:**
1. Go to Table Editor → `sirene_drone_companies`
2. Click "Insert" → "Import data from CSV"
3. Upload `sirene_drone_fr_filtered.csv`
4. Map columns (they match the table schema 1:1)

**To import via CLI / SQL:**
```sql
-- If using psql or Supabase SQL editor with the CSV uploaded:
COPY sirene_drone_companies (
    siren, company_name, trade_name, acronym, naf_code,
    legal_form_code, employee_band, has_employees, company_category,
    created_date, composite_score, rank, region, signal_source,
    filter_version, extracted_at, notes
)
FROM '/path/to/sirene_drone_fr_filtered.csv'
WITH (FORMAT csv, HEADER true);
```

### Score Tiers in the Data

| Tier | Score Range | Count (France) | What They Are |
|------|-------------|-----------------|---------------|
| Hot | ≥ 30 | 19 | Established DSPs — Azur Drones, Instadrone, Parrot Drones, Drone Volt |
| Warm | 20–29 | 119 | Solid drone service companies worth evaluating |
| Cool | 10–19 | 625 | Smaller operators, sole proprietors with some signal |
| Cold | < 10 | 192 | Minimal signal — kept for completeness |

---

## 7. France Run — Proven Results

### Waterfall Metrics

| Stage | Filter | Remaining | Dropped |
|-------|--------|-----------|---------|
| 0. Raw database | Entire SIRENE registry | 29,331,094 | — |
| 1. Active only | `etatAdministratif = "A"` | 16,851,670 | 12,479,424 |
| 2. Name substring | Contains drone/uav/telepilot | 1,604 | 16,850,066 |
| 3. NAF blacklist | Remove implausible sectors | 1,164 | 440 |
| 4. Age > 1 year | Created before 2025-01-01 | 956 | 208 |
| 5. Exclude training/hobby | Drop schools, racing, toys | 955 | 1 |
| 6. Scored & ranked | Composite score applied | **955 final** | — |

### Top 10 (France)

| Rank | Score | Company | NAF | Employees | Category |
|------|-------|---------|-----|-----------|----------|
| 1 | 48 | AZUR DRONES | 74.90B | 50–99 | ETI |
| 2 | 41 | SQUADRONE SYSTEM | 71.12B | 20–49 | PME |
| 3 | 41 | DIODON DRONE TECHNOLOGY | 71.12B | 20–49 | PME |
| 4 | 39 | UAVIA | 71.12B | 20–49 | PME |
| **5** | **39** | **INSTADRONE** ★ | **71.12B** | **20–49** | **PME** |
| 6 | 38 | PARROT DRONES | 26.70Z | 100–199 | PME |
| 7 | 36 | SKYDRONE INNOVATIONS | 71.12B | 10–19 | PME |
| 8 | 36 | SEMADRONES | 71.12B | 10–19 | PME |
| 9 | 35 | VOYAGES DESCAMPS DUAVRANT | 49.39B | 50–99 | PME |
| 10 | 34 | ARTECH'DRONE | 71.12B | 6–9 | PME |

### Litmus Test

✅ **INSTADRONE surfaced at rank 5 out of 955 filtered companies** — extracted from 29.3M total French entities, with zero Instadrone-specific queries anywhere in the pipeline. Pure waterfall filtering on generic terms ("drone", "uav", "telepilot") with substring matching.

### Execution Time

- Download: ~2 minutes (651MB parquet file)
- Scan + filter + score: ~20 seconds
- Total: **under 3 minutes**

---

## 8. Running for a New Country

### Step-by-Step

1. **Identify the registry source** — Find the country's bulk company database (see table in Section 4). Download the parquet or CSV.

2. **Map the columns** — Identify which columns correspond to: company name, activity code, employee count, status (active/closed), creation date, legal form.

3. **Adapt filter keywords** — Translate drone-related terms to the local language. Add to the Stage 2 keyword list.

4. **Adapt NAF blacklist** — Map to the country's activity classification system (SIC for UK, WZ for Germany, ATECO for Italy). The sector logic is the same — just different code schemes.

5. **Run the waterfall** — Same Python script, different input file and config.

6. **Upload to Supabase** — Same table (`sirene_drone_companies`), different `region` value. The `UNIQUE(siren, region)` constraint keeps data clean across countries.

### Example: Adapting for Germany

```python
# Column mapping for Handelsregister
COLUMN_MAP_DE = {
    "company_name": "name",           # or "firma"
    "activity_code": "wz_code",       # Wirtschaftszweig
    "employee_band": "beschaeftigte", # employees
    "status": "status",               # aktiv/gelöscht
    "created_date": "gruendungsdatum",
}

# Stage 2 keywords for Germany
DRONE_KEYWORDS_DE = ["drone", "drohne", "uav", "fernpilot", "unbemannt"]

# Region tag
REGION = "DE"
```

---

## 9. Relationship to Other Signal Sources

This utility is one signal source in the Dock Radar multi-signal pipeline:

```
Signal Sources (Discovery)          Enrichment Layer         Output
─────────────────────────          ────────────────         ──────
                                                          
Google Dock Crawler ──────┐                              
  (website keyword crawl)  │                              
                           ├──→ MERGE by domain/SIREN ──→ Scored
SIRENE Waterfall ─────────┤      + cross-enrich            Lead
  (THIS PRD)               │                               List
                           │                              
LinkedIn Subdomain ───────┤                              
  (fr.linkedin.com crawl)  │                              
                           │                              
DJI Partner Scraper ──────┘                              
```

Each signal source catches different companies. Together they form the most complete view:
- **Google Dock Crawler** catches companies without "drone" in their legal name (Altametris, Flying Eye)
- **SIRENE Waterfall** catches companies that don't rank on Google but exist in the registry
- **LinkedIn** catches companies actively posting about deployments
- **DJI Partner Scraper** catches authorized dealers/partners

---

## 10. Attached File

**`sirene_drone_fr_filtered.csv`** — 955 rows, ready for Supabase import.

Columns: `siren`, `company_name`, `trade_name`, `acronym`, `naf_code`, `legal_form_code`, `employee_band`, `has_employees`, `company_category`, `created_date`, `composite_score`, `rank`, `region`, `signal_source`, `filter_version`, `extracted_at`, `notes`

**Instructions:**
1. Run the SQL migration from Section 6 in your Supabase project
2. Import the CSV via the Supabase Dashboard table editor or `psql COPY`
3. Verify: `SELECT * FROM sirene_drone_companies WHERE company_name ILIKE '%instadrone%'` should return rank 5
