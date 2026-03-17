# Data Enrichment Agent — Standalone Testing Utility

## Spec v1.0 | 2026-03-16

---

## 1. Problem Statement

Testing the data extraction and enrichment pipeline currently requires running the full 3-step signal flow (Collect → Score → Deep-dive). This is:

- **Time-consuming**: Each full run takes minutes and processes many articles
- **Expensive**: Unnecessary LLM calls, Apollo lookups, and Lemlist verifications on articles we don't care about
- **Poor feedback loop**: Can't iterate quickly on extraction quality, prompt tuning, or API integration issues

We need a standalone utility accessible from the top nav that lets a user paste a single article URL and immediately see the full extraction + enrichment output — same quality as the production pipeline, zero pipeline overhead.

---

## 2. Goals

1. **Independent testing** of article extraction and contact enrichment without running the full pipeline
2. **Fast iteration** on LLM prompt quality, field extraction accuracy, and API integrations
3. **Guardrailed output** to limit API costs and keep results reviewable
4. **Production-identical logic** — the same code path used here will be integrated into the main pipeline
5. **Top-nav accessible** as a first-class utility in the Dock Radar app

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│                                                          │
│  /enrichment-lab  (new route, top-nav link)              │
│  ┌──────────────────────────────────────────────────┐    │
│  │  URL Input + Config Panel                         │    │
│  │  ─────────────────────────────────────────────── │    │
│  │  Step-by-step progress indicator                  │    │
│  │  ─────────────────────────────────────────────── │    │
│  │  Results: Extraction Card + Contacts Table        │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────────────┘
                       │ POST /functions/v1/enrichment-lab
                       ▼
┌─────────────────────────────────────────────────────────┐
│             Supabase Edge Function                       │
│             supabase/functions/enrichment-lab/index.ts    │
│                                                          │
│  Phase 1: Fetch article (Jina Reader)                    │
│  Phase 2: LLM extraction (companies + people + signals)  │
│  Phase 3: Apollo exec discovery (guardrailed)            │
│  Phase 4: Lemlist email verification (guardrailed)       │
│                                                          │
│  Returns: SSE stream with phase-by-phase results         │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Guardrail Conditions (LOCKED)

These limits control how many companies/people are extracted and enriched per article. The purpose is to cap API calls and keep the UI reviewable.

### 4.1 Company Extraction Limits

| Scenario | Max Companies | Max People per Company | Max Total People |
|----------|--------------|----------------------|-----------------|
| 1 company in article | 1 | 4 | 4 |
| 2 companies in article | 2 | 3 | 6 |
| 3+ companies in article | 3 (top 3 by relevance) | 3 | 9 |

**Rules:**
- LLM extracts ALL companies mentioned, but the system caps at **3 most relevant** (by signal strength / buyer proximity)
- Relevance ranking: Direct buyer > Operator/Deployer > Partner/SI > Regulator > OEM (excluded)
- OEM blocklist companies (DJI, Skydio, Autel, Parrot, etc.) are **never counted** toward the 3-company cap
- If only 1 company is found, allow up to 4 people for richer context
- If 2-3 companies, cap at 3 people each to keep total manageable

### 4.2 People Extraction Limits

- **From article (LLM)**: Extract named individuals + up to 1 inferred decision-maker per company
- **From Apollo**: Fill remaining slots up to the per-company cap with exec search results
- **Combined total per company** = article-extracted + Apollo-discovered, capped per table above
- **Dedup**: Match by first name + company to prevent duplicates across article and Apollo sources

### 4.3 Email Verification Limits

- **Lemlist verification**: Only for High-priority named contacts
- **Max verifications per run**: 6 (same as current `enrich-contacts-test`)
- **Polling**: 2-second intervals, max 30 seconds per contact

### 4.4 Guardrail Summary for LLM Prompt

Include in the system prompt:
```
GUARDRAIL: Extract a maximum of 3 companies (ranked by buyer proximity).
- If 1 company: extract up to 4 people (named + 1 inferred decision-maker)
- If 2-3 companies: extract up to 3 people each
- Exclude OEM/manufacturer companies from the company count
- Total people across all companies must not exceed 9
```

---

## 5. Backend: Edge Function Spec

### 5.1 Function: `supabase/functions/enrichment-lab/index.ts`

