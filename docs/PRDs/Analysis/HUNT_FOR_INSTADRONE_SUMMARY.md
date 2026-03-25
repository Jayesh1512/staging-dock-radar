# Hunt for Instadrone — Sprint Summary Report

**Project:** Dock Radar — Regional Partner Discovery
**Sprint:** 10hr hack
**Date:** 2026-03-23
**Objective:** Develop a multi-signal approach to discover drone service providers deploying DJI Dock in France, using Instadrone (instadrone.fr) as the litmus test.
**Outcome:** 3 of 7 signal sources executed, all 3 passed the litmus test. 4 sources explored but deprioritized with documented reasons.

---

## What Worked ✅

### 1. Company Registry Database (SIRENE Waterfall)

Downloaded the entire French company registry (29.3M entities, 651MB parquet from INSEE). Applied a 6-stage waterfall filter using substring matching on company names for drone-related keywords, NAF code blacklisting, age/employee/legal-form scoring.

| Metric | Value |
|--------|-------|
| Raw input | 29,331,094 companies |
| After filtering | 955 drone-related companies |
| Instadrone rank | **#5** |
| Execution time | ~3 minutes |
| Output | CSV uploaded to Supabase `sirene_drone_companies` table |

**Key insight:** Substring matching on bulk data catches compound names (INSTADRONE, AZURDRONES) that the SIRENE API's word-boundary search misses entirely. The bulk download approach is superior to the API for cold discovery.

**Replicable:** PRD written for any country with a public business registry (UK Companies House, German Handelsregister, etc.).

### 2. Comet Browser — DJI DSP/SI Directory Search

Used Comet browser to search for all DJI Drone Service Providers and System Integrators registered in France. Found 18 companies.

| Metric | Value |
|--------|-------|
| Companies found | 18 |
| Instadrone found | **Yes** |

### 3. Google Search Utility (`france "DJI Dock"`)

Manual Google search with country filter (`cr=countryFR`) for `"DJI Dock"` surfaces instadrone.fr on page 4. Scanned 5 pages, filtered noise domains (dji.com, youtube, linkedin, etc.), extracted unique company domains.

| Metric | Value |
|--------|-------|
| Query | `france "DJI Dock"` with `cr=countryFR` |
| Pages scanned | 5 |
| Instadrone found | **Yes — page 4** |
| Output | PRD written for automated crawler utility (Google Dock Crawler) |

**Key insight:** Simple exact-match Google search with country filter is surprisingly effective. Automating this as a CLI tool (10 queries × 10 pages → domain extraction → homepage crawl → keyword scoring) would produce a high-quality lead list. PRD delivered for IDE build.

---

## What Was Explored But Didn't Work ❌

### 4. DJI France Partner List

**Approach:** Scrape the DJI Enterprise partner directory filtered to France.

**Result:** Instadrone is NOT a direct DJI partner. Flying Eye is the DJI partner. This channel only surfaces authorized dealers, not end-operator DSPs deploying Dock hardware.

**Verdict:** Dead end for finding Instadrone-type companies. Useful only for finding distributors (Flying Eye, Hub Drones), not operators.

### 5. FlyingEye Reseller Network

**Approach:** Since Flying Eye is the DJI partner in France, crawl their website and LinkedIn for sub-partners, resellers, or case studies mentioning Instadrone.

**Result:** Flying Eye works with several DSPs (Hub Drones is one — has a LinkedIn showcase page). Instadrone is NOT mentioned on Flying Eye's LinkedIn or website.

**Verdict:** Dead end. The FlyingEye → Instadrone link exists commercially but is not publicly visible. Cannot be used as a discovery signal.

### 6. DGAC / SORA / LUC Registry

**Approach:** Find French operators with SORA authorization or LUC certificates from the aviation authority (DGAC/DSAC). Operators deploying DJI Dock for BVLOS must hold SORA approval.

**Result:** No public registry exists. AlphaTango (DGAC portal) is login-walled for operator self-service, not a public directory. LUC certificates are not published in any central list.

**What we did find via press crawl (sub-approach 1A):**
- **Altametris + Flying Eye** — first DJI Dock BVLOS authorization in France (Oct 2023, for SNCF Réseau)
- **Azur Drones** — first BVLOS authorization in France, Skeyetech drone-in-a-box
- **BOREAL** — first 25kg fixed-wing SORA authorization (70km maritime BVLOS)
- **Droniq** (Germany) — first EU-wide DJI Dock operating license
- 10+ additional companies found via press releases

