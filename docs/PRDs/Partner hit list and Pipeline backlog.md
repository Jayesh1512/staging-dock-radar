# Dock Radar — Backlog

> Items descoped from the hackathon build. Each item has full context so it can be picked up independently in a future sprint.

---

## BACKLOG ITEM 1 — Slack Notification on "Sent to CRM"

**Feature:** Pipeline Board — Phase 5
**Trigger:** When a pipeline card is moved to the `sent_to_crm` stage
**Priority:** High — completes the handoff loop to CRM team
**Effort:** ~20 min once P6 (DB) is live

### What it does
When a BD user moves a lead to "Sent to CRM", fire a Slack message to the existing `#dock-radar` channel (webhook already configured in the codebase) with a structured summary of the lead so the CRM team can act on it immediately.

### Slack message format
```
🎯 *New CRM-Ready Lead* — DJI Dock – [CompanyName]

• *Company:* [CompanyName]
• *Region:* [Region]
• *Industry:* [Industry]
• *Signal:* [PARTNERSHIP / DEPLOYMENT / PRODUCT]
• *Score:* [HIGH / MED]
• *Known Partner:* [Yes / No]
• *LinkedIn:* [URL if available]
• *Source Article:* [URL if available]

_Moved to CRM by Dock Radar · [timestamp]_
```

### Implementation notes
- Hook into the `moveStage` function in `PipelineContext.tsx`
- Only fires when `newStage === 'sent_to_crm'`
- Call existing Slack webhook utility already used in `ArticleDrawer`
- Add a TODO comment in `PipelineContext.tsx` where the call should go:
  `// TODO P5: trigger Slack webhook on sent_to_crm`
- API route: POST `/api/pipeline/:id/notify-crm` — calls Slack, returns 200
- Should NOT block the stage move if Slack fails (fire-and-forget)
- Show a small green toast: "✓ Slack notification sent to #dock-radar"

### Files to touch
- `src/components/pipeline/PipelineContext.tsx` — add webhook call in moveStage
- `src/app/api/pipeline/[id]/notify-crm/route.ts` — new route (copy pattern from existing Slack route)

---

## BACKLOG ITEM 2 — Ask Radar: Deal Intelligence Agent

**Feature:** Global AI agent — answers questions about any sourced company
**Surfaces in:** Partner Hit List (expanded row) + Pipeline card (expanded view)
**Priority:** Medium-High — high demo value, enables faster BD decisions
**Effort:** ~1.5h (LLM plumbing + UI in two locations)

> **STATUS (2026-03-20):** Partially built.
> - Location A (Potential Partners expanded row): DONE — collapsible section, input, LLM response box, source footer all wired to `/api/radar/ask`.
> - `/api/radar/ask` API route: DONE — fetches articles by normalized company name, caps at 20 articles, returns `{ answer, article_count, sources }`.
> - Location B (Pipeline card expanded view): NOT STARTED.
> - Shared `AskRadar` component extraction: NOT STARTED — currently inline in PartnerDashboard.tsx.

### What it does
A chat-style input that lets a BD user ask natural language questions about any company that has been collected into Dock Radar. The agent queries all articles stored for that company and returns a sourced, concise answer using the existing LLM utility.

**Example questions:**
- "What deployment use cases has Percepto shown?"
- "Which geographies does SkyGrid operate in?"
- "Has this company mentioned FlytBase before?"
- "What's the latest signal from DroneBase?"
- "Is this company a potential partner or competitor?"

### Where it appears

#### Location A — Partner Hit List expanded row (Potential Partners tab)
Placed ABOVE the Source Articles list so the user evaluates before deciding to add to pipeline.

UI:
```
✦ ASK RADAR
Ask anything about this company from collected signals

[e.g. What markets does DroneBase operate in?      ] [Ask →]

─── response renders here in a light indigo card ───
"Based on 3 articles, DroneBase has demonstrated..."
Based on 3 articles · Sources: LinkedIn (2), Google News (1)
```

#### Location B — Pipeline card (expanded view)
Same UI, surfaced when a user opens a card detail in the Kanban.
Helps the user prepare for outreach: "What do I know before I send the LinkedIn message?"

### API route
**POST `/api/radar/ask`**

Request body:
```typescript
{
  company_name: string
  question: string
}
```