**Endpoint**: `POST /functions/v1/enrichment-lab`

**Request body:**
```typescript
{
  articleUrl: string;          // Required — the article to analyze
  skipApollo?: boolean;       // Default false — skip Apollo exec search
  skipVerification?: boolean;  // Default false — skip Lemlist email verification
  llmProvider?: string;       // Default "openai" — LLM provider to use
}
```

**Response**: SSE stream (text/event-stream) with the following event types:

```typescript
// Phase progress updates
{ type: "phase_start", phase: 1 | 2 | 3 | 4, label: string }
{ type: "phase_complete", phase: 1 | 2 | 3 | 4, data: object }

// Phase 1 complete — article fetched
{ type: "phase_complete", phase: 1, data: {
  title: string;
  contentLength: number;
  contentPreview: string;       // First 500 chars
  sourceUrl: string;
}}

// Phase 2 complete — LLM extraction done
{ type: "phase_complete", phase: 2, data: {
  extraction: ArticleExtraction;  // See §5.2
  companiesFound: number;
  companiesCapped: number;        // After guardrail
  peopleFound: number;
  peopleCapped: number;           // After guardrail
  llmModel: string;
  promptTokens: number;
  completionTokens: number;
}}

// Phase 3 complete — Apollo enrichment done
{ type: "phase_complete", phase: 3, data: {
  apolloContacts: EnrichedContact[];
  companiesSearched: number;
  newContactsAdded: number;
}}

// Phase 4 complete — email verification done
{ type: "phase_complete", phase: 4, data: {
  verificationsAttempted: number;
  verificationsSucceeded: number;
  contacts: EnrichedContact[];     // Final merged list
}}

// Final result
{ type: "complete", data: {
  extraction: ArticleExtraction;
  contacts: EnrichedContact[];
  stats: RunStats;
}}

// Error at any phase
{ type: "error", phase?: number, message: string }
```

### 5.2 ArticleExtraction Type (New)

This combines fields from both `score-articles` and `deep-dive` into a single extraction output for the lab:

```typescript
interface ArticleExtraction {
  // Article metadata
  title: string;
  titleEn?: string;              // English translation if non-English source
  sourceUrl: string;
  language: string;

  // Signal fields (from score-articles logic)
  company: string;                // Primary company
  country: string;
  city?: string;
  useCaseCategory: string;
  buyingIntentType: BuyingIntentType;
  signalType: string;
  dealValue?: string;
  unitsMentioned?: string;
  flytbaseMentioned: boolean;

  // Scoring (from score-articles logic)
  buyingIntentScore: number;      // 0-50
  leadClarityScore: number;       // 0-30
  sourceQualityScore: number;     // 0-20
  bdImpactScore: number;          // Sum, 0-100
  whyItMatters: string;
  confidence: string;

  // Companies (guardrailed)
  companies: CompanyExtraction[];  // Max 3

  // People (guardrailed, pre-Apollo)
  people: PersonExtraction[];

  // Opportunity assessment (from deep-dive logic)
  opportunityScore: number;       // 0-100
  urgencyLevel: "HIGH" | "MEDIUM" | "LOW";
  strategicEntryPoint?: string;
  partnershipAngle?: string;
  riskFactors?: string;
  crmReadyNotes?: string;
}

interface CompanyExtraction {
  name: string;
  role: "buyer" | "operator" | "partner" | "si" | "regulator";
  domain?: string;               // If discoverable from article
  website?: string;
  country?: string;
  industry?: string;
}

interface PersonExtraction {
  name: string;
  title?: string;
  company: string;               // Must match a CompanyExtraction.name
  source: "article_named" | "article_inferred";
  email?: string;
  emailConfidence?: "Explicit" | "Estimated";
  linkedinUrl?: string;
}
```

### 5.3 Processing Pipeline (4 Phases)

**Phase 1: Article Fetch**
- Fetch via Jina Reader: `https://r.jina.ai/{articleUrl}`
- Truncate to 15,000 chars
- Extract title from Jina response headers
- Stream `phase_start` → `phase_complete` with preview

