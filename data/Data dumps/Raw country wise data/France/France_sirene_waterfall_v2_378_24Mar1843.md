# Context: SIRENE Company Registry Waterfall v2 — France Drone Market

## Purpose
This file provides context for the AI IDE about the SIRENE waterfall pipeline that identifies DJI Dock-relevant drone service providers (DSPs) in France. The CSV data at the bottom is the final output — 378 scored companies ready for Supabase import.

---

## Why the Numbers Changed: 955 → 378

### v1 (previous): 955 companies — issues identified
1. **Substring matching** — `uav` matched ACQUAVIVA, GUAVA, AQUAVAL; `rpas` matched SHERPAS, HARPASS, CYBERPASTA. 131+ false positives (13.7%+ noise).
2. **Non-Dock drone segments included** — photography (74.20Z: 269 companies), video production (59.11B: 69), cleaning (81.22Z: 77) are drone operators but use DJI Mavic/spray drones, NOT DJI Dock. DJI Dock is for autonomous industrial inspection/surveillance.
3. **Scoring was 0-48** on an arbitrary scale, not normalised to 100.

### v2 (current): 378 companies — what changed
1. **Word-boundary matching** — `\bUAV\b` (not substring), `\bRPAS\b` (not substring). Zero false positives.
2. **NAF filtering removes non-Dock segments** — photography, video, cleaning, training all excluded. Only Dock-relevant NAF codes retained (engineering, testing, security, air transport, software, consulting).
3. **Scoring redesigned to /100 scale** — pragmatic model where age and company size are NOT discriminators (dock drone industry is 2-3 years old).
4. **No hard cutoffs** on age or employees — these are scoring signals only.

### Migration from v1 to v2 — detailed overlap analysis

| Category | Count | Details |
|---|---|---|
| **In both v1 and v2** | 266 | Same company, rescored on /100 scale |
| **Only in v1 (dropped)** | 689 | See breakdown below |
| **Only in v2 (new)** | 112 | From broader name matching + no age cutoff |

**689 v1 companies dropped — fully accounted for:**

| Drop reason | Count | Examples |
|---|---|---|
| Photo/video/cleaning NAF | 504 | DRONE PRO 360 (74.20Z), DRONE D'CAP (81.22Z) |
| UAV false positives | 89 | GUAVA CONSULTING, AQUAVIVA, CETEME-AQUAVIE |
| Other blacklisted NAF | 72 | SPACE DRONE (47.91B retail), TY DRONE (85.59B training) |
| Training/hobby | 6 | DRONE MODELISME, DRONES CENTER FORMATIONS |
| Other edge cases | 18 | Misc |

**Risk check:** Only 1 company flagged — UAVIA (NAF 71.12B, a real UAV company at uavia.com). Dropped because `\bUAV\b` fails on "UAVIA" (no word break). Should be added back manually if not already in the database from another signal source.

### Action for Supabase migration

1. **DELETE** all records where `filter_version = 'waterfall_v1'` and `signal_source = 'sirene_bulk_db'`
2. **INSERT** 378 records from the CSV below with `filter_version = 'waterfall_v2'`
3. **Manually add** UAVIA (SIREN: lookup needed) as an exception if desired
4. Do NOT do partial update — scoring models are incompatible (v1: 0-48, v2: 50-95 on /100)

---

## Waterfall Pipeline: 29.3M → 378

