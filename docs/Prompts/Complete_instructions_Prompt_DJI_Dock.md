# Dock Radar: DJI Dock Entity Research — Reusable Prompt & Template

> **Owner:** FlytBase BD Team
> **Purpose:** Top-of-funnel census of every entity dealing with DJI Dock in a target country
> **Last updated:** 2026-03-30

---

## HOW TO USE THIS PROMPT

1. Copy the **Research Prompt** below into any AI tool (Claude, ChatGPT, Perplexity, Gemini Deep Research, etc.)
2. Replace `[COUNTRY]` with your target country
3. The AI will run web searches and return a structured CSV
4. Repeat for each country in your target list
5. Use the **Consolidation Instructions** at the bottom to merge all country CSVs into one master file

---

## RESEARCH PROMPT

```
Country for this research: [COUNTRY]

You are a panel of research experts helping FlytBase's Business Development team build a comprehensive census of every entity dealing with DJI Dock in the country specified above. This is a top-of-funnel exercise — capture everybody first, then filter down to verified DJI Dock operators.

(Use the country above for all searches, queries, and file outputs. Derive the 2-letter ISO code automatically.)

Find every entity in the specified country that is dealing with DJI Dock (DJI Dock 1, DJI Dock 2, or DJI Dock 3) in any capacity — operators, deployers, dealers, resellers, installers, software integrators, system integrators, end-users (government, enterprise, public safety), or any other entity in the DJI Dock value chain.

## SEARCH STRATEGY

Run all of the following searches. Search in both English and the local language of the target country:

1. "DJI Dock" "[country]"
2. "DJI Dock 2" "[country]"
3. "DJI Dock 3" "[country]"
4. "DJI Dock" site:[country TLD] (e.g., site:.fr, site:.de, site:.co.uk, site:.com.au)
5. "DJI Dock" "[country]" site:enterprise-insights.dji.com
6. "DJI Dock" "[country]" site:viewpoints.dji.com
7. "DJI Dock" "[country]" site:dronedj.com
8. "DJI Dock" "[country]" site:dronexl.co
9. "DJI Dock" "[country]" site:dronelife.com
10. "DJI Dock" "[country]" site:linkedin.com
11. "Dock 2" OR "Dock 3" DJI "[country]" drone
12. "DJI Dock" "[country]" [local language term for drone/inspection/police/security]
13. "DJI Dock" "[country]" dealer OR reseller OR distributor
14. "DJI Dock" "[country]" police OR security OR inspection OR energy

Also check:
- enterprise.dji.com/ecosystem for software partners in the country
- DJI AirWorks presentations mentioning the country

## STRICT KEYWORD RULE

ONLY include entities with evidence containing these exact terms: "DJI Dock", "Dock 2", "Dock 3".

Do NOT include entities based on:
- Generic "drone" or "UAV" mentions
- Generic "DJI" without "Dock" specifically
- "Drone-in-a-box" without DJI Dock confirmation
- Competitor products (Skydio Dock, Percepto, Asylon, Nightingale)
- "Matrice 3D", "Matrice 4D", or "FlightHub 2" alone without "Dock"

## OUTPUT

Create a CSV file named [Country]_dji_dock_Claude_[YYYYMMDD].csv with these columns:

company_name, country, role, dock_models, dock_count, website, linkedin_url, evidence_url_1, source_type_1, evidence_url_2, source_type_2, confidence, notes

Where:
- role = one of: Government End-User, Enterprise End-User, Authorized Dealer, Software Platform, DFR Service Provider, Reseller, Distributor, System Integrator, Academia/Research
- dock_models = Dock 1, Dock 2, Dock 3, or combination found in evidence
- dock_count = number of docks deployed if mentioned, otherwise "Unknown"
- evidence_url_1 = clickable URL proving DJI Dock involvement (MANDATORY — no URL, no row)
- source_type_1 = what type of source (Company Website, DJI Case Study, Industry Article, LinkedIn Post, Government Record, Social Media Post)
- confidence = High (2+ sources), Medium (1 source)

## RULES

1. Every row MUST have at least one clickable evidence URL containing "DJI Dock", "Dock 2", or "Dock 3". No URL = do not include.
2. Do not fabricate URLs. If you cannot verify, do not include the entity.
3. Do not include DJI Dock competitors (Skydio, Percepto, Asylon, Nightingale, etc.).
4. Quality over quantity. 5 verified entities beats 30 guesses.
5. Report the honest count. If the country has 3 verified entities, output 3 rows.

Execute now.
```