**Phase 2: LLM Extraction**
- Single LLM call with combined prompt (scoring + extraction + opportunity assessment)
- Apply guardrails post-extraction:
  1. Count companies (exclude OEM blocklist)
  2. Sort by buyer proximity
  3. Cap at 3 companies
  4. Cap people per company (4 if 1 company, 3 if 2-3 companies)
- Stream `phase_complete` with full extraction + guardrail stats

**Phase 3: Apollo Exec Discovery** (skippable)
- For each guardrailed company (max 3):
  1. `apolloFindCompanyDomain()` — resolve domain
  2. `apolloSearchExecutives()` — search by domain, seniority filter (owner, founder, c_suite, vp, director)
  3. Cap new contacts: fill remaining slots up to per-company limit
  4. Dedup by first name + company against article-extracted people
- Stream `phase_complete` with Apollo contacts + stats

**Phase 4: Email Verification** (skippable)
- Select High-priority contacts with email but no verification
- Cap at 6 verifications per run
- Use Lemlist `findEmailWithLemlist()` with 2-second polling
- Update `emailConfidence` and `hunterVerified` fields
- Stream `phase_complete` with verification results

### 5.4 Reuse Strategy

The edge function should import shared utilities from the existing codebase:

| Utility | Source | Purpose |
|---------|--------|---------|
| `callLLM()` | `_shared/llm.ts` | Multi-provider LLM abstraction |
| `apolloSearchExecutives()` | Extract from `deep-dive/index.ts` or `enrich-contacts-test/index.ts` | Apollo API integration |
| `apolloFindCompanyDomain()` | Extract from `deep-dive/index.ts` | Domain resolution |
| `findEmailWithLemlist()` | Extract from `deep-dive/index.ts` | Email verification |
| OEM blocklist | Extract from `enrich-contacts-test/index.ts` | Company filtering |

**Refactoring recommendation**: Move `apolloSearchExecutives`, `apolloFindCompanyDomain`, `findEmailWithLemlist`, and the OEM blocklist into `_shared/enrichment-utils.ts` so all three functions (`enrichment-lab`, `deep-dive`, `enrich-contacts-test`) can share them.

---

## 6. Frontend: Page Spec

### 6.1 Route & Navigation

- **Route**: `/enrichment-lab`
- **Nav link**: In `Header.tsx`, replace or rename the existing "Data Enrichment Agent" link to point to `/enrichment-lab`
- **Icon**: `FlaskConical` from lucide-react (lab/testing metaphor)
- **Label**: "Enrichment Lab"
- **Page component**: `src/pages/EnrichmentLab.tsx`

### 6.2 Page Layout

The page uses the same `Header` component as the rest of the app. Below the header:

