# Contact Enrichment Strategy: 3+ Contacts Per Company

## 1. Current Enrichment Availability

### New Companies (34 DSPs from Hit List)
**Current Status**: Fully extractable for contact enrichment

| Field | Available | Source | Coverage |
|-------|-----------|--------|----------|
| Company Name | ✅ Yes | Scored Articles | 100% (34/34) |
| Website | ✅ Yes (enriched) | Serper regex crawl | ~80% (discovered_companies table) |
| LinkedIn | ✅ Yes (enriched) | Serper regex crawl | ~70% (discovered_companies table) |
| Country | ✅ Yes | Scored Articles + enrichment | 100% |
| Industry | ✅ Yes | LLM extraction | ~95% |
| Contact Names | ✅ Yes (partial) | Article text (LLM persons extraction) | ~60% (avg 2-3 per article) |

**Data Flow**:
```
Articles → Scored Articles (with persons[] array)
         → discovered_companies (website, LinkedIn via enrichment)
         → Multi-source table (verified records)
```

---

## 2. "Lens" for Verified Records in Multi-Source Table

### Verification Structure
[src/app/api/utilities/company-enrichment/route.ts](src/app/api/utilities/company-enrichment/route.ts#L10-L14)

```typescript
type VerificationEntry = {
  method: string;           // "web_search" | "linkedin" | "news" | "filing" | "linkedin_post"
  hits: number;             // # of mentions/confirmations found
  url: string | null;       // Source URL of verification
  relevance: string;        // "high" | "medium" | "low"
  at: string;               // ISO timestamp of verification
  keywords_matched: string[]; // ["DJI Dock", "deployment", "dock2"]
  post_date: string | null; // For LinkedIn posts
  note: string | null;      // "Deployment confirmed in case study"
};
```

### "Lens" Scoring Logic
Each company in `multi_sources_companies_import` has:
- **source_count**: # of independent data sources (CSV upload, web, LinkedIn, news, filing)
- **source_types**: Array of methods used
- **verifications**: Array of VerificationEntry (proof of dock deployment)
- **dock_verified**: Boolean flag (true = verified dock deployment signal)
- **dock_models**: String (e.g., "Dock 2" or "Dock2, Dock Pro")
- **matches_priority**: Boolean (sourceCount >= 2 AND verifications > 0)

### Current "Verified Records" Definition
**From [src/app/api/utilities/company-enrichment/route.ts](src/app/api/utilities/company-enrichment/route.ts#L49-L50)**:

```typescript
const matchesPriority = sourceCount >= 2 && evidenceCount > 0;
// i.e., verified = "multi-source confirmation" + "dock-specific evidence URLs"
```

**Lens Criteria**:
1. ✅ Multiple independent sources (≥2)
2. ✅ Dock-specific keywords in verifications (DJI Dock, Dock2, deployment)
3. ✅ Non-zero evidence URL count
4. ✅ dock_verified flag set to true

---

## 3. Approach to Enrich with 3+ Contacts Per Company

### Current Pipeline (1-2 contacts per company)
**[src/app/api/contacts/route.ts](src/app/api/contacts/route.ts#L1-L183)**

**Step 1**: Domain Resolution
```typescript
// For each org, resolve domain via:
// 1. Manual override (user-provided) — highest priority
// 2. Apollo Org Enrich (free) — production standard
// 3. Lemlist Company DB — fallback
// 4. Null — no domain found
```

**Step 2**: Person Enrichment (1 per contact)
```typescript
// For each extracted person:
// 1. Apollo People Match (email + LinkedIn)
// 2. Lemlist Email Waterfall (if Apollo fails)
// Result: 1 contact with email + LinkedIn
```

**Step 3**: Discovery (2 for orgs with no extracted persons)
```typescript
// For target orgs without article-extracted persons:
// Apollo People Search (seniority: owner, founder, c_suite, vp, director)
// Limit: 2 contacts per org
```

---

## 4. Proposed 3+ Contact Strategy

### Architecture: Multi-Tier Extraction

#### **Tier 1: Article-Extracted Contacts** (High Priority)
- **Source**: LLM persons extraction from scored_articles.persons[]
- **Count**: Up to 2-3 per company (article mentions)
- **Enrichment**: Apollo Match → Lemlist Waterfall for email
- **Status**: "Verified" (explicitly named in article)

**Implementation**:
```typescript
// Current:  persons.map(p => enrichPerson(p))
// Proposed: persons.filter(p => p.priority === 'high').map(p => enrichPerson(p))
//           + persons.filter(p => p.priority === 'medium').slice(0, 1).map(p => enrichPerson(p))
```

---

#### **Tier 2: Apollo Executive Discovery** (Medium Priority)
- **Source**: Apollo People Search by domain + seniority filters
- **Count**: 3-4 per company (orgs with NO article-extracted persons)
- **Filters**: Owner, Founder, C-Suite, VP, Director
- **Enrichment**: Apollo returns email + LinkedIn (free search, 1 credit per email)
- **Status**: "Estimated" or "Inferred"

**Current Implementation** [src/app/api/contacts/route.ts#L142-L160]:
```typescript
const discovered = await apolloFindPeopleAtOrg(org, domain, extractedNames, 2);
// Limit: 2 contacts — NEEDS INCREASE TO 3-4
```

**Fix**:
```typescript
const discovered = await apolloFindPeopleAtOrg(org, domain, extractedNames, 4);
// Increase limit to 4 per company
```

---

#### **Tier 3: Lemlist People Database** (Lower Priority)
- **Source**: Lemlist 450M-contact database search
- **Count**: 2-3 per company (if Apollo returns < 3)
- **Filters**: Role keyword matching (e.g., "procurement", "operations", "director")
- **Enrichment**: Email via Lemlist API (5 credits per found email)
- **Status**: "Unverified" or "Estimated"

**Current Implementation** [src/lib/lemlist.ts#L188-L210]:
```typescript
export async function findPeopleAtOrg(
  organizationName: string,
  excludeNames: string[],
  limit = 2,  // ← INCREASE TO 3
): Promise<LemlistContact[]>
```

---

### Proposed Implementation Flow

```
┌─ New Company (scored_articles + discovered_companies) ──────┐
│                                                             │
├─ TIER 1: Article-Extracted Persons (High Priority)         │
│  ├─ persons[] array from LLM extraction                      │
│  ├─ Filter: priority='high' (named explicitly)              │
│  ├─ Count: 1-3 persons                                      │
│  └─ Enrich: Apollo Match → Lemlist Waterfall → Email        │
│                                                             │
├─ TIER 2: Apollo Executive Discovery (Medium Priority)       │
│  ├─ Input: domain + org name                                │
│  ├─ Apollo: Search by seniority (C-suite, VP, etc.)        │
│  ├─ Count: 3-4 executives                                   │
│  ├─ Dedup: Filter out extracted names from Tier 1          │
│  └─ Enrich: Apollo returns email + LinkedIn                │
│                                                             │
├─ TIER 3: Lemlist People DB (Lower Priority)                │
│  ├─ If Tier 2 < 3 contacts:                                │
│  ├─ Lemlist search: org name + role keywords               │
│  ├─ Count: 2-3 additional contacts                         │
│  ├─ Dedup: Filter extracted + Apollo names                 │
│  └─ Enrich: Email via Lemlist API (5 credits/email)        │
│                                                             │
└─ OUTPUT: 3-7 contacts per company (weighted by priority) ──┘
```

---

## 5. Implementation Checklist

### Phase 1: Increase Current Limits
```typescript
// File: src/app/api/contacts/route.ts
Line 145: apolloFindPeopleAtOrg(org, domain, extractedNames, 2)
          → Change to: apolloFindPeopleAtOrg(org, domain, extractedNames, 4)

// File: src/lib/lemlist.ts
Line 188: findPeopleAtOrg(organizationName, excludeNames, limit = 2)
          → Change to: findPeopleAtOrg(organizationName, excludeNames, limit = 3)
```

**Cost Impact**:
- Apollo: No cost increase (people discovery is free)
- Lemlist: 3 credits × 34 companies = 102 credits/run (if all return emails)
- Email verification: 6 verifications/run max (already capped)

---

### Phase 2: Add Tier 3 Lemlist Fallback
```typescript
// File: src/app/api/contacts/route.ts
// After Apollo discovery, if contact count < 3:

const contactsPerOrg = new Map<string, number>();
contacts.forEach(c => {
  const count = (contactsPerOrg.get(c.organization) ?? 0) + 1;
  contactsPerOrg.set(c.organization, count);
});

// For orgs with < 3 contacts, try Lemlist people search
for (const org of orgsNeedingDiscovery) {
  if ((contactsPerOrg.get(org) ?? 0) < 3) {
    const lemlistPeople = await findPeopleAtOrg(org, extractedNames, 3);
    for (const person of lemlistPeople) {
      contacts.push({
        name: person.full_name,
        title: person.title,
        organization: org,
        email: null,
        emailStatus: 'not_found',
        emailSource: null,
        linkedinUrl: null,
        isFromArticle: false,
      });
    }
  }
}
```

---

### Phase 3: Prioritization & UI Badges
```typescript
// Contact priority markers:
// 🔴 HIGH    = Article-extracted + verified email (Apollo or Lemlist)
// 🟡 MEDIUM  = Apollo discovery (executive) with email
// 🟢 LOWER   = Lemlist database match (unverified)
// ⚪ NONE    = No email (decision-maker guessed by role inference)
```

---

## 6. Multi-Source Table Integration

### Storing Enriched Contacts in multi_sources_companies_import

```sql
-- Extend multi_sources_companies_import schema:
ALTER TABLE multi_sources_companies_import ADD COLUMN IF NOT EXISTS contacts JSONB DEFAULT '[]';

-- Contact schema:
{
  "contacts": [
    {
      "name": "John Smith",
      "title": "Head of Operations",
      "email": "john.smith@company.com",
      "emailStatus": "found",     -- verified | estimated | not_found
      "emailSource": "apollo",    -- apollo | lemlist | article | inferred
      "linkedinUrl": "https://linkedin.com/in/johnsmith",
      "priority": "high",         -- high | medium | low
      "source": "article",        -- article | apollo | lemlist
      "verifiedAt": "2026-04-01T10:32:00Z"
    },
    ...
  ]
}
```

**Query Example**:
```sql
SELECT 
  normalized_name,
  display_name,
  country_code,
  dock_verified,
  jsonb_array_length(contacts) as contact_count,
  contacts
FROM multi_sources_companies_import
WHERE dock_verified = true
AND jsonb_array_length(contacts) >= 3
ORDER BY updated_at DESC
LIMIT 20;
```

---

## 7. Cost Analysis (Current: 34 DSPs)

| Phase | Resource | Per Company | Total (34) | Notes |
|-------|----------|-------------|-----------|-------|
| Tier 1 | Lemlist credits | 2-3 | 68-102 | If all persons found |
| Tier 2 | Apollo credits | 0 | 0 | Discovery is free |
| Tier 2 | Lemlist credits | 0-1 | 0-34 | If Apollo returns emails |
| Tier 3 | Lemlist credits | 1-2 | 34-68 | If needed for < 3 contacts |
| Email Verify | Lemlist credits | 0.5 | ~17 | Max 6 verifications/run |
| **Total** | | **3-6.5** | **~160-220** | Per run (weekly = ~900 credits) |

**Current Lemlist Limits**: 1000 credits/month = ~5 enrichments/week at this scale

---

## 8. Recommended Approach

### For 34 DSPs Today:
1. **Start with Tier 1 + 2** (existing Apollo integration)
   - Increase Apollo limit from 2 → 3 contacts
   - Cost: 0 (discovery is free)
   - Timeline: 10 minutes to implement

2. **Add Tier 3 as fallback** (Lemlist people DB)
   - Only for orgs with < 3 contacts
   - Cost: ~50-80 credits/run
   - Timeline: 30 minutes to implement

3. **Skip email verification for now**
   - Preserve credits for contact discovery
   - Can enable selectively for high-priority (High-value DSPs)

---

## 9. Business Impact

### Expected Results Per Company:
- **Before**: 1-2 contacts (article-extracted only)
- **After**: 3-5 contacts (article + Apollo + Lemlist)
- **Coverage**: 90%+ of DSPs with 3+ verified decision-makers

### Use Cases:
1. **ABM Campaign**: 3-5 personalized messages per company (LinkedIn Sales Nav)
2. **Outreach Sequencing**: Fallback contacts if primary email bounces
3. **Account Mapping**: Multiple stakeholders = better context for deal
4. **Verification**: Cross-reference emails across APIs (Apollo vs Lemlist)

---

## 10. Next Steps

1. **Review & Approval**: Confirm approach with team
2. **Phase 1 Implementation**: Increase Apollo limit (10 min)
3. **Phase 2 Implementation**: Add Lemlist fallback (30 min)
4. **Testing**: Run on 5 DSPs, validate output quality
5. **Deployment**: Enable for all 34 DSPs
6. **Monitoring**: Track credit burn, contact quality, email bounce rates
