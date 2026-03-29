Country for this research: France

(Use the country name above for every reference to the target country throughout this entire prompt. All database searches, web queries, file names, and outputs should use this country. The 2-letter ISO country code for file naming should be derived from this country name automatically.)

You are a panel of experts helping FlytBase's Business Development team build a comprehensive census of every entity dealing with DJI Dock in the country specified above. This is a top-of-funnel exercise — capture everybody first, then filter down to verified DJI Dock operators.

## CONTEXT

FlytBase sells fleet autonomy software for DJI Dock (all versions: Dock 1, Dock 2, Dock 3). Our customers include:
- Police/fire departments running DFR (Drone as First Responder) programs with DJI Dock
- Enterprise companies deploying DJI Dock for inspection, surveillance, monitoring
- DJI authorized dealers who sell and install DJI Dock
- Software companies that integrate with DJI Dock (like DroneDeploy, DroneSense, VOTIX)
- System integrators who deploy and maintain DJI Dock infrastructure
- Resellers, distributors, and any entity in the DJI Dock value chain

We are STRICTLY focused on DJI Dock — not generic drones, not "drone-in-a-box" competitors (Skydio, Percepto, Asylon, etc.), not even generic DJI enterprise products. Only entities with verifiable DJI Dock involvement.

## PHASE 1: IDENTIFY COUNTRY-SPECIFIC DATABASES

For the target country, research and identify the equivalent of these 5 database categories. Do web searches to find the actual databases and their URLs:

1. Aviation authority waiver/license database — The target country's equivalent of FAA Part 107 waivers. Search for: "[country] civil aviation authority drone operator registry", "[country] BVLOS waiver list", "[country] commercial drone license database". Examples: EASA (EU), DGAC (France), CAA (UK), CASA (Australia), JCAB (Japan), DGCA (India).

2. DJI case studies and content mentioning the target country — Search: "DJI Dock" "[country]" site:enterprise-insights.dji.com, "DJI Dock" "[country]" site:viewpoints.dji.com, "DJI Dock" "[country]" site:enterprise.dji.com

3. Industry media covering DJI Dock in the target country — Search drone industry publications: "DJI Dock" "[country]" site:dronedj.com, site:dronexl.co, site:dronelife.com, site:suasnews.com. Also search country-specific drone publications and local-language media.

4. DJI ecosystem partners operating in the target country — Check if FlytBase, DroneDeploy, DroneSense, VOTIX, Iris Automation, or other Dock-compatible platforms have customers or partners in the target country.

5. Government procurement databases for the target country — Search for DJI Dock purchases in the country's public procurement portal. Examples: TED/Tenders Electronic Daily (EU), AusTender (Australia), Contracts Finder (UK), GeM (India), ComprasNet (Brazil).

Note: DJI enterprise dealer list data is already available separately and is not included in this database scan. Do not search for or count DJI dealer list entries.

For each database, report:
- The database name and URL
- How many records/entities it contains (approximate)
- Whether it's publicly accessible or requires registration
- What data fields are available (company name, license type, location, etc.)

## PHASE 2: BUILD THE RAW UNIVERSE

From all databases identified in Phase 1, extract every unique entity name. Union all sources and deduplicate. This is your raw top-of-funnel count.

Report the total unique names and which database contributed how many.

## PHASE 3: APPLY THE 5-STEP WATERFALL

Apply these exact steps in order. For each step, report: the input count, the output count, the dropout count, the logic/filter rule, and 2-3 sample dropouts with verification evidence (clickable URLs proving why they were dropped or kept).

### Step 5: Classify and enrich
- What to do: For each verified entity, populate ALL of these columns:
  - company_name
  - country
  - role (Government End-User, Enterprise End-User, Authorized Dealer, Software Platform, DFR Service Provider, Reseller, Distributor, System Integrator, Academia/Research)
  - dock_models (Dock 1, Dock 2, Dock 3, or combination)
  - dock_count (number deployed, or "N/A" for dealers/platforms)
  - website
  - linkedin_url
  - evidence_url_1
  - source_type_1
  - evidence_url_2
  - source_type_2
  - confidence (High = 2+ evidence sources; Medium = 1 evidence source; Low = implied only)
  - discovery_database (which of the 5 databases found this entity — aviation authority, DJI case studies, industry media, ecosystem partners, or government procurement)
  - waterfall_step ("Verified DJI Dock" for verified; "Step 1: Excluded" / "Step 2: Parked" for others)
  - last_signal_date (most recent DJI Dock evidence date, YYYY-MM format)
  - notes (free text with key context)
  - dji_dock_verified (Yes / No)
  - source_database (which database this entity came from, with waiver/license count if applicable)
  - responsible_persons (from aviation authority database, if available)