```
┌─────────────────────────────────────────────────────────┐
│  Header (shared, with "Enrichment Lab" active in nav)    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─ Input Section ────────────────────────────────────┐  │
│  │  Article URL  [________________________] [Analyze]  │  │
│  │                                                     │  │
│  │  Options (collapsible):                             │  │
│  │  [x] Apollo Exec Search   [x] Email Verification   │  │
│  │  LLM: [GPT-4o ▼]                                   │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ Progress Section (visible during processing) ─────┐  │
│  │  Phase 1: Fetching article...        ✓ Done (1.2s)  │  │
│  │  Phase 2: Extracting with LLM...     ● Running      │  │
│  │  Phase 3: Apollo exec search         ○ Pending      │  │
│  │  Phase 4: Email verification         ○ Pending      │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ Results Section ──────────────────────────────────┐  │
│  │                                                     │  │
│  │  ┌─ Extraction Card ─────────────────────────────┐ │  │
│  │  │  Article title + source                        │ │  │
│  │  │  Score ring (bdImpactScore) + bands            │ │  │
│  │  │  Signal: buyingIntentType + urgency            │ │  │
│  │  │  Companies: chips with role badges             │ │  │
│  │  │  Why it matters: text                          │ │  │
│  │  │  Opportunity: entry point + partnership angle  │ │  │
│  │  │  CRM notes: copyable bullets                   │ │  │
│  │  └────────────────────────────────────────────────┘ │  │
│  │                                                     │  │
│  │  ┌─ Contacts Table ──────────────────────────────┐ │  │
│  │  │  Grouped by company                            │ │  │
│  │  │  Columns: Name, Title, Email, Confidence,      │ │  │
│  │  │           Source, Priority, LinkedIn            │ │  │
│  │  │  Guardrail badge: "3/3 people (capped)"        │ │  │
│  │  └────────────────────────────────────────────────┘ │  │
│  │                                                     │  │
│  │  ┌─ Raw JSON Toggle ─────────────────────────────┐ │  │
│  │  │  Collapsible raw JSON output for debugging     │ │  │
│  │  └────────────────────────────────────────────────┘ │  │
│  │                                                     │  │
│  │  ┌─ Stats Footer ────────────────────────────────┐ │  │
│  │  │  LLM: GPT-4o | Tokens: 1,234 in / 567 out    │ │  │
│  │  │  Apollo calls: 3 | Verifications: 4/6         │ │  │
│  │  │  Total time: 12.3s                             │ │  │
│  │  └────────────────────────────────────────────────┘ │  │
│  │                                                     │  │
│  │  [Export CSV]  [Copy JSON]                          │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 6.3 UI Component Breakdown

#### 6.3.1 Input Section

| Element | Details |
|---------|---------|
| URL input | Text field, placeholder: "Paste an article URL to analyze...", validates URL format |
| Analyze button | Primary button, disabled when empty or loading. Shows spinner during processing |
| Options toggle | Collapsible section (default collapsed), contains: |
| - Apollo checkbox | Default checked. Label: "Apollo Exec Search". Unchecked = skips Phase 3 |
| - Verification checkbox | Default checked. Label: "Email Verification". Unchecked = skips Phase 4 |
| - LLM selector | Dropdown, default "GPT-4o", disabled with tooltip "More models coming soon" (Phase 1) |

#### 6.3.2 Progress Section

- Vertical stepper with 4 phases
- Each phase shows: phase label, status icon (checkmark/spinner/circle), elapsed time
- Phase labels:
  1. "Fetching article content"
  2. "Extracting signals & contacts (LLM)"
  3. "Discovering executives (Apollo)"
  4. "Verifying emails (Lemlist)"
- Skipped phases show "Skipped" in muted text
- On error: phase turns red with error message inline

#### 6.3.3 Extraction Card

Displays the `ArticleExtraction` output. Design should mirror the existing `OpportunityCard` component's structure:

- **Header row**: Article title (linked to source), language badge if non-English
- **Score ring**: Circular progress showing `bdImpactScore` (0-100) with color bands matching Step 2 scoring bands
- **Score breakdown**: Three mini-bars: Buying Intent (x/50), Lead Clarity (x/30), Source Quality (x/20)
- **Signal chips**: `buyingIntentType` badge, `urgencyLevel` badge, `useCaseCategory` tag
- **Companies section**: Horizontal chips, each showing company name + role badge (buyer/operator/partner/si/regulator)
- **Location**: Country + City (if available)
- **Why it matters**: Paragraph text
- **Opportunity assessment**: Entry point, partnership angle, risk factors (collapsible)
- **CRM notes**: Bullet list with "Copy to clipboard" button
- **FlytBase mentioned**: Boolean badge (green check / gray dash)

#### 6.3.4 Contacts Table

Grouped by company. Each company group shows:

- **Company header row**: Company name, domain, role badge, people count vs cap (e.g., "3/3 capped")
- **Contact rows** (same column structure as existing `EnrichTest.tsx` and `OpportunityCard.tsx`):

| Column | Content |
|--------|---------|
| Name | Person name (bold if High priority) |
| Title | Role/title |
| Email | Email with copy-on-click, or "—" if not found |
| Confidence | Badge: Verified (green), Estimated (yellow), Not Found (gray) |
| Source | Badge: "Article" (gray), "Inferred" (outline), "Apollo" (blue) |
| Priority | High (red), Medium (yellow), Low (gray) |
| LinkedIn | Icon link, opens in new tab |

- **Guardrail indicator**: If people were capped, show a subtle info banner: "Showing 3 of 5 people found (guardrail: max 3 per company when multiple companies detected)"

#### 6.3.5 Raw JSON Toggle

- Collapsible section, default collapsed
- Shows full JSON response (extraction + contacts + stats)
- Syntax-highlighted, copyable
- Useful for debugging prompt output and API responses

#### 6.3.6 Stats Footer

Single row of metrics:
- LLM model used
- Token usage (prompt + completion)
- Apollo API calls made
- Email verifications attempted/succeeded
- Total processing time

#### 6.3.7 Export Actions

- **Export CSV**: Downloads all contacts as CSV (same format as existing `EnrichTest.tsx` export)
- **Copy JSON**: Copies full result JSON to clipboard

### 6.4 State Management

All state is local to the page component (no global state needed):

```typescript
// Input state
articleUrl: string
skipApollo: boolean
skipVerification: boolean