---

## TARGET COUNTRY LIST

| # | Country | ISO | TLD | Local Language |
|---|---------|-----|-----|----------------|
| 1 | Germany | DE | .de | German |
| 2 | United Kingdom | GB | .co.uk / .uk | English |
| 3 | Australia | AU | .com.au | English |
| 4 | United States | US | .com / .us | English |
| 5 | United Arab Emirates | AE | .ae | Arabic |
| 6 | Saudi Arabia | SA | .sa | Arabic |
| 7 | Japan | JP | .jp | Japanese |
| 8 | South Korea | KR | .kr | Korean |
| 9 | Brazil | BR | .com.br | Portuguese |
| 10 | Italy | IT | .it | Italian |
| 11 | Spain | ES | .es | Spanish |
| 12 | Singapore | SG | .sg | English / Mandarin / Malay |
| 13 | Canada | CA | .ca | English / French |
| 14 | South Africa | ZA | .co.za | English / Afrikaans |
| 15 | Thailand | TH | .co.th | Thai |
| 16 | Poland | PL | .pl | Polish |
| 17 | Turkey | TR | .com.tr | Turkish |
| 18 | Belgium | BE | .be | Dutch / French / German |

---

## CSV TEMPLATE (Header Row)

```csv
company_name,country,role,dock_models,dock_count,website,linkedin_url,evidence_url_1,source_type_1,evidence_url_2,source_type_2,confidence,notes
```

### Column Definitions

| Column | Description | Required |
|--------|-------------|----------|
| company_name | Full legal or trading name | Yes |
| country | Country being researched | Yes |
| role | Government End-User, Enterprise End-User, Authorized Dealer, Software Platform, DFR Service Provider, Reseller, Distributor, System Integrator, Academia/Research | Yes |
| dock_models | Dock 1, Dock 2, Dock 3, or combination (semicolon-separated) | Yes |
| dock_count | Number deployed if known, else "Unknown" | Yes |
| website | Company website URL | No |
| linkedin_url | Company LinkedIn page | No |
| evidence_url_1 | Clickable URL proving DJI Dock involvement | **Yes (MANDATORY)** |
| source_type_1 | Company Website, DJI Case Study, Industry Article, LinkedIn Post, Government Record, Social Media Post | Yes |
| evidence_url_2 | Second evidence URL if available | No |
| source_type_2 | Source type for second URL | No |
| confidence | High (2+ sources) or Medium (1 source) | Yes |
| notes | Brief context about the entity's DJI Dock activity | No |

---

## FILE NAMING CONVENTION

```
[Country]_dji_dock_Claude_[YYYYMMDD].csv
```

Examples:
- `Germany_dji_dock_Claude_20260330.csv`
- `United_Kingdom_dji_dock_Claude_20260330.csv`
- `Australia_dji_dock_Claude_20260330.csv`

---

## CONSOLIDATION INSTRUCTIONS

After all countries are researched, merge into a single master file:

**Option A — Python script (included with this prompt):**
```bash
python consolidate.py ./country_csvs/ --output dji_dock_master.csv
```

**Option B — Manual merge:**
1. Open all per-country CSVs
2. Copy all rows (skip header rows after the first file)
3. Paste into a single file with one header row
4. Sort by country → company_name
5. Save as `dji_dock_master_[YYYYMMDD].csv`

**Option C — Ask any AI tool:**
```
Merge all the CSV files in this folder into a single master CSV.
Keep one header row. Sort by country, then company_name.
Output as dji_dock_master_[today's date].csv
```

---

## POST-RESEARCH SUMMARY TEMPLATE

After each country, generate this summary:

```
Country: [COUNTRY] ([ISO])
Total entities found: [N]
Confidence breakdown: [X] High | [Y] Medium
Role breakdown:
  - Authorized Dealers: [N]
  - System Integrators: [N]
  - Enterprise End-Users: [N]
  - Government End-Users: [N]
  - Distributors: [N]
  - DFR Service Providers: [N]
  - Software Platforms: [N]
  - Academia/Research: [N]
Key findings: [2-3 bullet points on notable entities or deployments]
```

---

## AUTOMATION NOTES

- Run countries **one at a time** (not combined) for best results
- Save each country CSV immediately before moving to the next
- If a country returns 0 results, that's valuable intel — flag it as a nascent market
- For non-English countries, government procurement portals in local language are high-value sources
- Re-run every 30-60 days to catch new entities entering the market