## PHASE 4: PRODUCE OUTPUTS

### Output 1: Waterfall methodology report (visual)
Create an interactive visual report showing:
- Source cards at top (5 databases with entity counts)
- 5 waterfall steps with funnel bars, dropout badges, and counts
- Each step includes: logic, filter rule, and evidence box with 2-3 sample dropouts/keeps with clickable URLs
- Output breakdown grid at bottom (by role category and confidence split)

### Output 2: Full-funnel CSV
Create a CSV file containing EVERY entity from the raw universe (top of funnel), including:
- Verified entities (dji_dock_verified = Yes) with full enrichment
- Entertainment exclusions (waterfall_step = "Step 1: Excluded") with exclusion reason
- Parked entities (waterfall_step = "Step 2: Parked") with source database info
Name the file: dji_dock_[2-letter ISO code]_full_funnel.csv

### Output 3: Verified-only CSV
Create a separate CSV with ONLY the verified DJI Dock entities, fully enriched.
Name the file: dji_dock_[2-letter ISO code]_verified.csv

## QUALITY RULES — DO NOT VIOLATE

1. Every verified entity must have at least one clickable evidence URL. If you cannot find a URL proving DJI Dock involvement, the entity is NOT verified. Do not fabricate URLs.
2. Do not inflate the verified count. 10 genuinely verified entities are worth more than 50 with weak evidence. Quality over quantity.
3. Do not include DJI Dock competitors (Skydio, Percepto, Asylon, Nightingale, etc.) in the verified list. They are competitors, not customers.
4. Do not match on generic "drone" or "DJI" keywords. Only match on "DJI Dock", "Dock 2", or "Dock 3" specifically.
5. Parked ≠ excluded. Entities without DJI Dock signal are parked for future enrichment, not permanently removed. They stay in the full-funnel CSV.
6. Report the honest numbers. If the target country only has 5 verified DJI Dock entities, report 5. Do not stretch to make the output look impressive.
7. Use web search aggressively. Do at least 15-20 web searches per country to find DJI Dock evidence. Search in the local language as well as English.
8. Search in the local language. For non-English countries, search for DJI Dock using local-language terms alongside English searches.

## COUNTRY-SPECIFIC NOTES

[Add any country-specific context here before running. Reference notes below:]


- For EU countries: No NDAA ban equivalent — DJI operates freely. EASA is the overarching regulatory body. Check national CAAs for country-specific waivers.
- For France: DGAC is the aviation authority. SIRENE is the business registry. Check DGAC operating waivers for drone operators. Local search terms: "DJI Dock" "drone autonome", "station drone DJI", "DJI Dock" site:.fr
- For Germany: LBA is the authority. Check LuftVO regulations. INTERGEO is the major trade show. Local search terms: "DJI Dock" "Drohne", "DJI Dock" site:.de
- For UK: CAA is the aviation authority. Check PfCO (Permission for Commercial Operations) and PDRA databases. Local search terms: "DJI Dock" site:.co.uk
- For Australia: CASA is the aviation authority. Check ReOC (Remotely Piloted Aircraft Operator's Certificate) holders. Local search terms: "DJI Dock" site:.com.au
- For Japan: JCAB/MLIT is the aviation authority. DJI has strong market presence. Search in Japanese: "DJI Dock" ドローンステーション, "DJI Dock" site:.jp
- For South Korea: MOLIT/KOCA is the authority. Koseco is the official DJI partner. Search in Korean: "DJI Dock" 드론, "DJI Dock" site:.kr
- For UAE: GCAA is the aviation authority. Check DCAA (Dubai) separately. Strong DJI presence. Search: "DJI Dock" site:.ae
- For India: DGCA is the authority. Check Digital Sky platform for operator registrations. Search: "DJI Dock" site:.in
- For Brazil: ANAC is the authority. Check SISANT drone registry. Search in Portuguese: "DJI Dock" "drone" site:.com.br
- For Netherlands: ILT is the authority. Several DJI dealers (Droprise is known DJI Dock partner in Benelux). Search: "DJI Dock" site:.nl