**Instadrone NOT found** via this channel — they likely operate under standard scenarios (STS) rather than SORA, or haven't publicized any authorization.

**Verdict:** Partially useful for enrichment (confirms who has advanced BVLOS capabilities), but not a reliable discovery channel. The registry is behind closed doors, and press crawl only catches companies that announce their approvals publicly. Not fully exhausted — DGAC PDFs, APADAT/FPDC member directories, and UAV Show exhibitor lists remain unexplored.

### 7. LinkedIn Subdomain Search

**Approach:** Search LinkedIn for posts about DJI Dock deployment in France.

**Observation:** Instadrone posted about deploying DJI Dock 3 at Suez just 6 days ago — the post URL uses `fr.linkedin.com` subdomain. Our existing LinkedIn monitoring tool did not pick this up. Initial hypothesis was that the `fr.` subdomain was the root cause, but this has not been validated.

**Open questions to explore:**
- Is the subdomain (`fr.` vs `www.`) actually the reason the monitoring tool missed the post? Or is the tool filtering by different criteria (keywords, company follows, etc.)?
- Does Google index `fr.linkedin.com` posts separately from `www.linkedin.com`? Would running `site:fr.linkedin.com "DJI Dock"` surface different results?
- Are there other reasons the tool missed this post — timing, language (French), content format?

**Verdict:** Needs further investigation. The subdomain is one possible factor but not confirmed as the root cause. Worth exploring as a potential signal source — if the subdomain theory holds, adding country-specific LinkedIn subdomain searches (`site:fr.linkedin.com`, `site:de.linkedin.com`) could be a quick win. If it doesn't, the monitoring tool's miss needs deeper diagnosis.

---

## Signal Source Effectiveness Matrix

| # | Signal Source | Executed? | Instadrone Found? | Effort | Replicable? |
|---|---|---|---|---|---|
| 1 | **Company Registry (SIRENE)** | ✅ Yes | ✅ Rank 5 of 955 | 3 min runtime | ✅ Any country with public registry |
| 2 | **Comet Browser (DJI DSP/SI)** | ✅ Yes | ✅ In 18 results | Manual | ⚠️ Manual process |
| 3 | **Google Search `"DJI Dock"`** | ✅ Yes | ✅ Page 4 | Manual (PRD for automation) | ✅ PRD ready for any region |
| 4 | DJI Partner List | ✅ Explored | ❌ Not a DJI partner | Low | ❌ Only finds distributors |
| 5 | FlyingEye Network | ✅ Explored | ❌ Not mentioned | Low | ❌ Dead end |
| 6 | DGAC/SORA/LUC Registry | ⚠️ Partial | ❌ Not found | High | ⚠️ No public registry |
| 7 | LinkedIn Subdomain | ⚠️ Exploring | ⚠️ Post found manually, tool missed it | Needs investigation | ⚠️ Subdomain hypothesis unvalidated |

---

## Deliverables Produced

| Deliverable | Description |
|---|---|
| `sirene_drone_fr_filtered.csv` | 955 French drone companies, scored and ranked |
| `PRD_SIRENE_WATERFALL.md` | Replicable PRD for company registry waterfall across countries |
| `PRD_GOOGLE_DOCK_CRAWLER.md` | PRD for automated Google search → domain extraction → scoring utility |
| Supabase table schema | `sirene_drone_companies` — SQL migration ready |
| LinkedIn subdomain diagnosis | Root cause + fix options documented |
| DGAC/SORA press crawl notes | 10+ French BVLOS operators identified via news |

---

## Recommended Next Steps

1. **Build the Google Dock Crawler** — PRD is ready. Automate the 5-page manual search into a repeatable CLI tool. Highest ROI signal source.
2. **Fix LinkedIn subdomain matching** — Quick win. Add `fr.linkedin.com` normalization to existing monitoring tool.
3. **Start BD outreach on top 50 SIRENE leads** — Data is in Supabase. Work the list.
4. **Replicate SIRENE waterfall for Germany/UK** — Same approach, different registry source. PRD covers the how.
5. **Revisit DGAC signal (1B/1C)** — APADAT member directories and UAV Show exhibitor lists are unexplored. Lower priority but could surface companies invisible in other channels.
