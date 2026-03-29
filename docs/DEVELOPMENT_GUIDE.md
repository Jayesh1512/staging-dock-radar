# Dock Radar — Development Guide

Reference document for all import, enrichment, and verification utilities. Every script that writes to `multi_sources_companies_import` MUST follow these rules.

## Table: multi_sources_companies_import

### Import Rules

1. **UPSERT, never blind INSERT.** Use `normalized_name + country_code` as conflict key. On conflict:
   - `source_types`: READ existing array, MERGE with new sources, WRITE back. Never overwrite.
   - `source_refs`: READ existing JSONB, merge keys, WRITE back. Never overwrite.
   - `website`, `linkedin`: Keep existing value if already populated. Only set if currently NULL.
   - `imported_via`: Never change — this records who CREATED the row.
   - `import_batch`: Never change on upsert — keeps original batch reference.

2. **normalized_name computation.** Before insert:
   - Lowercase
   - Strip legal suffixes: SAS, SARL, EURL, B.V., BV, N.V., LLC, LTD, GmbH, Inc, etc.
   - Strip parenthetical content: "DSC (Drone Security Consulting)" → "dsc"
   - Trim whitespace
   - Use `cleanCompanyName()` from `src/lib/company-name-clean.ts`

3. **normalized_domain computation.** From website URL:
   - Extract hostname, strip `www.`
   - Example: `https://www.escadrone.com/about` → `escadrone.com`

4. **import_batch naming convention:** `{source}-{country}-{date}`
   - Examples: `sirene-fr-24Mar`, `dji-dealers-global-27Mar`, `chatgpt-142-27Mar`

5. **enrichment_methods[] at import time:**
   - If source provides website/linkedin: set `['import']`
   - If source provides NO website/linkedin: set `[]`
   - After Apollo enrichment: append `'apollo'`
   - After Serper domain search: append `'serper_domain'`

6. **dock_verified at import time:**
   - If source provides evidence URL (ChatGPT, Comet): set `dock_verified = true`, create verifications entry
   - If source is DJI dealer (no evidence URL): set `dock_verified = NULL` (not yet checked)
   - If source is registry (SIRENE, ILT): set `dock_verified = NULL`

### Verification Rules

7. **Serper APPENDS, never overrides.** When Serper returns 0 hits:
   - If record already has `dock_verified = true` or existing verifications: only add `serper_hits = 0` entry to verifications array. Do NOT set `dock_verified = false`.
   - If record has no prior evidence: set `dock_verified = false`.

8. **verifications JSONB — fixed structure per entry:**
   ```json
   {
     "method": "serper|puppeteer|chatgpt|comet|dji_dealer|manual",
     "hits": 10,
     "url": "https://evidence-url.com/page",
     "relevance": "direct|indirect|mention_only",
     "at": "2026-03-28T10:00:00Z",
     "keywords_matched": ["DJI Dock", "DJI Dock 3"],
     "post_date": null,
     "note": null
   }
   ```
   All fields always present (use null for not applicable).

9. **keywords_matched — DJI Dock only.** Valid keywords:
   - `DJI Dock`
   - `DJI Dock 1`
   - `DJI Dock 2`
   - `DJI Dock 3`
   - `Dock 2` (only if "DJI" appears within 30 characters)
   - `Dock 3` (only if "DJI" appears within 30 characters)
   - NO generic "dock", NO "BVLOS", NO "drone-in-a-box"

10. **dock_models — derived field.** Always recompute from verifications array:
    - Collect all `keywords_matched` from all verification entries
    - Deduplicate and sort
    - Format as human-readable: `"DJI Dock 2, 3"`

### Evidence URL Display Priority

11. **Best evidence URL is computed at display time (not stored).** Priority:
    1. Preloaded evidence (chatgpt, comet, manual) — curated by humans
    2. Serper evidence — found on company's own website
    3. Puppeteer evidence — found on LinkedIn

### Human Review Rules

12. **dock_qa_status — human-only field.** Automated scripts NEVER write to this column.
    - `pending` — default, no human decision yet
    - `approved` — BD team confirmed as outreach target
    - `rejected` — noise, false positive, not relevant
    - `parked` — valid company but not priority now

13. **Rejected records are skipped** by enrichment and verification scripts.

### registry_meta JSONB — Fixed Structure

14. **9 fields, all nullable, same across all countries:**
    ```json
    {
      "registry_name": "SIRENE|ILT|Handelsregister|...",
      "registry_country": "FR|NL|DE|...",
      "activity_code": "30.30Z",
      "activity_description": "Construction aéronautique",
      "legal_form": "SAS|B.V.|GmbH|...",
      "employee_band": "11-50",
      "category": "PME|KMU|...",
      "permit_type": "OA|STS|...",
      "permit_id": "NLD-OAT-004"
    }
    ```

### False Positive Patterns (by country)

15. **France (SIRENE):** Reject names matching:
    `/DRONEAU|DRONET[^A-Z]|BODRONE|ANDRONE|PEDRONE|MADRONET|CHAUDRON|SANDRONE|PADRONETE|FORICHON|PIMPEC|POMPES FUNEBRES/i`
    These are surnames, places, or unrelated businesses.

16. **Other countries:** Define patterns per country as registries are imported. Add to this section.

### Phase 2 Dedup (Post-Enrichment)

17. **After enrichment fills in websites**, run dedup check by `normalized_domain`:
    - Group records by `normalized_domain + country_code`
    - If multiple records share a domain: flag for review or auto-merge
    - Keep the record with richer data (more source_types, has evidence)
    - Set `merged_to` on rejected duplicate, `dock_qa_status = 'rejected'`