// Processing state
isProcessing: boolean
currentPhase: number | null
phaseResults: Record<number, { status: 'pending' | 'running' | 'done' | 'skipped' | 'error', data?: any, elapsed?: number }>

// Result state
extraction: ArticleExtraction | null
contacts: EnrichedContact[] | null
stats: RunStats | null
rawJson: string | null
error: string | null
```

### 6.5 SSE Consumption

The frontend connects to the edge function via `fetch()` and reads the SSE stream using a `ReadableStream` reader (same pattern as `Step2Panel.tsx` uses for `score-articles`). Each event updates the corresponding phase state and renders progressively.

---

## 7. Interaction Flows

### 7.1 Happy Path

1. User navigates to Enrichment Lab via top nav
2. Pastes article URL, clicks "Analyze"
3. Progress stepper shows Phase 1 → 2 → 3 → 4 completing
4. Results render progressively (extraction card appears after Phase 2, contacts table updates after Phase 3 and 4)
5. User reviews extraction quality, checks contact accuracy
6. Optionally exports CSV or copies JSON

### 7.2 Skip Apollo/Verification

1. User expands options, unchecks "Apollo Exec Search"
2. Clicks "Analyze"
3. Phase 3 shows "Skipped", Phase 4 shows "Skipped"
4. Results show only article-extracted contacts (faster, cheaper)

### 7.3 Error Handling

- **Invalid URL**: Client-side validation before submit
- **Jina fetch failure**: Phase 1 error, show message, allow retry
- **LLM error**: Phase 2 error, show error details
- **Apollo API error**: Phase 3 error, but still show Phase 2 results (partial success)
- **Lemlist timeout**: Phase 4 partial, show which contacts were verified vs timed out

### 7.4 Re-run

- User can modify URL and click "Analyze" again
- Previous results are cleared and new run starts
- No persistence to database — this is a pure testing utility

---

## 8. Files to Create / Modify

### New Files

| File | Purpose |
|------|---------|
| `supabase/functions/enrichment-lab/index.ts` | Edge function: 4-phase extraction + enrichment pipeline |
| `supabase/functions/_shared/enrichment-utils.ts` | Shared utilities: Apollo, Lemlist, OEM blocklist (refactored from existing functions) |
| `src/pages/EnrichmentLab.tsx` | Frontend page component |

### Modified Files

| File | Change |
|------|--------|
| `src/App.tsx` | Add route `/enrichment-lab` → `EnrichmentLab` |
| `src/components/signal/Header.tsx` | Update nav link to point to `/enrichment-lab` with new icon/label |
| `src/lib/types.ts` | Add `ArticleExtraction`, `CompanyExtraction`, `PersonExtraction`, `RunStats` types |
| `supabase/functions/deep-dive/index.ts` | Import shared utils from `_shared/enrichment-utils.ts` instead of inline |
| `supabase/functions/enrich-contacts-test/index.ts` | Import shared utils from `_shared/enrichment-utils.ts` instead of inline |

---

## 9. LLM Prompt Design

The enrichment-lab uses a **single combined prompt** that extracts all fields in one LLM call (cost-efficient). The prompt should be structured as a tool/function call with the following schema:

### System Prompt (outline)

```
You are a B2B drone industry intelligence analyst for FlytBase.
Analyze the article and extract structured business intelligence.

GUARDRAILS:
- Extract a maximum of 3 companies (ranked by buyer/deployment proximity)
- If 1 company found: extract up to 4 people
- If 2-3 companies found: extract up to 3 people per company
- EXCLUDE OEM/manufacturer companies from company count: [OEM_BLOCKLIST]
- Total people must not exceed 9
- All output in English regardless of article language