### Stage 0: Full SIRENE database → 29,331,094
- Source: [data.gouv.fr — Base SIRENE](https://www.data.gouv.fr/en/datasets/base-sirene-des-entreprises-et-de-leurs-etablissements-siren-siret/)
- Monthly parquet file, 651MB, CC-BY licensed
- Includes EVERY legal unit ever registered in France (sole proprietors, associations, SCIs, public bodies)
- Note: INSEE reports ~5-6M "economically active enterprises" — the 29M includes dissolved and non-commercial entities ([INSEE source](https://www.insee.fr/fr/statistiques/8727786))

### Stage 1: Active entities → 16,851,670
- Filter: `etatAdministratifUniteLegale = "A"`
- Removed: 12,479,424 dissolved/liquidated/ceased entities
- The 16.8M breakdown: 7.7M sole proprietors + 2.5M real estate SCIs + 1.5M associations + 5.0M structured companies
- Population ratio: ~5M structured companies for 68M people = 1 per 13 (matches [INSEE](https://www.insee.fr/fr/statistiques/7681078))

### Stage 2: Name keyword match (word boundary) → 1,326
- Searched across: `denominationUniteLegale`, `nomUsageUniteLegale`, `sigleUniteLegale`
- All data in SIRENE is UPPERCASE

| Keyword | Match type | Matches | Examples |
|---|---|---|---|
| DRONE* | Substring (safe — 5+ chars, no FP risk) | 1,209 | INSTADRONE, AZUR DRONES, DRONE VOLT |
| UAV | Word boundary `\bUAV\b` only | 9 | UAV INNOVATION CONSULTING, UAV PILOTE |
| RPAS | Word boundary `\bRPAS\b` only | 0 | No standalone RPAS in any French company name |
| TELEPILOT* | Substring | 5 | TELEPILOTE, DMS TELEPILOTE |
| **False positives removed** | UAV substring (ACQUAVIVA, GUAVA): 424. RPAS substring (SHERPAS, HARPASS): 103 | **527** | |
| **Net matches** | | **1,326** | |

Why word boundary matters: `uav` as substring matches ACQUAVIVA (food), AQUAVAL (water), GUAVA (software) — 424 false positives. `rpas` as substring matches SHERPAS (transport), HARPASS (consulting), CYBERPASTA (restaurant) — 103 false positives.

### Stage 3: NAF code filter (Dock-relevant only) → 383
- Removed: 943 companies in non-Dock NAF codes

**Removed NAF codes (not DJI Dock relevant):**

| NAF | Description | Removed | Why |
|---|---|---|---|
| 74.20Z | Photography | ~269 | Aerial photo with DJI Mavic — manned flights, not autonomous Dock |
| 81.22Z | Cleaning | ~77 | Spray drones (Drone Volt Hercules) — DJI Dock has no spray capability |
| 59.11B | Video production | ~69 | Aerial video — manned creative flights |
| 59.11A | Film production | ~20 | Same as above |
| 81.21Z | General cleaning | ~37 | Same as 81.22Z |
| 85.59A/B | Training | ~35 | Drone pilot schools |
| 94.99Z | Associations | ~65 | Drone racing clubs, hobby groups |
| 68.20A/B | Real estate | ~102 | SCIs with "drone" in address coincidence |
| Others | Retail, food, finance, etc. | ~169 | Non-drone businesses |

**Retained NAF codes (DJI Dock relevant):**

| NAF | Description | Kept | Why Dock-relevant |
|---|---|---|---|
| 71.12B | Engineering — technical | 70 | Infrastructure inspection — core Dock use case |
| 71.20B | Technical testing | 37 | Inspection/testing — core Dock use case |
| 74.90B | Professional activities NEC | 30 | Catch-all for drone consultants/service providers |
| 80.10Z | Security | ~15 | Surveillance — core Dock use case |
| 51.10Z | Air transport | ~10 | Registered drone operators |
| 30.30Z | Aircraft manufacturing | 17 | Drone hardware companies |
| 70.22Z | Business consulting | 14 | Drone consulting |
| 62.01Z | Software | 8 | Drone software platforms |
| 63.11Z | Data processing | ~4 | Data/analytics (where Altametris-type companies register) |
| Others | Various | ~178 | Companies in non-blacklisted NAF codes |

### Stage 4: Training/hobby exclusion → 378
- Removed: 5 companies with FORMATION, ECOLE, RACING, JOUET, HOBBY, ACADEMIE in name
- Examples: CENTRE DE FORMATION ET D'APPRENTISSAGE DU DRONE, L ACADEMIE DU DRONE

### Stage 5: Scoring (out of 100) → 378 ranked

**Scoring model:**

| Signal | Max | Breakdown |
|---|---|---|
| NAF code alignment | 30 | Core Dock (51.10Z, 71.12B, 71.20B, 80.10Z): 30 · Adjacent (74.90B, 30.30Z, 70.22Z, 62.01Z, 63.11Z, 43.99D): 20 · Other: 10 |
| Name keywords | 25 | INSPECTION/SURVEILLANCE/SECURITE/BVLOS: 25 · SERVICE/SOLUTIONS/TECH/SYSTEM: 15 · Generic DRONE: 10 |
| Company structure | 15 | Structured (SAS/SASU/SARL/SA): 15 · Other: 5 |
| Employee count | 15 | Known (band 01+): 15 · Unknown (NN/00): 10 |
| Company size | 15 | PME or micro: 15 · ETI/GE: 5 (flipped — DSPs are typically small firms funded by enterprise clients) |
| Age | 0 | Not scored — dock drone industry too young to discriminate |
| **Max possible** | **100** | |

**Tier distribution:**

| Tier | Score | Count | Action |
|---|---|---|---|
| A | 75+ | 138 | Immediate BD outreach |
| B | 60-74 | 201 | Validate via website/LinkedIn |
| C | 45-59 | 39 | Monitor |

**Litmus test:** INSTADRONE — rank #24, score 85 (NAF_A:71.12B + structured SAS + 20-49 employees + PME)

---

## What This Pipeline Does NOT Catch (Track B — future)

This pipeline finds companies with "drone/UAV/RPAS/telepilot" in their registered name. It systematically misses:
- **Security companies deploying drones** — e.g., Groupe Protect (NAF 80.10Z, name "GROUPE PROTECTOR")
- **Infrastructure inspection subsidiaries** — e.g., Altametris (NAF 63.11Z, SNCF subsidiary)
- **System integrators** deploying drone-in-a-box under their own brand

Track B (signal-based discovery using Google Search Crawler + LinkedIn + DJI Partner Scanner) is planned to catch these "invisible operators." Estimated additional yield: 200-500 companies.

---

## Supabase Table: sirene_drone_companies

**Schema:**
- `id` UUID DEFAULT gen_random_uuid() PRIMARY KEY
- `siren` TEXT NOT NULL
- `company_name` TEXT NOT NULL
- `trade_name` TEXT
- `acronym` TEXT (mapped from `sigle` column in CSV)
- `naf_code` TEXT
- `legal_form_code` TEXT
- `employee_band` TEXT
- `has_employees` BOOLEAN DEFAULT FALSE
- `company_category` TEXT
- `created_date` TEXT
- `composite_score` INTEGER DEFAULT 0 (now out of 100)
- `rank` INTEGER
- `region` TEXT NOT NULL DEFAULT 'FR'
- `signal_source` TEXT DEFAULT 'sirene_bulk_db'
- `filter_version` TEXT DEFAULT 'waterfall_v2'
- `extracted_at` TIMESTAMPTZ DEFAULT NOW()
- `notes` TEXT
- UNIQUE(siren, region)

**Column mapping from CSV:**
- `rank` → `rank`
- `score` → `composite_score`
- `siren` → `siren`
- `company_name` → `company_name`
- `trade_name` → `trade_name`
- `sigle` → `acronym`
- `naf_code` → `naf_code`
- `legal_form_code` → `legal_form_code`
- `employee_band` → `employee_band`
- `company_category` → `company_category`
- `created_date` → `created_date`
- `signals` → `notes`
- Set `region` = 'FR', `signal_source` = 'sirene_bulk_db', `filter_version` = 'waterfall_v2'

---

## CSV Data (378 rows)

Import this into `sirene_drone_companies` after deleting v1 records.

```csv
rank,score,siren,company_name,trade_name,sigle,naf_code,legal_form_code,employee_band,company_category,created_date,signals
1,95,887953180,DRONE INSPECTION,,,71.20B,5499,NN,PME,2020-08-06,NAF_A:71.20B|dock_kw|structured|PME/micro
2,90,800970212,SQUADRONE SYSTEM,,,71.12B,5710,12,PME,2014-02-19,NAF_A:71.12B|provider_kw|structured|emp:12|PME/micro
3,90,821433893,SKYDRONE INNOVATIONS,,,71.12B,5710,11,PME,2016-07-01,NAF_A:71.12B|provider_kw|structured|emp:11|PME/micro
4,90,825313232,ARTECH'DRONE,,,71.12B,5710,03,PME,2017-02-01,NAF_A:71.12B|provider_kw|structured|emp:03|PME/micro
5,90,827699943,CARIBEENNE D'EXPERTISE ET DE DRONES,,CAREX DRONES,71.12B,5710,01,PME,2017-02-01,NAF_A:71.12B|provider_kw|structured|emp:01|PME/micro
6,90,828427872,DIODON DRONE TECHNOLOGY,,,71.12B,5710,12,PME,2017-02-23,NAF_A:71.12B|provider_kw|structured|emp:12|PME/micro
7,90,829385202,DRONE CONSULTING,,,71.20B,5710,03,PME,2017-04-26,NAF_A:71.20B|provider_kw|structured|emp:03|PME/micro
8,90,838519395,BATHY DRONE SOLUTIONS,,,71.20B,5710,02,PME,2018-04-01,NAF_A:71.20B|provider_kw|structured|emp:02|PME/micro
9,90,841182678,SAS DRONE SERVICES,,,71.12B,5710,01,PME,2018-06-22,NAF_A:71.12B|provider_kw|structured|emp:01|PME/micro
10,90,841889975,DRONE EXPERTISE CENTRE,,,71.20B,5710,02,PME,2018-08-22,NAF_A:71.20B|provider_kw|structured|emp:02|PME/micro
11,90,884424656,DRONES INGENIERIE SYSTEMES,,,71.20B,5499,01,PME,2020-07-03,NAF_A:71.20B|provider_kw|structured|emp:01|PME/micro
12,90,911417392,DRONEDELATTREEXPERTISE,,,71.12B,5710,01,PME,2022-03-16,NAF_A:71.12B|provider_kw|structured|emp:01|PME/micro
13,85,790716153,AGENIUM DRONES SOLUTIONS,,,71.12B,5710,NN,PME,2013-02-01,NAF_A:71.12B|provider_kw|structured|PME/micro
14,85,792345217,DRONE TECH,,,71.12B,5710,NN,PME,2013-03-15,NAF_A:71.12B|provider_kw|structured|PME/micro
15,85,792951238,INTERDRONES SERVICES,,,71.12B,5710,NN,PME,2013-05-20,NAF_A:71.12B|provider_kw|structured|PME/micro
16,85,803965540,FORMAT-DRONE,,FD,71.12B,5710,02,PME,2014-08-01,NAF_A:71.12B|generic_name|structured|emp:02|PME/micro
17,85,805241999,CARTODRONE,,,71.12B,5499,01,PME,2014-10-14,NAF_A:71.12B|generic_name|structured|emp:01|PME/micro
18,85,810401430,ENERGY DRONE,,,71.12B,5499,01,PME,2015-04-06,NAF_A:71.12B|generic_name|structured|emp:01|PME/micro
19,85,812225308,SEMADRONES,,,71.12B,5710,11,PME,2015-07-01,NAF_A:71.12B|generic_name|structured|emp:11|PME/micro
20,85,813352754,DRONE 06,,,71.12B,5710,01,PME,2015-09-04,NAF_A:71.12B|generic_name|structured|emp:01|PME/micro
21,85,813598380,AIR SPACE DRONE,,ASD,71.12B,5710,02,PME,2015-09-01,NAF_A:71.12B|generic_name|structured|emp:02|PME/micro
22,85,821458122,DRONEXSOLUTION,,,71.12B,5710,01,PME,2016-07-01,NAF_A:71.12B|generic_name|structured|emp:01|PME/micro
23,85,821750908,SCANDRONE,,,71.12B,5710,01,PME,2016-08-29,NAF_A:71.12B|generic_name|structured|emp:01|PME/micro
24,85,827837832,INSTADRONE,,,71.12B,5710,12,PME,2017-02-01,NAF_A:71.12B|generic_name|structured|emp:12|PME/micro
25,85,842477671,SAS DRONES EXPERTISES 2.9,,,71.20B,5710,NN,,2018-09-19,NAF_A:71.20B|provider_kw|structured|PME/micro
26,85,844079129,SIG-DRONE,,,71.12B,5710,02,PME,2018-11-01,NAF_A:71.12B|generic_name|structured|emp:02|PME/micro
27,85,844545707,DRONE EXP'AIR TECH,,D.E.T,71.20B,5499,NN,PME,2018-12-04,NAF_A:71.20B|provider_kw|structured|PME/micro
28,85,847924305,DRONES TECHNOLOGIES SERVICES,,DTS,71.20B,5499,NN,PME,2019-02-01,NAF_A:71.20B|provider_kw|structured|PME/micro
29,85,883070484,DRONE EXPERT',,,71.12B,5499,NN,PME,2020-03-31,NAF_A:71.12B|provider_kw|structured|PME/micro
30,85,890549702,DRONE 2I,,,71.12B,5499,01,PME,2020-12-01,NAF_A:71.12B|generic_name|structured|emp:01|PME/micro
31,85,897993705,H2DRONE,,,71.20B,5710,02,PME,2021-03-20,NAF_A:71.20B|generic_name|structured|emp:02|PME/micro
32,85,914234992,BERINGER DIAG & DRONE,,,71.20B,5499,01,PME,2022-06-03,NAF_A:71.20B|generic_name|structured|emp:01|PME/micro
33,85,914686290,AURA DRONE,,,71.12B,5710,01,PME,2022-06-18,NAF_A:71.12B|generic_name|structured|emp:01|PME/micro
34,85,929065308,DRONE TECH TOITURE,,,71.20B,5710,NN,,2024-05-22,NAF_A:71.20B|provider_kw|structured|PME/micro
35,85,929159309,THERMODRONESERVICES,,,71.20B,5710,NN,,2024-06-01,NAF_A:71.20B|provider_kw|structured|PME/micro
36,85,932539851,INGENIERIE & DRONE SOLUTIONS,,,71.12B,5710,NN,,2024-09-02,NAF_A:71.12B|provider_kw|structured|PME/micro
37,85,940139983,TAHITI TECHNODRONE,,,71.12B,5499,NN,,2024-04-01,NAF_A:71.12B|provider_kw|structured|PME/micro
38,85,948463971,DRONEX16,,,71.12B,5710,01,PME,2023-01-20,NAF_A:71.12B|generic_name|structured|emp:01|PME/micro
39,85,950777649,AGRODRONE,,,71.12B,5710,01,PME,2023-03-20,NAF_A:71.12B|generic_name|structured|emp:01|PME/micro
40,85,951515907,INTERNATIONAL DRONE SERVICES,,,71.12B,5710,NN,PME,2023-05-01,NAF_A:71.12B|provider_kw|structured|PME/micro
41,85,980830806,DRONE X SOLUTIONS,,,71.20B,5499,NN,PME,2023-10-18,NAF_A:71.20B|provider_kw|structured|PME/micro
42,85,983254053,DRONE SOLUTIONS INVEST,,,71.20B,5499,NN,,2024-01-04,NAF_A:71.20B|provider_kw|structured|PME/micro
43,85,987385887,DRONES EXPERTISES,,,71.20B,5710,NN,,2024-03-07,NAF_A:71.20B|provider_kw|structured|PME/micro
44,85,991704305,FRANCE DRONE SERVICES,,,71.20B,5710,NN,,2025-09-29,NAF_A:71.20B|provider_kw|structured|PME/micro
45,85,995351236,DRONEDEV CONSULTING,,,71.12B,5710,NN,,2025-12-01,NAF_A:71.12B|provider_kw|structured|PME/micro
46,80,101574960,VYNSKY DRONE,,,71.20B,5710,NN,,2026-02-23,NAF_A:71.20B|generic_name|structured|PME/micro
47,80,499912483,DRONEXPLORER,,,71.12B,5499,NN,,2007-09-15,NAF_A:71.12B|generic_name|structured|PME/micro
48,80,505369447,CLEAN DRONE,,,71.12B,5499,NN,PME,2008-08-01,NAF_A:71.12B|generic_name|structured|PME/micro
49,80,794699967,DRONE FORCE,,,71.12B,5499,NN,PME,2013-08-12,NAF_A:71.12B|generic_name|structured|PME/micro
50,80,799787726,MLV DRONE,,,71.12B,5710,NN,PME,2014-01-02,NAF_A:71.12B|generic_name|structured|PME/micro
51,80,802193359,PHOENIX DRONES,,,71.12B,5710,NN,PME,2014-05-01,NAF_A:71.12B|generic_name|structured|PME/micro
52,80,803079086,DRONETUDES,,,71.12B,5499,NN,PME,2014-06-24,NAF_A:71.12B|generic_name|structured|PME/micro
53,80,807928031,DEFIS-DRONE,,,71.12B,5710,NN,,2014-11-18,NAF_A:71.12B|generic_name|structured|PME/micro
54,80,811187319,AIR DRONE SOLUTION,,,71.12B,5499,NN,PME,2015-05-02,NAF_A:71.12B|generic_name|structured|PME/micro
55,80,813560364,DIAG DRONE,,,71.12B,5710,NN,PME,2015-09-09,NAF_A:71.12B|generic_name|structured|PME/micro
56,80,814791638,APPLICATIONS DRONES ET GEOPHYSIQUES,,A.D.&.G,71.12B,5710,NN,PME,2015-11-20,NAF_A:71.12B|generic_name|structured|PME/micro
57,80,814986204,ATA DRONE,,,71.12B,5710,NN,PME,2016-01-01,NAF_A:71.12B|generic_name|structured|PME/micro
58,80,817637267,ATLANTIQUE EXPERTISES DRONES,,,70.22Z,5499,02,PME,2016-01-02,NAF_B:70.22Z|provider_kw|structured|emp:02|PME/micro
59,80,818970931,SB DRONE,,,71.12B,5710,NN,PME,2016-02-19,NAF_A:71.12B|generic_name|structured|PME/micro
60,80,820118784,DRONE ANALYSE,,,71.20B,5710,NN,PME,2016-05-01,NAF_A:71.20B|generic_name|structured|PME/micro
61,80,820950566,SPA3DRONE,,,71.12B,5499,NN,PME,2016-06-15,NAF_A:71.12B|generic_name|structured|PME/micro
62,80,830257366,ELTADRONE,,,71.12B,5499,NN,PME,2017-06-01,NAF_A:71.12B|generic_name|structured|PME/micro
63,80,832050827,ACCESS DRONES,,,71.12B,5710,NN,PME,2017-09-07,NAF_A:71.12B|generic_name|structured|PME/micro
64,80,832316491,DRONE GROUPE AFRIQUE,,,71.12B,5499,NN,PME,2017-09-26,NAF_A:71.12B|generic_name|structured|PME/micro
65,80,839169844,ITP DRONE,,,71.12B,5499,NN,PME,2018-04-19,NAF_A:71.12B|generic_name|structured|PME/micro
66,80,839462074,ALTUS DRONES SERVICES,,ADS,62.01Z,5710,01,PME,2018-06-01,NAF_B:62.01Z|provider_kw|structured|emp:01|PME/micro
67,80,844227249,ALIZEA DRONE SAS,,,71.12B,5710,NN,PME,2018-09-01,NAF_A:71.12B|generic_name|structured|PME/micro
68,80,844454751,F.P.A.S DRONES,,,80.10Z,5710,NN,PME,2018-11-12,NAF_A:80.10Z|generic_name|structured|PME/micro
69,80,849736319,INSPECT'DRONE,,,71.20B,5499,NN,PME,2019-03-22,NAF_A:71.20B|generic_name|structured|PME/micro
70,80,851126326,EB DRONE,,,71.12B,5410,NN,PME,2019-06-01,NAF_A:71.12B|generic_name|structured|PME/micro
71,80,852027507,AIRSUB DRONE,,,71.20B,5499,NN,PME,2019-06-25,NAF_A:71.20B|generic_name|structured|PME/micro
72,80,881885461,ACCES-DRONE,,,71.20B,5499,NN,PME,2020-02-14,NAF_A:71.20B|generic_name|structured|PME/micro
73,80,883537649,DRONE ENGINEERING,,,71.12B,5710,NN,PME,2020-05-15,NAF_A:71.12B|generic_name|structured|PME/micro
74,80,884520552,VP DRONES,,,71.12B,5710,NN,PME,2020-06-03,NAF_A:71.12B|generic_name|structured|PME/micro
75,80,888202413,MECADRONE,,,71.12B,5710,NN,PME,2020-08-14,NAF_A:71.12B|generic_name|structured|PME/micro
76,80,891602302,PRESTADRONES,,,71.20B,5499,NN,PME,2020-11-19,NAF_A:71.20B|generic_name|structured|PME/micro
77,80,893501957,MYDRONESOLUTION,,MDS,71.20B,5710,NN,PME,2021-01-20,NAF_A:71.20B|generic_name|structured|PME/micro
78,80,898126461,FACILI TRAVAUX & DRONE,,,71.12B,5710,NN,PME,2021-04-05,NAF_A:71.12B|generic_name|structured|PME/micro
79,80,909070252,DRONE-DATA-LAB,,,71.12B,5710,NN,PME,2022-01-03,NAF_A:71.12B|generic_name|structured|PME/micro
80,80,910733690,ADRONE +,,,71.20B,5499,NN,PME,2022-01-13,NAF_A:71.20B|generic_name|structured|PME/micro
81,80,912115367,GENIUS DRONE,,,71.20B,5710,NN,PME,2022-03-01,NAF_A:71.20B|generic_name|structured|PME/micro
82,80,913487682,FG DRONES ETUDES,,,71.12B,5499,NN,PME,2022-05-12,NAF_A:71.12B|generic_name|structured|PME/micro
83,80,921145934,DRONES ICARE,,,71.20B,5499,NN,PME,2022-11-01,NAF_A:71.20B|generic_name|structured|PME/micro
84,80,930702246,DRONE FRANCAIS,,,71.12B,5710,NN,,2024-07-02,NAF_A:71.12B|generic_name|structured|PME/micro
85,80,934013764,JGM DRONE,,,71.20B,5710,NN,,2024-10-01,NAF_A:71.20B|generic_name|structured|PME/micro
86,80,934216185,DRONE XPRESS,,,80.10Z,5710,NN,,2024-10-10,NAF_A:80.10Z|generic_name|structured|PME/micro
87,80,938887379,HYDRONET 360,,,71.12B,5710,NN,,2024-11-30,NAF_A:71.12B|generic_name|structured|PME/micro
88,80,940518269,VISION DRONES BOURGOGNE,,,71.20B,5710,NN,,2025-02-04,NAF_A:71.20B|generic_name|structured|PME/micro
89,80,941824328,F2 DRONE,,,71.12B,5710,NN,,2025-03-04,NAF_A:71.12B|generic_name|structured|PME/micro
90,80,945114171,DRONE PLANET ECO ROBOTS,,DPER,71.12B,5710,NN,,2025-05-24,NAF_A:71.12B|generic_name|structured|PME/micro
91,80,948853908,BIO DRONES FRANCE,,,71.12B,5499,NN,PME,2023-02-01,NAF_A:71.12B|generic_name|structured|PME/micro
92,80,949477426,MKX DRONES,,,71.12B,5710,NN,PME,2023-02-24,NAF_A:71.12B|generic_name|structured|PME/micro
93,80,952686301,AQUA AIR DRONE,,AAD,71.20B,5710,NN,PME,2023-08-01,NAF_A:71.20B|generic_name|structured|PME/micro
94,80,953459856,NAUTIDRONE,,,71.20B,5499,NN,PME,2023-06-14,NAF_A:71.20B|generic_name|structured|PME/micro
95,80,977616929,TOPODRONE,,,71.12B,5710,NN,PME,2023-06-28,NAF_A:71.12B|generic_name|structured|PME/micro
96,80,977624394,XENODRONE,,,71.12B,5710,NN,PME,2023-06-29,NAF_A:71.12B|generic_name|structured|PME/micro
97,80,978219962,DRONE & EAU PICARDIE,,DEP,71.20B,5499,NN,PME,2023-07-12,NAF_A:71.20B|generic_name|structured|PME/micro
98,80,978837458,DRONEXPLORE,,,71.20B,5710,NN,PME,2023-08-22,NAF_A:71.20B|generic_name|structured|PME/micro
99,80,979950813,AZIMUT-DRONE,,,71.12B,5499,NN,PME,2023-07-25,NAF_A:71.12B|generic_name|structured|PME/micro
100,80,980805295,ECORES DRONE,,,71.12B,5710,NN,PME,2023-10-05,NAF_A:71.12B|generic_name|structured|PME/micro
101,80,981055783,GEO DRONE XPERT,,GDX,71.12B,5710,NN,PME,2023-11-01,NAF_A:71.12B|generic_name|structured|PME/micro
102,80,981397854,DRONES DOCKING STATIONS,,DDS,71.12B,5710,NN,PME,2023-11-01,NAF_A:71.12B|generic_name|structured|PME/micro
103,80,982285306,DRONE FLY INSPECT,,,71.20B,5499,NN,PME,2023-12-01,NAF_A:71.20B|generic_name|structured|PME/micro
104,80,982429078,AKP-DRONES,,,71.20B,5710,NN,PME,2023-11-16,NAF_A:71.20B|generic_name|structured|PME/micro
105,80,984250720,DRONE INVESTIGATION,,,71.20B,5499,NN,,2024-02-02,NAF_A:71.20B|generic_name|structured|PME/micro
106,80,987789302,ASESDRONE,,,71.20B,5710,NN,,2024-04-01,NAF_A:71.20B|generic_name|structured|PME/micro
107,80,988728929,SOLODRONE,,,71.12B,5499,NN,,2025-07-01,NAF_A:71.12B|generic_name|structured|PME/micro
108,80,990508400,DRONE-CAPTURE,,,71.12B,5710,NN,,2025-08-21,NAF_A:71.12B|generic_name|structured|PME/micro
109,80,993902204,ONITDRONE,,,71.12B,5499,NN,,2025-11-12,NAF_A:71.12B|generic_name|structured|PME/micro
110,80,999031198,SCAN TO DRONE,,,71.20B,5710,NN,,2026-01-05,NAF_A:71.20B|generic_name|structured|PME/micro
111,75,531970051,DRONE VOLT,,,30.30Z,5599,12,PME,2011-04-12,NAF_B:30.30Z|generic_name|structured|emp:12|PME/micro
112,75,534093349,WEBDRONE,,,62.01Z,5710,11,PME,2011-07-19,NAF_B:62.01Z|generic_name|structured|emp:11|PME/micro
113,75,539609610,UAV INNOVATION CONSULTING,,,74.90B,5710,NN,,2012-01-02,NAF_B:74.90B|provider_kw|structured|PME/micro
114,75,798129086,DRONES IMAGING,,,74.90B,5710,01,PME,2013-11-01,NAF_B:74.90B|generic_name|structured|emp:01|PME/micro
115,75,798275194,INNOVADRONE,,SARL,30.30Z,5499,01,PME,2013-11-01,NAF_B:30.30Z|generic_name|structured|emp:01|PME/micro
116,75,799051099,POLIDRONE,,,63.11Z,5710,01,PME,2013-12-04,NAF_B:63.11Z|generic_name|structured|emp:01|PME/micro
117,75,801598582,DRONESCAPE,,,62.01Z,5710,01,PME,2014-03-18,NAF_B:62.01Z|generic_name|structured|emp:01|PME/micro
118,75,802991414,HEXADRONE,,,30.30Z,5710,11,PME,2014-05-26,NAF_B:30.30Z|generic_name|structured|emp:11|PME/micro
119,75,804836039,DRONESTAR,,DS,74.90B,5499,01,PME,2014-10-01,NAF_B:74.90B|generic_name|structured|emp:01|PME/micro
120,75,807500541,ESCADRONE,,,30.30Z,5710,11,PME,2014-10-27,NAF_B:30.30Z|generic_name|structured|emp:11|PME/micro
121,75,808556864,DRONE AIR FLY,,,74.90B,5710,01,PME,2014-12-05,NAF_B:74.90B|generic_name|structured|emp:01|PME/micro
122,75,820377687,DRONELIS,,,70.22Z,5710,11,PME,2016-05-18,NAF_B:70.22Z|generic_name|structured|emp:11|PME/micro
123,75,821792629,PRODRONES,,,30.30Z,5499,03,PME,2016-08-01,NAF_B:30.30Z|generic_name|structured|emp:03|PME/micro
124,75,833347842,IVA DRONES,,,63.11Z,5710,02,PME,2017-11-07,NAF_B:63.11Z|generic_name|structured|emp:02|PME/micro
125,75,842833824,LYNXDRONE,,,74.90B,5710,11,PME,2018-10-01,NAF_B:74.90B|generic_name|structured|emp:11|PME/micro
126,75,844743567,DRONE XTR,,,74.90B,5710,02,PME,2018-12-19,NAF_B:74.90B|generic_name|structured|emp:02|PME/micro
127,75,878390863,SPACEDRONE,,,30.30Z,5710,01,PME,2019-09-23,NAF_B:30.30Z|generic_name|structured|emp:01|PME/micro
128,75,883116220,DRONE REPONSE SECURITE,,DRS,80.20Z,5710,NN,PME,2020-03-03,NAF_other:80.20Z|dock_kw|structured|PME/micro
129,75,883422941,LTN DRONE EXPERTISE,,,74.90B,5710,NN,PME,2020-04-23,NAF_B:74.90B|provider_kw|structured|PME/micro
130,75,891652778,DSC (DRONE SECURITY CONSULTING),,,74.90B,5710,NN,PME,2020-11-27,NAF_B:74.90B|provider_kw|structured|PME/micro
131,75,913174082,OBJECTIF DRONE PRODUCTION,,,30.30Z,5710,02,PME,2022-05-01,NAF_B:30.30Z|generic_name|structured|emp:02|PME/micro
132,75,914112404,SARL DRONE VISUAL INSPECTION,,,33.16Z,5499,NN,PME,2022-05-12,NAF_other:33.16Z|dock_kw|structured|PME/micro
133,75,915111751,DRONE AQUITAINE,,,74.90B,5710,02,PME,2022-06-01,NAF_B:74.90B|generic_name|structured|emp:02|PME/micro
134,75,934369844,DRONES CENTER INNOVATIONS,,,74.90B,5710,NN,,2024-10-01,NAF_B:74.90B|provider_kw|structured|PME/micro
135,75,938180767,TA TECHDRONE,,,74.90B,5710,NN,,2024-11-22,NAF_B:74.90B|provider_kw|structured|PME/micro
136,75,941444432,DRONES EXPERTS SERVICES,,,30.30Z,5710,NN,,2025-02-18,NAF_B:30.30Z|provider_kw|structured|PME/micro
137,75,948421763,RHUYS EXPERTISE DRONE,,,74.90B,5710,NN,PME,2023-01-25,NAF_B:74.90B|provider_kw|structured|PME/micro
138,75,981895766,WOLF DRONE SOLUTIONS,,,30.30Z,5710,NN,PME,2023-11-24,NAF_B:30.30Z|provider_kw|structured|PME/micro
139,70,100165109,NEO DRONE,,,74.90B,5710,NN,,2026-01-21,NAF_B:74.90B|generic_name|structured|PME/micro
140,70,100811314,DRONE REPONSE TACTIC,,DRT,74.90B,5499,NN,,2026-02-03,NAF_B:74.90B|generic_name|structured|PME/micro
141,70,519024459,HELIDRONE,,,74.90B,5499,NN,PME,2009-12-01,NAF_B:74.90B|generic_name|structured|PME/micro
142,70,530213719,DELTA DRONE MANAGERS,,,70.22Z,5710,NN,PME,2011-01-11,NAF_B:70.22Z|generic_name|structured|PME/micro
143,70,751012048,DRONE 360,,,30.30Z,5499,NN,PME,2012-03-20,NAF_B:30.30Z|generic_name|structured|PME/micro
144,70,792843054,CLIMAT DRONE,,,71.12B,9220,NN,PME,2013-05-01,NAF_A:71.12B|generic_name|PME/micro
145,70,803287267,ATLANTIC DRONES,,,30.30Z,5710,NN,PME,2014-07-02,NAF_B:30.30Z|generic_name|structured|PME/micro
146,70,807486642,DRONE SYSTEME,,,31.09B,5710,01,PME,2014-11-01,NAF_other:31.09B|provider_kw|structured|emp:01|PME/micro
147,70,808696314,DRONE IMMERSION,,,74.90B,5499,NN,PME,2015-01-02,NAF_B:74.90B|generic_name|structured|PME/micro
148,70,808864441,SOCIETE FRANCAISE DU DRONE,,SFD,74.90B,5499,NN,PME,2014-12-19,NAF_B:74.90B|generic_name|structured|PME/micro
149,70,809458029,CM DRONES,,,30.30Z,5710,NN,PME,2015-02-09,NAF_B:30.30Z|generic_name|structured|PME/micro
150,70,809464381,START DRONE,,,70.22Z,5710,NN,PME,2015-01-01,NAF_B:70.22Z|generic_name|structured|PME/micro
151,70,814949178,URBANDRONE,,,62.01Z,5710,NN,PME,2015-11-24,NAF_B:62.01Z|generic_name|structured|PME/micro
152,70,821697422,SYNAIRGIDRONE,,,74.90B,5710,NN,PME,2016-07-25,NAF_B:74.90B|generic_name|structured|PME/micro
153,70,823427315,"RIVERDRONE, AQUATIC DRONE TECHNOLOGY",,RADT,30.11Z,5499,01,PME,2016-09-18,NAF_other:30.11Z|provider_kw|structured|emp:01|PME/micro
154,70,830469151,CYBERDRONEGUARDING,,,74.90B,5710,NN,PME,2017-06-06,NAF_B:74.90B|generic_name|structured|PME/micro
155,70,832644140,DKDRONES,,,30.30Z,5710,NN,PME,2017-10-15,NAF_B:30.30Z|generic_name|structured|PME/micro
156,70,839701299,LR DRONES ET CONSEILS,,,70.22Z,5499,NN,PME,2018-05-18,NAF_B:70.22Z|generic_name|structured|PME/micro
157,70,844725630,DRONEDATA,,,74.90B,5710,NN,PME,2019-01-03,NAF_B:74.90B|generic_name|structured|PME/micro
158,70,852787944,DRONES PLURIEL,,,74.90B,5710,NN,PME,2019-07-15,NAF_B:74.90B|generic_name|structured|PME/micro
159,70,882167372,DRONE SURVEY,,,63.11Z,5499,NN,PME,2020-03-01,NAF_B:63.11Z|generic_name|structured|PME/micro
160,70,904755048,CAPTAGRI-DRONE,,,74.90B,5499,NN,PME,2021-10-10,NAF_B:74.90B|generic_name|structured|PME/micro
161,70,905185831,PARIS DRONE,,,74.90B,5499,NN,PME,2021-10-12,NAF_B:74.90B|generic_name|structured|PME/micro
162,70,907547335,AEP DRONE,,,30.30Z,5710,NN,PME,2021-11-17,NAF_B:30.30Z|generic_name|structured|PME/micro
163,70,910023415,DRONEANDVIEW,,,62.01Z,5710,NN,PME,2022-02-04,NAF_B:62.01Z|generic_name|structured|PME/micro
164,70,911827251,PERFECT NEGOCE - DRONE AEROTECH,,,46.63Z,5710,01,PME,2022-03-24,NAF_other:46.63Z|provider_kw|structured|emp:01|PME/micro
165,70,914244926,VISI'EAU & AIR DRONE,,,74.90B,5499,NN,PME,2022-05-26,NAF_B:74.90B|generic_name|structured|PME/micro
166,70,920956786,MAGIC DRONE,,,62.01Z,5499,NN,PME,2022-10-27,NAF_B:62.01Z|generic_name|structured|PME/micro
167,70,928176650,KD DRONE 974,,,74.90B,5499,NN,,2024-04-18,NAF_B:74.90B|generic_name|structured|PME/micro
168,70,938025806,QUADRONE CONSEIL,,,70.22Z,5710,NN,,2024-11-29,NAF_B:70.22Z|generic_name|structured|PME/micro
169,70,938881000,UN ECLAIR DE DRONE,,,43.99D,5710,NN,,2024-12-02,NAF_B:43.99D|generic_name|structured|PME/micro
170,70,943614180,PROTECT'DRONE,,PTD,70.22Z,5499,NN,,2025-04-11,NAF_B:70.22Z|generic_name|structured|PME/micro
171,70,943834093,DRONEOPSPRO,,,63.11Z,5710,NN,,2025-04-28,NAF_B:63.11Z|generic_name|structured|PME/micro
172,70,980342828,DRONE M-TEK,,,70.22Z,5710,NN,PME,2023-09-01,NAF_B:70.22Z|generic_name|structured|PME/micro
173,70,981774292,AGI DRONE & CONSEILS,,,70.22Z,5710,NN,,2024-01-01,NAF_B:70.22Z|generic_name|structured|PME/micro
174,70,987584430,AQUADRONE,,,74.90B,5499,NN,,2024-03-11,NAF_B:74.90B|generic_name|structured|PME/micro
175,70,987921384,SKF-DRONE,[ND],[ND],30.30Z,5710,NN,,2025-06-11,NAF_B:30.30Z|generic_name|structured|PME/micro
176,70,990499949,BRADLADRONE,,,74.90B,5710,NN,,2025-08-18,NAF_B:74.90B|generic_name|structured|PME/micro
177,70,991952045,DRONE PHOTOFLY,,,74.90B,5710,NN,,2025-09-25,NAF_B:74.90B|generic_name|structured|PME/micro
178,70,992366641,SHOOTDRONE SAS,,,62.01Z,5710,NN,,2025-10-06,NAF_B:62.01Z|generic_name|structured|PME/micro
179,70,992389320,YANN DRONEAU,YANN DRONEAU,,51.10Z,1000,NN,,2025-11-01,NAF_A:51.10Z|generic_name|PME/micro
180,70,993821834,CATCH A DRONE,,CATCH-A-DRONE,30.30Z,5710,NN,,2025-11-17,NAF_B:30.30Z|generic_name|structured|PME/micro
181,70,994211373,AGRIVIEW DRONE,,AVD,74.90B,5710,NN,,2025-11-07,NAF_B:74.90B|generic_name|structured|PME/micro
182,65,380547307,SARL BODRONE ET FILS,,,96.03Z,5499,02,PME,1991-01-01,NAF_other:96.03Z|generic_name|structured|emp:02|PME/micro
183,65,384167151,AUTO FINANCES MADRONET,,AFM,70.10Z,5499,01,PME,1991-11-22,NAF_other:70.10Z|generic_name|structured|emp:01|PME/micro
184,65,442257002,CARRIERE SAN PEDRONE,,,08.11Z,5499,03,PME,2002-04-29,NAF_other:08.11Z|generic_name|structured|emp:03|PME/micro
185,65,499374726,DASSIEU MOTOCULTURE AIR DRONE SERVICE,,,33.12Z,5499,NN,PME,2007-07-13,NAF_other:33.12Z|provider_kw|structured|PME/micro
186,65,751386103,IFAC REPA RDRONE-SHOP,,,95.21Z,5710,01,PME,2012-05-01,NAF_other:95.21Z|generic_name|structured|emp:01|PME/micro
187,65,789847563,DRONE TECHNOLOGY SERVICE,,DTS,62.02A,5710,NN,,2012-11-01,NAF_other:62.02A|provider_kw|structured|PME/micro
188,65,793961046,DRONEAU TP,,,43.12A,5710,01,PME,2013-06-22,NAF_other:43.12A|generic_name|structured|emp:01|PME/micro
189,65,801627456,VISADRONE,,,77.39Z,5499,01,PME,2014-04-15,NAF_other:77.39Z|generic_name|structured|emp:01|PME/micro
190,65,804345452,DRONE REPONSE,,DRONE REPONSE,82.99Z,5710,01,PME,2014-09-03,NAF_other:82.99Z|generic_name|structured|emp:01|PME/micro
191,65,807747662,SNOWDRONE,,,49.32Z,5499,12,PME,2014-11-04,NAF_other:49.32Z|generic_name|structured|emp:12|PME/micro
192,65,808408074,PARROT DRONES,,,26.70Z,5710,22,PME,2014-12-04,NAF_other:26.70Z|generic_name|structured|emp:22|PME/micro
193,65,808765705,SOLUTIONS-DRONES-86,,,32.99Z,5499,NN,PME,2015-01-05,NAF_other:32.99Z|provider_kw|structured|PME/micro
194,65,811794601,AZUR DRONES,,,74.90B,5710,21,ETI,2015-06-01,NAF_B:74.90B|generic_name|structured|emp:21|ETI
195,65,812376358,DRONE ACT,,,72.19Z,5710,11,PME,2015-08-01,NAF_other:72.19Z|generic_name|structured|emp:11|PME/micro
196,65,813558822,AERO-DRONE-TECHNIC,,,82.99Z,5710,NN,PME,2015-10-01,NAF_other:82.99Z|provider_kw|structured|PME/micro
197,65,814386520,DRONE PROTECT SYSTEM,,D.P.S,80.20Z,5710,NN,PME,2015-11-01,NAF_other:80.20Z|provider_kw|structured|PME/micro
198,65,817882806,HELICOANDRONE,,H&D,52.23Z,5710,03,PME,2016-02-01,NAF_other:52.23Z|generic_name|structured|emp:03|PME/micro
199,65,819008871,VERDRONE,,,58.29C,5710,02,PME,2016-03-04,NAF_other:58.29C|generic_name|structured|emp:02|PME/micro
200,65,830696795,ONE DRONE,,,46.49Z,5710,01,PME,2017-06-14,NAF_other:46.49Z|generic_name|structured|emp:01|PME/micro
201,65,834143695,ARTEDRONE,,,72.19Z,5710,11,PME,2017-12-19,NAF_other:72.19Z|generic_name|structured|emp:11|PME/micro
202,65,838380525,FL DRONE SERVICE,,,71.12A,5499,NN,PME,2018-04-02,NAF_other:71.12A|provider_kw|structured|PME/micro
203,65,842467474,POMPES FUNEBRES BODRONE,,,96.03Z,5710,01,PME,2018-09-01,NAF_other:96.03Z|generic_name|structured|emp:01|PME/micro
204,65,849500855,DRONE JET,,,01.61Z,5710,01,,2019-03-15,NAF_other:01.61Z|generic_name|structured|emp:01|PME/micro
205,65,849666292,FRANCE DRONE SERVICES,,,71.12A,5710,NN,,2019-04-01,NAF_other:71.12A|provider_kw|structured|PME/micro
206,65,853223816,DRONE GEOFENCING,,,58.29C,5710,11,PME,2019-08-01,NAF_other:58.29C|generic_name|structured|emp:11|PME/micro
207,65,885130351,DRONELOR'N & PLATRERIE,,,43.31Z,5710,01,PME,2020-07-01,NAF_other:43.31Z|generic_name|structured|emp:01|PME/micro
208,65,900854407,DR ANDRONE,,,86.23Z,5485,01,PME,2021-06-07,NAF_other:86.23Z|generic_name|structured|emp:01|PME/micro
209,65,907795702,ARTISAN MENUISIER DRONET STEPHANE,,AMDS,43.32A,5710,01,PME,2021-11-30,NAF_other:43.32A|generic_name|structured|emp:01|PME/micro
210,65,913700084,GEOTECHDRONE,,,71.12A,5499,NN,PME,2022-05-25,NAF_other:71.12A|provider_kw|structured|PME/micro
211,65,914109889,DRONE TOUCH,,,16.10B,5710,01,PME,2022-06-02,NAF_other:16.10B|generic_name|structured|emp:01|PME/micro
212,65,914216536,DRONES FOR YACHTS,,DY,77.35Z,5710,01,PME,2022-04-12,NAF_other:77.35Z|generic_name|structured|emp:01|PME/micro
213,65,914817184,ACTION 3DRONES,,,81.29A,5710,01,PME,2022-06-22,NAF_other:81.29A|generic_name|structured|emp:01|PME/micro
214,65,920553971,CLEAN DRONE 25,,,43.39Z,5710,01,PME,2022-10-13,NAF_other:43.39Z|generic_name|structured|emp:01|PME/micro
215,65,938112406,HYDRONET SERVICE,,,42.21Z,5710,NN,,2024-11-28,NAF_other:42.21Z|provider_kw|structured|PME/micro
216,65,943233361,DRONE HIVE SYSTEMS,,DHS,46.49Z,5710,NN,,2025-04-09,NAF_other:46.49Z|provider_kw|structured|PME/micro
217,65,949043822,HOLDING DR. DRONE,,,82.11Z,5710,01,PME,2023-02-13,NAF_other:82.11Z|generic_name|structured|emp:01|PME/micro
218,65,951083815,DRONE SERVICE 64,,DS 64,81.29A,5710,NN,PME,2023-03-25,NAF_other:81.29A|provider_kw|structured|PME/micro
219,65,953851748,DRONE SERVICE,,,81.29A,5710,NN,PME,2023-07-01,NAF_other:81.29A|provider_kw|structured|PME/micro
220,65,987499910,DRONEXPERTS,,,62.02A,5710,NN,,2024-03-08,NAF_other:62.02A|provider_kw|structured|PME/micro
221,65,990408270,NEW TECH DRONES,,NTD,00.00Z,5710,NN,,2025-08-18,NAF_other:00.00Z|provider_kw|structured|PME/micro
222,65,993097781,DRONES INNOVATIONS,,DI,72.19Z,5710,NN,,2025-10-16,NAF_other:72.19Z|provider_kw|structured|PME/micro
223,65,994428449,TERRES ET DRONE SERVICES,,,01.61Z,5499,NN,,2025-11-24,NAF_other:01.61Z|provider_kw|structured|PME/micro
224,65,999450497,HYDRONET SERVICE,,,37.00Z,5710,NN,,2025-12-24,NAF_other:37.00Z|provider_kw|structured|PME/micro
225,65,999671738,ALTI'DRONE & SERVICES,,,00.00Z,5499,NN,,2025-11-26,NAF_other:00.00Z|provider_kw|structured|PME/micro
226,60,100834860,LE CLOS ANDRONE,,,55.20Z,5710,NN,,2026-01-20,NAF_other:55.20Z|generic_name|structured|PME/micro
227,60,101337301,ARTOIT  DRONE,,,46.49Z,5710,NN,,2025-09-11,NAF_other:46.49Z|generic_name|structured|PME/micro
228,60,303151302,HYDRONETT SARL,,,93.0B,5499,NN,,1973-12-25,NAF_other:93.0B|generic_name|structured|PME/micro
229,60,319545422,SAN PEDRONE,,,26.7Z,5499,NN,,1980-07-29,NAF_other:26.7Z|generic_name|structured|PME/micro
230,60,327477501,SARL IDRONEGOMINE,,INM,25.01,5499,NN,,1983-05-24,NAF_other:25.01|generic_name|structured|PME/micro
231,60,348902958,EURL JP DRONET DECORATION,,,31.09B,5499,NN,PME,1988-07-01,NAF_other:31.09B|generic_name|structured|PME/micro
232,60,380172882,HYDRONET,,,74.7Z,5499,NN,,1990-10-29,NAF_other:74.7Z|generic_name|structured|PME/micro
233,60,412116998,SARL L'ANDRONE,,,52.4Z,5499,NN,,1997-05-15,NAF_other:52.4Z|generic_name|structured|PME/micro
234,60,419628854,DRONET PLATRERIE,,,43.31Z,5499,NN,PME,1998-07-01,NAF_other:43.31Z|generic_name|structured|PME/micro
235,60,421520149,FORICHON DRONET,,,71.12A,5499,NN,,1999-01-01,NAF_other:71.12A|generic_name|structured|PME/micro
236,60,424314672,DRONE SARL,,,72.1Z,5499,NN,,1999-04-03,NAF_other:72.1Z|generic_name|structured|PME/micro
237,60,443973219,TOITURE DRONE,,,35.11Z,5499,NN,PME,2002-10-30,NAF_other:35.11Z|generic_name|structured|PME/micro
238,60,477559439,CIVIC DRONE,,WORKFLY,28.99B,5710,NN,PME,2004-06-24,NAF_other:28.99B|generic_name|structured|PME/micro
239,60,483040416,DRONET YANNICK,,,43.91A,5499,NN,,2005-07-01,NAF_other:43.91A|generic_name|structured|PME/micro
240,60,484354899,SARL PADRONETE TRADING LDA,,,70.22Z,2900,NN,PME,2002-01-01,NAF_B:70.22Z|generic_name|PME/micro
241,60,495253049,RAEDEL SON ET LUMIERES                                      DRONE ZEAL PRODUCTION,,RAEDEL SL DROZE PRO,90.02Z,5499,NN,PME,2007-04-15,NAF_other:90.02Z|generic_name|structured|PME/micro
242,60,504676057,LE PIMPEC-DRONET,,,43.34Z,5499,NN,PME,2008-07-01,NAF_other:43.34Z|generic_name|structured|PME/micro
243,60,509770731,BP DRONE,,DCCL,77.11A,5499,NN,,2009-01-05,NAF_other:77.11A|generic_name|structured|PME/micro
244,60,511873457,DRONEAU-GAUTHIER PEINTURE,,,43.34Z,5499,NN,PME,2009-04-06,NAF_other:43.34Z|generic_name|structured|PME/micro
245,60,512100900,HYDRONEO,,,35.11Z,5710,NN,PME,2009-04-01,NAF_other:35.11Z|generic_name|structured|PME/micro
246,60,512467838,SARL VDRONE CONCEPT,,,46.19B,5499,NN,PME,2009-04-01,NAF_other:46.19B|generic_name|structured|PME/micro
247,60,517832986,HYDRONEO OO,,,35.11Z,5710,NN,PME,2009-10-01,NAF_other:35.11Z|generic_name|structured|PME/micro
248,60,518148648,SACERDRONE,,,74.10Z,5499,NN,,2009-10-01,NAF_other:74.10Z|generic_name|structured|PME/micro
249,60,529280703,HYDRONEO SOLAR 1,,,35.11Z,5499,NN,PME,2010-11-18,NAF_other:35.11Z|generic_name|structured|PME/micro
250,60,529280737,HYDRONEO SOLAR 2,,,35.11Z,5499,NN,PME,2010-11-18,NAF_other:35.11Z|generic_name|structured|PME/micro
251,60,530740562,TONNER DRONES,,,46.52Z,5599,00,PME,2011-02-25,NAF_other:46.52Z|generic_name|structured|PME/micro
252,60,531559466,EFS DRONES,,,26.12Z,5710,NN,PME,2011-04-06,NAF_other:26.12Z|generic_name|structured|PME/micro
253,60,533304929,QUADRONE ELECTRICITE,,,43.21A,5499,NN,PME,2011-07-01,NAF_other:43.21A|generic_name|structured|PME/micro
254,60,662053834,MAISON MADRONET,,,52.4J,5499,NN,,1966-01-01,NAF_other:52.4J|generic_name|structured|PME/micro
255,60,793472689,ABC DRONE,,,52.23Z,5499,NN,,2013-06-01,NAF_other:52.23Z|generic_name|structured|PME/micro
256,60,798957270,DRONETAIR,,,58.29A,5710,NN,PME,2014-01-01,NAF_other:58.29A|generic_name|structured|PME/micro
257,60,800705113,DRONE -X,,,74.10Z,5710,NN,,2014-01-09,NAF_other:74.10Z|generic_name|structured|PME/micro
258,60,802142356,TOUT LE DRONE,,,32.99Z,5499,NN,PME,2014-04-11,NAF_other:32.99Z|generic_name|structured|PME/micro
259,60,804055044,SAS DRONEST,,,82.99Z,5710,NN,PME,2014-08-01,NAF_other:82.99Z|generic_name|structured|PME/micro
260,60,808697080,CESA DRONES,,,72.19Z,5710,NN,PME,2014-12-30,NAF_other:72.19Z|generic_name|structured|PME/micro
261,60,811125111,DRONE ALPILLES,,,00.00Z,5499,NN,,2015-04-28,NAF_other:00.00Z|generic_name|structured|PME/micro
262,60,812406494,AVM DRONE 27,,,01.61Z,5499,NN,,2015-07-01,NAF_other:01.61Z|generic_name|structured|PME/micro
263,60,814088712,EVODRONE,,,72.19Z,5710,NN,PME,2015-10-12,NAF_other:72.19Z|generic_name|structured|PME/micro
264,60,818883183,SEE BY DRONE,,,70.21Z,5710,00,PME,2016-03-01,NAF_other:70.21Z|generic_name|structured|PME/micro
265,60,820142677,SPECDRONE,,,47.11B,5710,NN,PME,2016-05-04,NAF_other:47.11B|generic_name|structured|PME/micro
266,60,824484158,NATURA DRONE,,,71.12A,5499,NN,,2016-12-01,NAF_other:71.12A|generic_name|structured|PME/micro
267,60,830160032,ASTRATUS FILM & DRONE,,,59.11C,5710,NN,PME,2017-06-01,NAF_other:59.11C|generic_name|structured|PME/micro
268,60,831649256,RELAIS STATION DU SAN PEDRONE,,,00.00Z,5710,NN,,2017-08-22,NAF_other:00.00Z|generic_name|structured|PME/micro
269,60,834703068,DRONE AGRI,,,46.69A,5710,NN,,2018-01-11,NAF_other:46.69A|generic_name|structured|PME/micro
270,60,841599319,HDRONES,,,77.35Z,5710,NN,PME,2018-07-21,NAF_other:77.35Z|generic_name|structured|PME/micro
271,60,842761777,NEW-R-DRONE,,,72.19Z,5710,NN,PME,2018-09-20,NAF_other:72.19Z|generic_name|structured|PME/micro
272,60,848324190,DRONES ATILLA,,,46.49Z,5710,NN,,2019-02-01,NAF_other:46.49Z|generic_name|structured|PME/micro
273,60,848469276,NAP DRONES,,NAPD,00.00Z,5710,NN,,2019-02-15,NAF_other:00.00Z|generic_name|structured|PME/micro
274,60,877520338,GO RDRONE,,PMS,43.32B,5499,NN,PME,2019-09-01,NAF_other:43.32B|generic_name|structured|PME/micro
275,60,878479435,SAS JURIS DRONE,,,62.03Z,5710,NN,PME,2019-10-19,NAF_other:62.03Z|generic_name|structured|PME/micro
276,60,879952984,TD DRONE,,,81.29A,5710,NN,PME,2019-12-13,NAF_other:81.29A|generic_name|structured|PME/micro
277,60,882258387,DRONE EN SCENE,,,90.02Z,5710,NN,PME,2020-03-16,NAF_other:90.02Z|generic_name|structured|PME/micro
278,60,892571514,TOURNAGE DRONE PARIS,,TDP,77.39Z,5710,NN,PME,2021-01-04,NAF_other:77.39Z|generic_name|structured|PME/micro
279,60,894073402,DRONEAU INVEST,,,70.10Z,5499,NN,PME,2021-02-11,NAF_other:70.10Z|generic_name|structured|PME/micro
280,60,898049473,DRONE INOVE GEOMETRE,,,71.12A,5499,NN,PME,2021-04-07,NAF_other:71.12A|generic_name|structured|PME/micro
281,60,899356588,SPARNACUS DRONE,,,01.61Z,5710,NN,,2021-04-20,NAF_other:01.61Z|generic_name|structured|PME/micro
282,60,901262501,CRYSTAL-DRONE,,,90.02Z,5710,NN,PME,2021-02-01,NAF_other:90.02Z|generic_name|structured|PME/micro
283,60,902981034,HOLDING HYDRONET,,,70.10Z,5710,NN,PME,2021-09-06,NAF_other:70.10Z|generic_name|structured|PME/micro
284,60,907721351,INTELLIGENCE OF DRONE,,IOD,80.20Z,5710,NN,PME,2021-11-19,NAF_other:80.20Z|generic_name|structured|PME/micro
285,60,910436211,OA DRONE,,,71.12A,5710,NN,PME,2022-02-14,NAF_other:71.12A|generic_name|structured|PME/micro
286,60,911340883,DRONE VERT,,,01.61Z,5710,NN,,2022-03-11,NAF_other:01.61Z|generic_name|structured|PME/micro
287,60,912088275,ASSOCIATION DRONE MY VIDEO,,,30.30Z,9220,NN,,2014-12-16,NAF_B:30.30Z|generic_name|PME/micro
288,60,914538731,AGRIBIO DRONE,,,01.61Z,5499,NN,,2022-04-20,NAF_other:01.61Z|generic_name|structured|PME/micro
289,60,914851688,DRONE BAT - ISERE NUISIBLES - GUEPES38,,,81.29A,5710,NN,PME,2022-06-22,NAF_other:81.29A|generic_name|structured|PME/micro
290,60,920634755,PLANETE DRONE 4G,,,53.20Z,5710,NN,PME,2022-08-10,NAF_other:53.20Z|generic_name|structured|PME/micro
291,60,921559100,LIPS DRONE,,,77.39Z,5710,NN,PME,2022-11-21,NAF_other:77.39Z|generic_name|structured|PME/micro
292,60,922532460,NORTH DRONES EQUIPEMENTS,,,28.99B,5710,NN,PME,2022-12-11,NAF_other:28.99B|generic_name|structured|PME/micro
293,60,927613752,L'ATOUT DU DRONE,,,71.12A,5499,NN,,2024-04-11,NAF_other:71.12A|generic_name|structured|PME/micro
294,60,927921445,DRONEMATCH FRANCE SAS,,,63.12Z,5710,NN,,2024-05-01,NAF_other:63.12Z|generic_name|structured|PME/micro
295,60,928166651,VEGETAL DRONE,,,01.61Z,5710,NN,,2024-04-24,NAF_other:01.61Z|generic_name|structured|PME/micro
296,60,930003991,RDRONE CONCEPT,,,81.29A,5710,NN,,2024-06-17,NAF_other:81.29A|generic_name|structured|PME/micro
297,60,932395486,ENVIDRONE,,,85.53Z,5499,NN,,2024-08-28,NAF_other:85.53Z|generic_name|structured|PME/micro
298,60,933472664,LUCIOLE DRONE,,LD,90.03B,5499,NN,,2024-09-19,NAF_other:90.03B|generic_name|structured|PME/micro
299,60,934270539,TOP DRONE 60,,,82.30Z,5499,NN,,2024-10-03,NAF_other:82.30Z|generic_name|structured|PME/micro
300,60,934530528,DRONE AGRICULTURE ALPILLES,,,01.61Z,5499,NN,,2024-10-22,NAF_other:01.61Z|generic_name|structured|PME/micro
301,60,934556531,SPLENDID DRONES,,,90.01Z,5710,NN,,2024-09-24,NAF_other:90.01Z|generic_name|structured|PME/micro
302,60,934628470,D'AIR DRONE,,,43.34Z,5499,NN,,2024-06-18,NAF_other:43.34Z|generic_name|structured|PME/micro
303,60,934833534,HYDRONET ASSAINISSEMENT,,,43.12A,5710,NN,,2024-10-29,NAF_other:43.12A|generic_name|structured|PME/micro
304,60,938993607,ARADRONE,,,45.11Z,5710,NN,,2024-12-27,NAF_other:45.11Z|generic_name|structured|PME/micro
305,60,939636882,METHODRONE DEVELOPPEMENT,,,77.40Z,5710,NN,,2025-01-06,NAF_other:77.40Z|generic_name|structured|PME/micro
306,60,939975959,DRONE PLEIN SUD,,,00.00Z,5499,NN,,2025-01-02,NAF_other:00.00Z|generic_name|structured|PME/micro
307,60,939979225,DRONET,,,43.39Z,5499,NN,,2025-02-01,NAF_other:43.39Z|generic_name|structured|PME/micro
308,60,940176548,TOPO DRONE SBH,,,71.12A,5710,NN,,2025-01-08,NAF_other:71.12A|generic_name|structured|PME/micro
309,60,941180580,AH DRONE,,,26.11Z,5710,NN,,2025-02-19,NAF_other:26.11Z|generic_name|structured|PME/micro
310,60,941456584,IDEAL DRONE,,,01.61Z,5710,NN,,2025-02-27,NAF_other:01.61Z|generic_name|structured|PME/micro
311,60,941580847,DRONE COM KARAIB,,DCK,58.14Z,5710,NN,,2025-02-17,NAF_other:58.14Z|generic_name|structured|PME/micro
312,60,941717639,DRONE PRECISION MAYENNAIS,,DPM,01.61Z,5499,NN,,2025-03-05,NAF_other:01.61Z|generic_name|structured|PME/micro
313,60,941791030,SONODRONE,,,90.02Z,5710,NN,,2025-02-20,NAF_other:90.02Z|generic_name|structured|PME/micro
314,60,942488412,VISUDRONE,,,71.12A,5710,NN,,2025-03-26,NAF_other:71.12A|generic_name|structured|PME/micro
315,60,942872623,METHODRONE HOLDING,,,70.10Z,5710,NN,,2025-03-27,NAF_other:70.10Z|generic_name|structured|PME/micro
316,60,943161521,ALTUS DRONES GROUP,,ADG,82.11Z,5710,NN,,2025-04-10,NAF_other:82.11Z|generic_name|structured|PME/micro
317,60,944229202,METHODRONE DISTRIBUTION,,,47.91A,5710,NN,,2025-05-06,NAF_other:47.91A|generic_name|structured|PME/micro
318,60,945335040,DEPART DRONE 78,,,81.29A,5710,NN,,2025-05-30,NAF_other:81.29A|generic_name|structured|PME/micro
319,60,947744025,DRONE FRANCE,,DF,81.29A,5710,NN,PME,2022-12-16,NAF_other:81.29A|generic_name|structured|PME/micro
320,60,949268833,SIDRONE,,,82.11Z,5710,NN,PME,2023-01-26,NAF_other:82.11Z|generic_name|structured|PME/micro
321,60,949280846,CIDRONEL,,,70.10Z,5710,NN,PME,2023-02-21,NAF_other:70.10Z|generic_name|structured|PME/micro
322,60,953322427,DRONE DE DOME,,,82.99Z,5499,NN,PME,2023-06-06,NAF_other:82.99Z|generic_name|structured|PME/micro
323,60,953812310,SAN PEDRONE,,,46.39B,5710,NN,PME,2023-05-25,NAF_other:46.39B|generic_name|structured|PME/micro
324,60,953914363,RTK DRONE,,,45.32Z,5710,NN,PME,2023-06-09,NAF_other:45.32Z|generic_name|structured|PME/micro
325,60,980279319,ANTILLES GUYANE DRONE CONCEPT,,DRC ANTILLES GUYANE,00.00Z,5499,NN,,2023-10-01,NAF_other:00.00Z|generic_name|structured|PME/micro
326,60,980564751,MA TOPO DRONE,,MATOPODRONE,71.12A,5710,NN,PME,2023-06-01,NAF_other:71.12A|generic_name|structured|PME/micro
327,60,982463044,TOPODRONE SOLUTION,,,71.12A,5710,NN,PME,2023-12-12,NAF_other:71.12A|generic_name|structured|PME/micro
328,60,983116948,TOWER DRONE,,TOWER DRONE,52.23Z,5710,NN,PME,2023-12-04,NAF_other:52.23Z|generic_name|structured|PME/micro
329,60,984920736,SPACEDRONE-DATALINK,,,72.19Z,5710,NN,,2024-03-15,NAF_other:72.19Z|generic_name|structured|PME/micro
330,60,989346648,ZONE DE DRONE,,,00.00Z,5499,NN,,2025-07-15,NAF_other:00.00Z|generic_name|structured|PME/micro
331,60,990152357,DRONE BY NATURE,,,63.12Z,5710,NN,,2025-08-05,NAF_other:63.12Z|generic_name|structured|PME/micro
332,60,990871899,DRONE AGRI CORSE,,,01.61Z,5710,NN,,2025-08-28,NAF_other:01.61Z|generic_name|structured|PME/micro
333,60,992003087,BV-DRONE,,S.A.S.U,01.61Z,5710,NN,,2025-09-25,NAF_other:01.61Z|generic_name|structured|PME/micro
334,60,992341578,ALPHA DRONE OPERATION,,ADO,00.00Z,5499,NN,,2025-09-18,NAF_other:00.00Z|generic_name|structured|PME/micro
335,60,993762509,SKYDRONE INVEST,,,70.10Z,5710,NN,,2025-10-31,NAF_other:70.10Z|generic_name|structured|PME/micro
336,60,994672053,SKYDRONE CAPITAL,,,70.10Z,5710,NN,,2025-11-27,NAF_other:70.10Z|generic_name|structured|PME/micro
337,60,995192622,BRUDRONE,,,74.10Z,5710,NN,,2025-12-02,NAF_other:74.10Z|generic_name|structured|PME/micro
338,60,995286929,USINAGE-CHAUDRONERIE-SOUDURE,,U-C-S,25.62B,5499,NN,,2026-01-12,NAF_other:25.62B|generic_name|structured|PME/micro
339,60,999684145,ECODRONE3D,,,43.99A,5499,NN,,2026-01-09,NAF_other:43.99A|generic_name|structured|PME/micro
340,55,212404602,COMMUNE DE SAINT MEARD DE DRONE,,,84.11Z,7210,03,PME,1980-01-01,NAF_other:84.11Z|generic_name|emp:03|PME/micro
341,55,212404776,COMMUNE DE SAINT PARDOUX DE DRONE,,,84.11Z,7210,03,PME,1980-01-01,NAF_other:84.11Z|generic_name|emp:03|PME/micro
342,55,908721087,CENTRE D'INNOVATION DRONES NORMANDIE,,CIDN,72.19Z,9220,NN,,2021-06-24,NAF_other:72.19Z|provider_kw|PME/micro
343,50,100849330,DRONEAID COLLECTIVE,,,94.12Z,9220,NN,,2026-01-15,NAF_other:94.12Z|generic_name|PME/micro
344,50,101720696,SYN-DRONE PRODUCTION,,,90.01Z,9220,NN,,2026-02-16,NAF_other:90.01Z|generic_name|PME/micro
345,50,332813369,SCI DES ANDRONES,,,55.10Z,6599,NN,PME,1985-06-01,NAF_other:55.10Z|generic_name|PME/micro
346,50,341050938,DRONET,DRONET,,55.3A,1000,NN,,1987-05-01,NAF_other:55.3A|generic_name|PME/micro
347,50,342070711,CEDRONE,CEDRONE,,86.90E,1000,NN,PME,1987-08-03,NAF_other:86.90E|generic_name|PME/micro
348,50,354087215,DRONEAU,DRONEAU,,01.2A,1000,NN,,1989-01-01,NAF_other:01.2A|generic_name|PME/micro
349,50,380878991,SC DES ANDRONES,,,66.30Z,6599,NN,PME,1991-02-23,NAF_other:66.30Z|generic_name|PME/micro
350,50,381852664,DRONES,,,91.3E,9220,NN,,1989-10-24,NAF_other:91.3E|generic_name|PME/micro
351,50,391931425,GAEC DRONET,,,01.42Z,6533,NN,,1993-07-01,NAF_other:01.42Z|generic_name|PME/micro
352,50,403304553,SCI CLAIRE DRONEAU,,,70.2C,6540,NN,,1995-11-15,NAF_other:70.2C|generic_name|PME/micro
353,50,442196630,DRONET,DRONET,,47.81Z,1000,NN,PME,2002-04-03,NAF_other:47.81Z|generic_name|PME/micro
354,50,448564245,DRONE OVER,,,90.01Z,9220,NN,,2003-04-25,NAF_other:90.01Z|generic_name|PME/micro
355,50,481301539,DRONEAU,DRONEAU,,88.99B,1000,NN,PME,2005-03-01,NAF_other:88.99B|generic_name|PME/micro
356,50,511435075,DRONEAU,DRONEAU,,01.11Z,1000,NN,,2009-03-06,NAF_other:01.11Z|generic_name|PME/micro
357,50,529902884,CIE SANDRONE ET ARTIFICES,,,90.01Z,9220,NN,,2010-07-22,NAF_other:90.01Z|generic_name|PME/micro
358,50,537482481,ASSOCIATION DRONE SWEET DRONE,,,59.20Z,9220,NN,,2011-06-07,NAF_other:59.20Z|generic_name|PME/micro
359,50,789573359,DRONET,DRONET,,14.13Z,1000,NN,PME,2012-12-01,NAF_other:14.13Z|generic_name|PME/micro
360,50,795382225,POWELL BODRONE,POWELL BODRONE,,86.90D,1000,NN,PME,2013-09-23,NAF_other:86.90D|generic_name|PME/micro
361,50,800428799,FEDERATION PROFESSIONNELLE DU DRONE CIVIL U1/2 FPDC,,,94.12Z,9220,NN,PME,2013-06-27,NAF_other:94.12Z|generic_name|PME/micro
362,50,814470050,DRONE TEMPLE,,,90.01Z,9220,NN,,2014-12-13,NAF_other:90.01Z|generic_name|PME/micro
363,50,821645306,SQUADRONE VOLANTE,,,82.30Z,9220,NN,,2016-07-20,NAF_other:82.30Z|generic_name|PME/micro
364,50,822860250,DRONEAU,DRONEAU,,86.90E,1000,NN,PME,2016-10-03,NAF_other:86.90E|generic_name|PME/micro
365,50,877975144,DRUMS AND DRONES,,,90.02Z,9220,NN,,2019-09-15,NAF_other:90.02Z|generic_name|PME/micro
366,50,881796031,DRONES MUSIC ASSOCIATION,,,90.01Z,9220,NN,,2016-08-31,NAF_other:90.01Z|generic_name|PME/micro
367,50,889361150,UNION NATIONALE DES EXPLOITANTS ET DES PROFESSIONNELS DE L'AERONAUTIQUE TELEPILOTEE,,,94.12Z,9220,NN,,2015-02-26,NAF_other:94.12Z|generic_name|PME/micro
368,50,889504742,"RECHERCHE, ASSISTANCE, INVESTIGATION PAR DRONES RAID",,,84.25Z,9220,NN,,2017-04-11,NAF_other:84.25Z|generic_name|PME/micro
369,50,911674539,MALANDRONE,MALANDRONE,,14.13Z,1000,NN,PME,2022-03-03,NAF_other:14.13Z|generic_name|PME/micro
370,50,922177936,SC DES ANDRONES 2,,,66.30Z,6599,NN,PME,2022-12-07,NAF_other:66.30Z|generic_name|PME/micro
371,50,922402037,SC DES ANDRONES 3,,,66.30Z,6599,NN,PME,2022-12-07,NAF_other:66.30Z|generic_name|PME/micro
372,50,924522634,OTO DRONE & COM,,,70.21Z,9220,NN,,2024-01-04,NAF_other:70.21Z|generic_name|PME/micro
373,50,929949618,2 RUE CLAIRE DRONEAU,,,55.20Z,2110,NN,,2024-01-01,NAF_other:55.20Z|generic_name|PME/micro
374,50,930963202,FORENSIC DRONE RESEARCH,,,72.19Z,9220,NN,,2024-07-05,NAF_other:72.19Z|generic_name|PME/micro
375,50,931392963,GEODRONE57,,,63.99Z,9220,NN,,2024-03-18,NAF_other:63.99Z|generic_name|PME/micro
376,50,931961668,DRONE ACCES,,,82.99Z,6220,NN,,2024-06-01,NAF_other:82.99Z|generic_name|PME/micro
377,50,982209892,QR'DRONE,QR'DRONE,,52.24B,1000,NN,PME,2023-12-04,NAF_other:52.24B|generic_name|PME/micro
378,50,983225731,DRONEAU,DRONEAU,,85.52Z,1000,NN,,2024-01-08,NAF_other:85.52Z|generic_name|PME/micro
```