Handler logic:
1. Fetch all articles for `company_name` from `articles` table
   (`WHERE lower(company) = lower($1) AND status != 'dropped'`)
2. Build context string: concatenate `summary` fields of top 5 articles by score
3. Call existing LLM utility with this prompt:

```
You are an intelligence assistant for a drone autonomy BD team.
You have collected the following signals about {{company_name}}:

{{article_summaries}}

Answer this question concisely (2–4 sentences max):
{{question}}

Rules:
- Only use information from the collected signals above
- If the answer is not in the signals, say "Not enough signal data for this"
- Cite which article(s) your answer is based on (LinkedIn post / Google News)
- Do not speculate or add external knowledge
```

Response:
```typescript
{
  answer: string
  sources: { type: 'LinkedIn' | 'Google News', count: number }[]
  article_count: number
}
```

### LinkedIn Reply — context correction
> Note: LinkedIn Reply in the Hit List is a **cold outreach connection request**,
> NOT a summary of the article. The prompt should generate a 2-line connection
> message using company context, not article content.

Updated LLM prompt for LinkedIn Reply:
```
You are a BD operator at FlytBase writing a LinkedIn connection request.

Context:
- Company: {{company_name}}
- Industry: {{industry}}
- Use case: {{use_case}}
- Signal type: {{signal_type}}

Write a 2-line LinkedIn connection request that:
- References something specific about their work or industry
- Positions the sender as a peer operator in drone autonomy
- Ends with a natural reason to connect
- No pitch, no mention of FlytBase unless relevant, no emojis

Style: direct, curious, founder/BD voice (1–2 lines max)
```

### Files to create/touch
- `src/app/api/radar/ask/route.ts` — new API route
- `src/components/pipeline/PipelineCard.tsx` — add Ask Radar section to expanded view
- `src/components/partner-dashboard/PartnerDashboard.tsx` — add Ask Radar to expanded row in Potential Partners tab
- `src/components/shared/AskRadar.tsx` — shared component (input + response box) used in both locations