COMPANY ROLE RANKING (for selecting top 3):
1. buyer — org purchasing/deploying drones
2. operator — org operating drones for a client
3. partner / si — system integrator or technology partner
4. regulator — government/regulatory body
5. oem — EXCLUDED from company count

PEOPLE EXTRACTION:
- Extract named individuals mentioned in the article (exclude journalists/authors)
- For each company, infer 1 decision-maker if no named person exists
- Include: name, title/role, company, email (if mentioned), LinkedIn (if mentioned)
- Assign leadPriority: High (decision-maker, budget holder), Medium (influencer, project lead), Low (mentioned but tangential)

OUTPUT: Use the provided tool schema to return structured JSON.
```

### Tool Schema

The tool schema mirrors `ArticleExtraction` + `PersonExtraction[]` as defined in §5.2. The LLM returns a single JSON object that the backend then applies guardrails to (cap companies, cap people, filter OEMs).

---

## 10. API Keys & Environment

The edge function requires these Supabase secrets (all already configured):

| Secret | Service | Used In |
|--------|---------|---------|
| `OPENAI_API_KEY` | GPT-4o LLM calls | Phase 2 |
| `APOLLO_API_KEY` | Apollo exec search | Phase 3 |
| `LEMLIST_API_KEY` | Email verification | Phase 4 |
| `JINA_API_KEY` | Article content fetch | Phase 1 (if required, else unauthenticated) |

---

## 11. Non-Goals (Out of Scope)

- **No database persistence**: Results are not saved. This is a testing/debugging tool
- **No Slack/Email integration**: No outreach actions from this utility
- **No batch processing**: Single article at a time
- **No history**: Previous test runs are not stored or retrievable
- **No auth**: Same auth model as rest of the app (Supabase anon key)

---

## 12. Implementation Notes for Developer

1. **UI styling**: Follow existing Dock Radar design system — use the same Tailwind classes, shadcn/ui components (`Card`, `Button`, `Badge`, `Table`, `Collapsible`), and color tokens as the parent product. Reference `OpportunityCard.tsx` for card layout patterns and `EnrichTest.tsx` for table patterns.

2. **SSE pattern**: Copy the SSE consumption pattern from `Step2Panel.tsx` (lines handling `score-articles` streaming). The `fetch` + `ReadableStream` reader approach is already proven.

3. **Shared utils refactor**: Before building `enrichment-lab/index.ts`, first extract these functions from `deep-dive/index.ts` and `enrich-contacts-test/index.ts` into `_shared/enrichment-utils.ts`:
   - `apolloSearchExecutives(domain, maxResults)`
   - `apolloFindCompanyDomain(companyName)`
   - `findEmailWithLemlist(firstName, lastName, domain)`
   - `OEM_BLOCKLIST` constant
   - `isOemCompany(name)` helper
   Then update the existing functions to import from the shared module.

4. **Guardrail application**: The guardrails are applied **after** LLM extraction, not inside the prompt. The LLM may return more than the cap — the backend truncates. This keeps the prompt simpler and the guardrails deterministic.

5. **Progressive rendering**: The frontend should render results as each phase completes. Don't wait for all 4 phases. The Extraction Card should appear after Phase 2, contacts table after Phase 3, verification badges update after Phase 4.

6. **Testing scenarios to validate**:
   - Single-company article (should get up to 4 people)
   - Multi-company article (should cap at 3 companies, 3 people each)
   - OEM-heavy article (OEMs excluded from company count)
   - Non-English article (should extract in English)
   - Article with no named people (should get inferred decision-makers)
   - Apollo-only contacts (article has companies but no named people)
   - Lemlist timeout handling (verification takes too long)

---

## 13. Success Criteria

- [ ] User can paste any article URL and see extraction + enrichment results in <30 seconds
- [ ] Guardrails correctly limit companies (max 3) and people (max 4/3 per company)
- [ ] OEM companies are excluded from the company cap
- [ ] All 4 phases stream progress to the UI
- [ ] Skipping Apollo/Verification works and shows "Skipped" status
- [ ] CSV export produces the same format as the existing EnrichTest page
- [ ] Raw JSON view shows complete unmodified response for debugging
- [ ] Stats footer shows token usage and API call counts
- [ ] Once validated, the same extraction logic can be integrated into `deep-dive/index.ts` with minimal changes