### AskRadar shared component spec
```typescript
// src/components/shared/AskRadar.tsx
type AskRadarProps = {
  companyName: string
  placeholder?: string
}
```
- Input + [Ask →] button
- Loading state: button shows "..." and is disabled
- Response box: light indigo bg (#eef2ff), border (#c7d2fe), border-radius 8px
- Footer: "Based on N articles · Sources: LinkedIn (X), Google News (Y)"
- Error state: "Not enough signal data for this" in grey italic
- Reusable — drop into any component with just companyName prop

---

## BACKLOG ITEM 3 — External Enrichment (Apollo / Lemlist)

**Feature:** Auto-enrich company contact data
**Priority:** Low — manual enrichment works for hack-scale volume
**Effort:** ~2h (API integration + DB columns)

### What it does
When a company is added to the pipeline, automatically call Apollo.io API to fetch:
- Decision maker name + title
- Verified email
- Company headcount + funding stage
- LinkedIn company URL

### Notes
- Apollo API key needed (not in current codebase)
- Store results in `discovered_companies` enrichment columns already partially present
- Fall back to "Not enriched" placeholder if API fails or company not found
- Rate limit: batch enrich on pipeline add, not on every article collection

---

## BACKLOG ITEM 4 — CRM Integration (HubSpot / Salesforce)

**Feature:** Push "Sent to CRM" leads directly into CRM
**Priority:** Medium — currently a Slack notification only
**Effort:** ~3h (OAuth + API mapping)

### What it does
Replace the Slack-only handoff with a real CRM record creation:
- Create a Deal/Opportunity in HubSpot or Salesforce
- Map: company_name → Company, deal_name → Deal Name, region → territory, signal → lead source
- Link back to Dock Radar source article URL in CRM notes

### Notes
- Requires CRM API key + field mapping agreement with CRM team
- Slack notification (P5) should still fire as a secondary notification
- CRM integration should be opt-in per stage move (confirm modal before push)

---

## BACKLOG ITEM 5 — Role-based Approval for Pipeline Entry

**Feature:** Require manager approval before a lead moves from Hit List → Pipeline
**Priority:** Low for single-user, Medium when team scales
**Effort:** ~2h

### What it does
- BD member clicks "+ Add to Pipeline" → creates a lead in `pending_approval` status
- Manager receives Slack DM or email: "New lead pending approval: [CompanyName]"
- Manager approves/rejects from Slack or a simple approval UI
- On approval: lead moves to `prospect` stage in Pipeline
- On rejection: lead stays dismissed with a note

---

## BACKLOG ITEM 6 — Enterprise Persona (Buyer Track)

**Feature:** Separate pipeline track for enterprise buyers vs. partners
**Priority:** Medium — current build is Partners only
**Effort:** ~1.5h (persona flag + filtered views)

### What it does
- Add `persona` field to `pipeline_leads`: `partner` | `enterprise`
- Enterprise buyers (police depts, utilities, logistics cos) get a separate Kanban view
- Different stage names for enterprise: Prospect → Demo Scheduled → POC → Contract
- Separate stats bar with enterprise-specific metrics

### Notes
- Buyer-pattern filter already exists in `hitlist/route.ts` — reuse to auto-tag enterprises
- UI: toggle above Kanban "View: [Partners] [Enterprise]"

---

## BACKLOG ITEM 7 — Remove Top 25 Targets Tab

**Feature:** Partner Hit List — tab consolidation
**Priority:** Low — wait until pipeline flow is mature
**Effort:** ~10 min

### What it does
Remove the "Top 25 Targets" tab (Tab 3) from PartnerDashboard. The Potential Partners tab already has a sortable SCORE column and Score filter (HIGH/MED), making a separate ranked view redundant.

### Implementation notes
- Remove `top25` derived state, `top25Sort`, `sortedTop25`, `exportTop25` from PartnerDashboard.tsx
- Remove `{ label: 'TOP 25 TARGETS', ... tab: 2 }` from KPI cards array
- Remove `{ label: 'Top 25 Targets', tab: 2 }` from tab bar
- Remove the entire `{activeTab === 2 && (...)}` block
- Update KPI grid from `repeat(4, 1fr)` to `repeat(3, 1fr)` (or keep 4 if Pipeline tab stays)
- Adjust tab indices for Pipeline tab if present

### Files to touch
- `src/components/partner-dashboard/PartnerDashboard.tsx`

---

## BACKLOG ITEM 8 — Expanded Drawer: Company Enrichment Fields

**Feature:** Potential Partners expanded drawer — Column 1 (Company Identity)
**Priority:** Medium — improves lead qualification speed
**Effort:** ~2h (data sourcing + UI + DB columns)

### What it does
Fill in the three "coming soon" placeholders in Column 1 of the expanded drawer:

1. **Company size** — employee count range (e.g., "11-50", "201-500")
2. **Founded year** — e.g., "2018"
3. **About / description** — 1-2 line company summary

### Data sourcing options (pick one)
- **Apollo.io API** — returns headcount, founded year, description in a single call (requires API key, see Backlog Item 3)
- **LinkedIn company page scrape** — use existing Puppeteer infra to extract from LinkedIn company About section
- **Manual entry** — editable text fields in the drawer, BD rep fills in during research

### Implementation notes
- Add columns to `discovered_companies`: `employee_count TEXT`, `founded_year INTEGER`, `about TEXT`
- Migration: `ALTER TABLE discovered_companies ADD COLUMN IF NOT EXISTS ...`
- Render in Column 1 replacing the backlog placeholder divs
- If data is null, show "—" in muted text (not "coming soon")

### Files to touch
- `supabase/migrations/` — new migration
- `src/lib/types.ts` — extend `DspHitListEntry` or create enrichment type
- `src/app/api/hitlist/route.ts` — join enrichment data
- `src/components/partner-dashboard/PartnerDashboard.tsx` — Column 1 UI

---

## BACKLOG ITEM 9 — Expanded Drawer: Signal Timeline & Competitor Mentions

**Feature:** Potential Partners expanded drawer — Column 2 (Drone Program)
**Priority:** Medium — shows trajectory, not just snapshot
**Effort:** ~1.5h

### What it does
Fill in the two "coming soon" placeholders in Column 2:

1. **Signal timeline** — visual mini-timeline showing signal types over time (e.g., "INTEREST → DEPLOYMENT → EXPANSION" across 6 months). Derived from existing `dsp.articles` array which already has `date` and `signal_type`.
2. **Competitor mentions** — flag if Percepto, Skydio, Autel Enterprise, or other competitors are mentioned in the same articles. Derived from `scored_articles.entities` where `type = 'oem'`.

### Implementation notes
- Signal timeline: group articles by month, show signal type badges on a horizontal axis. Pure frontend — data already available in `dsp.articles` + `dsp.signal_types`.
- Competitor mentions: requires API change — hitlist route should extract OEM entity names per company and return as `competitors: string[]` on `DspHitListEntry`.
- OEM_NAMES set already exists in `src/lib/constants.ts` — reuse for identification.

### Files to touch
- `src/app/api/hitlist/route.ts` — extract competitor entities per company
- `src/lib/types.ts` — add `competitors?: string[]` to `DspHitListEntry`
- `src/components/partner-dashboard/PartnerDashboard.tsx` — Column 2 UI

---

## BACKLOG ITEM 10 — Expanded Drawer: Contact Intelligence

**Feature:** Potential Partners expanded drawer — Column 3 (Decision Maker)
**Priority:** High — more entry points = higher connection rate
**Effort:** ~1h

### What it does
Fill in the three "coming soon" placeholders in Column 3:

1. **Contact LinkedIn URL** — clickable link to the decision maker's LinkedIn profile. Data partially exists in `discovered_contacts.linkedin` but is rarely populated by scoring pipeline. Needs Comet enrichment or Apollo lookup.
2. **Seniority flag** — pill badge: "C-Level", "VP/Director", "Manager", "Other". Derived from role text using keyword matching (CEO/CTO/Founder → C-Level, VP/Director → VP/Director, etc.).
3. **Other contacts** — show all persons across articles for this company (not just top-cited). Currently `key_contact` returns only the most-cited person. Show up to 3, sorted by citation count.

### Implementation notes
- Seniority: pure frontend logic — parse `key_contact.role` string with regex
- Other contacts: API change — hitlist route already has `persons_freq` map per company. Return top 3 as `contacts: Array<{ name, role, organization }>` instead of single `key_contact`.
- Contact LinkedIn URL: depends on enrichment (Backlog Item 3) or `discovered_contacts.linkedin` being populated

### Files to touch
- `src/app/api/hitlist/route.ts` — return multiple contacts per company
- `src/lib/types.ts` — extend `DspHitListEntry` with `contacts` array
- `src/components/partner-dashboard/PartnerDashboard.tsx` — Column 3 UI

---

## BACKLOG ITEM 11 — Fleet Stage Persistence & LLM Derivation

**Feature:** Potential Partners expanded drawer — Drone Program column
**Priority:** Medium — helps BD rep track company maturity
**Effort:** ~1h

### What it does
The "Fleet stage" dropdown in Column 2 is currently a disabled placeholder. This item makes it:
1. **Editable** — BD rep can manually set Pilot / Advanced / Nationwide
2. **Persisted** — stored in `discovered_companies.fleet_stage TEXT`
3. **LLM-derived** (stretch) — during scoring, the LLM extracts fleet maturity hints from article text and pre-fills the field

### Implementation notes
- Add column: `ALTER TABLE discovered_companies ADD COLUMN IF NOT EXISTS fleet_stage TEXT`
- API: PATCH `/api/companies/fleet-stage` — `{ normalized_name, fleet_stage }`
- UI: enable the dropdown, onChange calls PATCH, optimistic update
- LLM derivation: add `fleet_stage_hint` to the scoring prompt output schema. Values: `pilot | advanced | nationwide | unknown`. Only overwrite if current value is null.

### Files to touch
- `supabase/migrations/` — new migration
- `src/app/api/companies/fleet-stage/route.ts` — new PATCH route
- `src/components/partner-dashboard/PartnerDashboard.tsx` — enable dropdown
- `src/lib/scoring-prompt.ts` — add fleet_stage_hint to LLM output schema (stretch)

---

## BACKLOG ITEM 12 — Score Breakdown Detail View

**Feature:** Potential Partners expanded drawer — Score Breakdown strip
**Priority:** Low — current strip shows region/priority/score; detail is nice-to-have
**Effort:** ~1h

### What it does
Expand the "Score breakdown detail coming soon" placeholder into a visual breakdown showing how the hit score was computed:
- Macro-region weight contribution (Americas 1.0, Europe 1.0, MEA 0.8, APAC 0.7, Others 0.5)
- Article count factor
- Signal type diversity factor
- Known partner bonus (if applicable)

### Implementation notes
- Currently hit_score = macro-region weight only (computed in `hitlist/route.ts` via `getMacroRegionWeight`)
- To make breakdown meaningful, first expand the scoring formula to include article count + signal diversity
- Then return a `score_breakdown: { region_weight, article_factor, signal_factor, partner_bonus }` object from the API
- Render as a horizontal stacked bar or simple table in the Score Breakdown strip

### Files to touch
- `src/app/api/hitlist/route.ts` — compute and return breakdown factors
- `src/lib/types.ts` — add `score_breakdown` to `DspHitListEntry`
- `src/components/partner-dashboard/PartnerDashboard.tsx` — Score strip UI

---

## BACKLOG ITEM 13 — AskRadar Shared Component Extraction

**Feature:** Refactor — extract Ask Radar into reusable component
**Priority:** Medium — needed before adding Ask Radar to Pipeline card
**Effort:** ~30 min

### What it does
Extract the Ask Radar UI (currently inline in PartnerDashboard.tsx) into a shared component at `src/components/shared/AskRadar.tsx`. This enables reuse in:
- Potential Partners expanded row (current location)
- Pipeline card expanded view (Backlog Item 2, Location B)
- Any future surface that needs company intelligence

### Component spec
```typescript
type AskRadarProps = {
  companyName: string           // display name sent to API
  normalizedName: string        // used as state key
  defaultCollapsed?: boolean    // default: true
}
```

### Implementation notes
- Move all radar state (open, input, loading, result, error) into the component's local state
- Component calls `/api/radar/ask` directly
- Parent doesn't need to manage any radar state
- Replaces ~80 lines of inline JSX in PartnerDashboard with `<AskRadar companyName={dsp.name} normalizedName={dsp.normalized_name} />`

### Files to touch
- `src/components/shared/AskRadar.tsx` — new file
- `src/components/partner-dashboard/PartnerDashboard.tsx` — replace inline Ask Radar with component
- `src/components/pipeline/PipelineCard.tsx` — add component to expanded view (when ready)

---

## BACKLOG ITEM 14 — DJI Enterprise Reseller Directory Crawler

**Feature:** Alternative data source — crawl DJI's official reseller/partner pages
**Priority:** High — highest-ROI source for finding DJI Dock partners by geography
**Effort:** ~3h

### What it does
Crawl DJI Enterprise partner/reseller pages (e.g., enterprise.dji.com/where-to-buy) to discover authorized resellers and solution partners by geography. These are the companies most likely to need FlytBase's dock automation platform.

### Why this matters
Current data sources (Google News, LinkedIn, NewsAPI) find companies that *talk about* DJI Dock. The reseller directory finds companies that *sell and deploy* DJI Dock — a much stronger signal.

### Implementation notes
- Use existing Puppeteer infrastructure (`src/lib/puppeteerClient.ts`)
- Script: `scripts/scrape-dji-partners.ts`
- Target pages: DJI Enterprise "Where to Buy" by region, DJI Authorized Dealer lists
- Extract: company name, region/country, website URL, specialization
- Upsert into `discovered_companies` with `enriched_by = 'dji_reseller'`
- Cross-reference with existing `flytbase_partners` to flag overlap
- Run as a manual script (not automated) — reseller pages change infrequently

### Data model
Each scraped entry maps to `discovered_companies`:
- `normalized_name` — normalized company name
- `display_name` — original name from DJI page
- `types` — `['si']` or `['partner']`
- `website` — from DJI listing
- `countries` — from page region
- `enriched_by` — `'dji_reseller'`

### Files to create
- `scripts/scrape-dji-partners.ts` — Puppeteer crawler
- Optional: `src/app/api/sources/dji-resellers/route.ts` — API trigger for the crawl

---

## BACKLOG ITEM 15 — API Error UI for Pipeline

**Feature:** Dismissable error banner when pipeline API fails
**Priority:** Low — fire-and-forget works for hackathon, but silent failures erode trust
**Effort:** ~10 min

### What it does
When `GET /api/pipeline` fails on load, or an optimistic write (`moveStage`, `renameDeal`, `addCard`) gets a non-2xx response, show a thin red banner at the top of the Pipeline board:

```
⚠ Pipeline sync failed — changes may not be saved. [Retry] [Dismiss]
```

### Implementation notes
- Add `syncError: string | null` state to `PipelineContext`
- Set on API errors in `.catch()` blocks, clear on successful retry or dismiss
- Render banner in `PipelineBoard.tsx` above the stats bar
- "Retry" re-fetches `GET /api/pipeline` and replaces local state
- "Dismiss" clears the error (user accepts the risk)

### Files to touch
- `src/components/pipeline/PipelineContext.tsx` — add error state + retry function
- `src/components/pipeline/PipelineBoard.tsx` — render error banner

---

## BACKLOG ITEM 16 — Dismissed Companies Persistence

**Feature:** Persist Tab 2 "Dismiss" action to `discovered_companies.status` column
**Priority:** Medium — currently dismiss is local React state (lost on refresh)
**Effort:** ~15 min

### What it does
When a user clicks "Dismiss" on a company in the Potential Partners tab:
1. Optimistically hide the row (already done)
2. `PATCH /api/companies/:normalized_name/status` → sets `status = 'dismissed'`
3. On page reload, `/api/hitlist` filters out dismissed companies

### Implementation notes
- The `status` column + CHECK constraint was added to `discovered_companies` in Phase 6 migration
- Currently `dismissedSet` in PartnerDashboard is ephemeral `Set<string>` state
- Replace with: load dismissed status from hitlist response, persist via PATCH
- Undo: `PATCH` back to `status = 'active'`

### Files to touch
- `src/app/api/companies/[name]/status/route.ts` — new PATCH route
- `src/app/api/hitlist/route.ts` — filter by `status != 'dismissed'`
- `src/components/partner-dashboard/PartnerDashboard.tsx` — wire dismiss to API

---

## BACKLOG ITEM 17 — Pipeline ↔ Discovered Companies Link

**Feature:** Link pipeline leads back to `discovered_companies` for enrichment data
**Priority:** Medium — enables richer pipeline cards with website, LinkedIn, contacts
**Effort:** ~20 min

### What it does
When a card is opened in Pipeline, show enrichment data from `discovered_companies`:
- Website URL, LinkedIn URL + follower count
- Key contact from `discovered_contacts`
- Industry classification

### Implementation notes
- Add `normalized_company_name TEXT` column to `pipeline_leads` (FK to `discovered_companies`)
- Set on `POST /api/pipeline` using the existing `normalizeCompanyName()` utility
- Pipeline card expanded view: fetch enrichment via `GET /api/companies/:name`
- Display in a 3-column layout similar to Hit List expanded drawer

### Files to touch
- `supabase/migrations/` — add column
- `src/app/api/pipeline/route.ts` — set `normalized_company_name` on insert
- `src/components/pipeline/PipelineCard.tsx` — expanded view with enrichment

---

## BACKLOG ITEM 18 — Offline-Resilient Stage Move Queue

**Feature:** Queue API calls when network fails, retry on reconnect
**Priority:** Low — only relevant for unreliable networks (trade shows, airports)
**Effort:** ~30 min

### What it does
If `moveStage` or `renameDeal` API calls fail due to network error:
1. Queue the failed call in `pendingWrites` array
2. On `navigator.onLine` event or next successful call, replay the queue
3. Show small amber badge "2 pending" next to the Pipeline tab

### Implementation notes
- Queue shape: `{ endpoint: string, method: string, body: object, retries: number }`
- Max 3 retries per call, then drop with error log
- Clear queue on successful `GET /api/pipeline` (full refresh supersedes)
- Use `window.addEventListener('online', flush)`

---

## BACKLOG ITEM 19 — Manual Partner Add + LLM Auto-Enrichment

**Feature:** Add a partner directly into the Potential Partners tab by name, then auto-populate all drawer fields via LLM + external sources
**Priority:** High — BD team discovers partners outside Dock Radar's collection pipeline (conferences, referrals, LinkedIn browsing, DJI reseller lists) and needs a way to inject them
**Effort:** ~3h (UI + API + enrichment orchestration)

### What it does
A "+" button in the Potential Partners tab header opens a modal where the user types a company name (and optionally a website/LinkedIn URL). On submit:

1. **Upsert** into `discovered_companies` with `source = 'manual'`
2. **Trigger enrichment pipeline** that populates all drawer fields:
   - Tier 1 (internal): Search existing `scored_articles` for any mentions of this company → extract signal types, contacts, DJI Dock mentions, competitor overlap
   - Tier 2 (LLM): If a website URL is provided, fetch the homepage + about page, pass to LLM with a company profile extraction prompt → extract `about`, `industries`, `employee_count_hint`, `founded_year_hint`
   - Tier 3 (external): If Apollo.io is configured, call company enrichment API → fill `employee_count`, `founded_year`, `contact_linkedin`, `contact_email`
3. **Compute hit_score** using the same macro-region weight logic
4. **Return** the fully enriched `DspHitListEntry` to the frontend → company appears in the table immediately

### User flow
```
[+ Add Partner]  →  Modal: "Company Name" input + optional "Website" + optional "LinkedIn"
                     [Cancel]  [Add & Enrich]

                     → Loading spinner: "Enriching <CompanyName>..."
                     → Toast: "✓ <CompanyName> added to Potential Partners"
                     → Company appears in table with whatever data was found
                     → Missing fields show "—" (not "coming soon")
```

### LLM enrichment prompt (for website scrape)
```
You are a company intelligence analyst. Given the following website content from {{company_name}} ({{url}}), extract:

{
  "about": "<1-2 sentence company description>",
  "industries": ["<primary industry>", "<secondary if applicable>"],
  "employee_count_hint": "<range like '11-50' or '201-500' if mentioned, else null>",
  "founded_year": <integer if mentioned, else null>,
  "uses_dji_dock": <true if any mention of DJI Dock, Matrice dock, drone-in-a-box>,
  "fleet_stage_hint": "<pilot|advanced|nationwide|null>",
  "key_persons": [{"name": "...", "role": "...", "linkedin_url": "..."}]
}

Rules:
- Only extract what is explicitly stated or strongly implied
- Do not fabricate data
- Return valid JSON only
```

### API route
**POST `/api/partners/add`**

Request body:
```typescript
{
  company_name: string        // required
  website?: string            // optional — triggers website scrape + LLM extraction
  linkedin?: string           // optional — stored directly
}
```

Handler logic:
1. Normalize company name
2. Check if already exists in `discovered_companies` → if yes, return 409 with existing data
3. Insert into `discovered_companies` with `source = 'manual'`, `status = 'active'`
4. Search `scored_articles` for existing mentions (same logic as `/api/radar/ask` filtering)
5. If website provided: fetch homepage via Puppeteer, pass to LLM, extract structured fields
6. If Apollo configured: call company enrichment
7. Update `discovered_companies` with all enriched fields
8. Return full `DspHitListEntry` shape

Response:
```typescript
{
  entry: DspHitListEntry
  enrichment_status: {
    articles_found: number
    website_scraped: boolean
    apollo_enriched: boolean
  }
}
```

### Edge cases
- **Duplicate detection**: Normalize name + fuzzy match against existing companies. If Jaccard ≥ 0.8, warn "Similar company already exists: <name>. Add anyway?"
- **Enrichment partial failure**: If website scrape fails or Apollo is not configured, still add the company with whatever data is available. Show "Partially enriched" indicator.
- **Existing article linkage**: If the manually added company matches existing scored_articles (by normalized name or entity name), those articles should appear in the Source Articles section immediately — the company was being tracked without the user knowing.

### DB changes
- Add `source TEXT DEFAULT 'article'` column to `discovered_companies` if not present (values: `'article'`, `'manual'`, `'dji_reseller'`, `'csv_import'`)

### Files to create/touch
- `src/app/api/partners/add/route.ts` — new POST route with enrichment orchestration
- `src/components/partner-dashboard/PartnerDashboard.tsx` — add "+" button in tab header, modal UI
- `src/lib/types.ts` — extend `DspHitListEntry` with `source?: string`
- `supabase/migrations/` — add `source` column if needed

---

## BACKLOG ITEM 20 — Drawer Data Enrichment Pipeline (3-Tier Strategy)

**Feature:** Systematic enrichment of all expanded drawer fields across Company, Drone Program, and Decision Maker columns
**Priority:** High — the expanded drawer is the primary qualification surface for BD decisions
**Effort:** Phase A: 1.5h, Phase B: 1.5h, Phase C: 3h+

### Enrichment tiers (execute in order)

#### Phase A — Zero-Cost (data already in pipeline, just not surfaced)
| ID | Field | Source | Change |
|---|---|---|---|
| T1.1 | DJI Dock confidence | Check `summary` + `entities[].name` for dock keywords, not just article `title` regex | `/api/hitlist` aggregation |
| T1.2 | Competitor mentions | Aggregate `entities` where `type = 'oem'` per company | `/api/hitlist` → return `competitors: string[]` |
| T1.3 | Top 3 contacts | `persons_freq` already has all persons; return top 3 not just top 1 | `/api/hitlist` → return `contacts[]` |
| T1.4 | Seniority flag | Parse `key_contact.role` with keyword matching (CEO/CTO → C-Level, VP/Director → VP/Director) | Frontend logic |
| T1.5 | Signal timeline | Group `articles[]` by month + signal_type, render horizontal badge timeline | Frontend visualization |
| T1.6 | Contact LinkedIn URL | `Person` type already has optional `linkedin_url` — pass through in `key_contact` | `/api/hitlist` + types |

#### Phase B — LLM Extraction Enhancement (extend scoring prompt)
| ID | Field | Scoring Prompt Addition |
|---|---|---|
| T2.1 | `uses_dji_dock: boolean` | LLM checks for DJI Dock / Matrice Dock / drone-in-a-box mentions in article body |
| T2.2 | `fleet_stage_hint: "pilot"\|"advanced"\|"nationwide"\|null` | LLM infers from deployment context |
| T2.3 | `deployment_scale: { drone_count?, site_count?, note? }` | LLM extracts fleet size hints |
| T2.4 | `company_summary: string\|null` | LLM generates 1-line description (score >= 50 only) |

Aggregation rules in `/api/hitlist`:
- `uses_dji_dock` = true if ANY article says true
- `fleet_stage` = most advanced across all articles (nationwide > advanced > pilot)
- `company_summary` = from highest-scoring article
- `deployment_scale` = sum drone_count, max site_count

#### Phase C — External API Enrichment
| ID | Field | Source | Notes |
|---|---|---|---|
| T3.1 | Employee count | Apollo.io company search | 1 credit per company |
| T3.2 | Founded year | Apollo.io (same call) | Included |
| T3.3 | Company description fallback | LinkedIn company page scrape (Puppeteer) | Fallback when T2.4 is null |
| T3.4 | Contact email | Apollo.io people search | 1 credit per person |
| T3.5 | Contact LinkedIn URL | Apollo.io (same call) | Included |
| T3.6 | DJI reseller flag | DJI Enterprise website crawl | See Backlog Item 14 |

### DB columns needed
```sql
ALTER TABLE discovered_companies ADD COLUMN IF NOT EXISTS uses_dji_dock BOOLEAN;
ALTER TABLE discovered_companies ADD COLUMN IF NOT EXISTS fleet_stage TEXT;
ALTER TABLE discovered_companies ADD COLUMN IF NOT EXISTS deployment_scale JSONB;
ALTER TABLE discovered_companies ADD COLUMN IF NOT EXISTS company_summary TEXT;
ALTER TABLE discovered_companies ADD COLUMN IF NOT EXISTS employee_count TEXT;
ALTER TABLE discovered_companies ADD COLUMN IF NOT EXISTS founded_year INTEGER;
ALTER TABLE discovered_companies ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'article';
```

### Files to touch
- `src/lib/scoring-prompt.ts` — extend JSON output schema with T2.1-T2.4 fields
- `src/app/api/hitlist/route.ts` — aggregation logic for new fields + return extended `DspHitListEntry`
- `src/lib/types.ts` — extend `DspHitListEntry`, `ScoredArticle`, `Person`
- `src/components/partner-dashboard/PartnerDashboard.tsx` — replace "coming soon" placeholders with real data or "—"
- `supabase/migrations/` — new migration for additional columns

---

*Last updated: 2026-03-21 · Dock Radar Hackathon Sprint*
