import type { Article } from './types';

/**
 * ── Canonical constants shared by ALL prompts ────────────────────────────────
 * Single source of truth for OEMs, signal types, industry taxonomy, and entity rules.
 */

/** OEM list — 14 companies that must never appear as company or DSP entity */
const OEM_LIST = 'DJI, Skydio, Autel, Parrot, senseFly, Zipline, Wing, Joby, Manna, Matternet, EHang, Flytrex, Elbit Systems, AeroVironment';

/** 5 signal types used across all scoring prompts */
const SIGNAL_TYPE_ENUM = '"DEPLOYMENT"|"CONTRACT"|"PARTNERSHIP"|"EXPANSION"|"OTHER"';

/** Signal type definitions (shared system-prompt text) */
const SIGNAL_TYPE_DEFS = `SIGNAL TYPES (choose exactly one):
- DEPLOYMENT: Active drone operations underway, fleet going live, operational expansion
- CONTRACT: Signed contracts, purchase orders, procurement announcements
- PARTNERSHIP: Technology integrations, distribution partnerships, channel deals
- EXPANSION: New markets, geographies, or verticals added to existing drone operations
- OTHER: Relevant but doesn't fit the above`;

/** Industry taxonomy reference (shared system-prompt text) */
const INDUSTRY_TAXONOMY = `INDUSTRY: Classify the industry sector of the deployment. Use these as reference examples for naming format and granularity — you are not restricted to them:
Energy & Utilities | Public Safety & Emergency Response | Oil & Gas / Industrial Assets | Mining & Natural Resources | Construction & Infrastructure | Ports, Maritime & Logistics Hubs | Agriculture & Forestry | Perimeter Security & Smart Facilities | Water & Environmental Utilities
Name any sector that accurately describes the activity. Set to null only if no industry is identifiable from the content.`;

/** 4-band scoring scale used by ALL prompts */
const SCORING_BANDS_GN = `SCORING BANDS:

DJI DOCK GATE: Content must mention "DJI Dock", "DJI Dock 2", or "DJI Dock 3" to score 25+. "Dock 2"/"Dock 3" without "DJI" prefix = -10 adjustment. No Dock mention = 0-24.

- 75-100 (Hot Lead): DJI Dock + E2 (partner/DSP/SI named) + E3 (buyer/end-client named) + E4 (deployment/contract) + E5 (use case) + E7 (geography). E8 (quoted persons) or E9 ($$/contract numbers) further strengthen.
- 50-74 (Warm Lead): DJI Dock + E2 (company identified) + E5 (use-case context, e.g. solar inspection, pipeline monitoring). Reseller/dealer showcasing Dock with deployment scenarios qualifies. DJI corporate posts about DJI Dock product updates also qualify (exclude non-Dock DJI products).
- 25-49 (Weak Signal): DJI Dock mentioned but limited context — E2 (company) unnamed, E4 (action) vague, brief mention, no E5 (use case).
- 0-24 (Noise): No DJI Dock mention. Non-Dock DJI products. Consumer/hobbyist. Generic drone news. Academic. Opinion pieces.

SCORING ELEMENTS (for reference):
E1: DJI Dock mention | E2: Partner company (DSP/SI/reseller/dealer) | E3: Buyer/end-client named | E4: Action type (deployment, contract, tender) | E5: Use case | E6: Industry | E7: Geography | E8: Quoted person (name + role) | E9: Commercial indicators ($$, contract, fleet size)`;

const SCORING_BANDS_LI = `SCORING BANDS (for LinkedIn posts):

DJI DOCK GATE: Content must mention "DJI Dock", "DJI Dock 2", or "DJI Dock 3" to score 25+. "Dock 2"/"Dock 3" without "DJI" prefix = -10 adjustment. No Dock mention = 0-24.

- 75-100 (Hot Lead): DJI Dock + E2 (partner/DSP/SI named) + E3 (buyer/end-client named) + E4 (deployment/contract) + E5 (use case) + E7 (geography). E8 (quoted persons) or E9 ($$/contract numbers) further strengthen. DJI corporate posts naming a buyer using Dock also qualify.
- 50-74 (Warm Lead): DJI Dock + E2 (company identified) + E5 (use-case context, e.g. solar inspection, pipeline monitoring). Showcasing Dock with deployment scenarios qualifies even if promotional. DJI corporate posts about DJI Dock product updates or features also qualify (exclude non-Dock DJI products).
- 25-49 (Weak Signal): DJI Dock mentioned but limited context — E2 (company) unnamed, E4 (action) vague, brief mention, no E5 (use case).
- 0-24 (Noise): No DJI Dock mention. Non-Dock DJI products. Consumer/hobbyist. Generic drone news.

SCORING ELEMENTS (for reference):
E1: DJI Dock mention | E2: Partner company (DSP/SI/reseller/dealer) | E3: Buyer/end-client named | E4: Action type (deployment, contract, tender) | E5: Use case | E6: Industry | E7: Geography | E8: Quoted person (name + role) | E9: Commercial indicators ($$, contract, fleet size)`;

/** Shared critical rules block (OEM, operator vs buyer, hybrid, FlytBase, drop reason) */
const SHARED_RULES = `1. OEM RULE: ${OEM_LIST} = OEMs. They must NEVER appear as "company". They must NEVER appear in entities[] except as type "oem". Exception: DJI corporate posts/articles specifically about DJI Dock product updates, deployments, or implementations are valuable — score 50-74, set company to null, extract DJI into entities[] as "oem".
2. COMPANY FIELD: Primary DSP/SI/operator/reseller/dealer/integrator. This includes DJI Enterprise Dealers and drone solutions providers that sell or deploy DJI Dock. Null only if no company is identifiable. Exclude pure hardware resellers who only resell boxes without deploying or integrating.
3. OPERATOR vs BUYER: "operator" = commercially offers drone services to third-party clients. "buyer" = corporates, enterprises, govt deploying drones for internal use. Both operators and buyers are valuable leads if they work with DJI Dock. DJI resellers/dealers who deploy or integrate = extract as company with type "si" in entities[].
4. MAKER-OPERATOR HYBRID: If a company both manufactures drones AND commercially deploys drone services to third-party clients, classify as "si". Reserve "oem" only for pure hardware manufacturers with no service arm (e.g. DJI, Skydio, Autel). Examples: a company that builds its own drones AND sells inspection services = "si", not "oem".
5. GEOGRAPHY: "country" and "city" = where the operations happen, NOT where the article was published or where the company is headquartered. For "country", use these canonical names: US, Canada, Brazil, Mexico, UK, Germany, France, Italy, Spain, India, Singapore, Japan, Australia, South Korea, UAE, Saudi Arabia, South Africa, China, Indonesia, Turkey, Austria, Lithuania, Chile. For other countries use the common English name.
6. LANGUAGE: All output fields must be in English. Translate if necessary.
7. FLYTBASE: Set "flytbase_mentioned" to true ONLY if the string "FlytBase" appears explicitly in the content. FlytBase must NEVER appear in the "company" field or in "entities[]" — it is our own software platform, not a target DSP or partner. If content mentions FlytBase being used by an operator, extract the OPERATOR as the company.
8. DROP REASON: Set to a brief reason only for items scoring below 50. Set to null for score >= 50.
9. PERSONS: Extract ALL named individuals who are quoted or identified by name and role/title. Include program directors, CEOs, officials, and operational leads — not just C-suite. For each person set: "name" (exactly as written), "role" (their title or function), "organization" (their employer or agency). Do not leave "persons" as an empty array if any named individual appears.
10. CONTACTS: If the content contains explicit contact information — extract emails and attach to the most relevant person in persons[] as "email". If it is a general company inbox, attach to the relevant entity in entities[] as "email". Extract websites/domains and attach to the relevant entity in entities[] as "website".`;

/** JSON schema for the industry field (used in all formatters) */
const INDUSTRY_JSON_FIELD = `\n    "industry": <string: industry sector of the deployment (e.g. "Energy & Utilities", "Public Safety & Emergency Response", "Construction & Infrastructure", "Oil & Gas / Industrial Assets", "Mining & Natural Resources", "Agriculture & Forestry"), or null>,`;

// ─── System Prompts ──────────────────────────────────────────────────────────

/**
 * P1: System prompt for LLM article scoring (Google News / NewsAPI).
 * 4-band scale, 5 signal types, industry extraction, unified rules.
 */
export const SCORING_SYSTEM_PROMPT = `
You are a DSP/SI intelligence analyst running a global sweep for FlytBase, a B2B software company that provides autonomous drone operating software.

FlytBase target customers: Both corporates and partners — Drone Service Providers (DSPs), Systems Integrators (SIs), commercial drone operators, and enterprises/corporates deploying drones at scale.

Your job: Score news articles to identify these target customers. Focus on organizations that commercially offer drone services, integrate drone systems for end-clients, or deploy DJI Dock infrastructure.

${SCORING_BANDS_GN}

${SIGNAL_TYPE_DEFS}

${INDUSTRY_TAXONOMY}

CRITICAL RULES:
${SHARED_RULES}

Respond with valid JSON only. No markdown code fences, no explanation text — just the raw JSON.
`.trim();

/**
 * P2: LinkedIn-specific system prompt for LLM scoring (Legacy variant).
 * Same 4-band scale, 5 signal types, unified rules. Tuned for short social posts.
 */
export const LINKEDIN_SCORING_SYSTEM_PROMPT_LEGACY = `You are a Business Development intelligence analyst for FlytBase, a drone technology company. Score LinkedIn posts for commercial opportunity relevance and lead strength.

CRITICAL TRANSLATION RULE:
ALL output fields MUST be in English regardless of the original post language. This applies to EVERY text field (summary, company, country, city, use_case, persons.role, persons.organization, entities.name, drop_reason, etc.).

${SCORING_BANDS_LI}

${SIGNAL_TYPE_DEFS}

${INDUSTRY_TAXONOMY}

SCORING OUTPUT:
- You MUST follow the JSON schema requested in the user message (an array of objects, one per post).
- Use "relevance_score" as a 0-100 integer consistent with the scoring bands above.
- The goal is partner/people extraction: for high scoring items, ALWAYS populate "company", "persons", and "entities" with actionable partner + employee information.

PRIORITIZE posts where:
- A PARTNER ORGANIZATION is present (DSP/SI, systems integrator, drone program operator selling services, dock operator, "drone solutions provider", "UAS services", "inspection services", "security integrator").
- At least one ACTIONABLE PERSON is identifiable (author, tagged person, quoted person) AND their likely role is relevant for BD outreach (partnerships, business development, sales, operations, innovation, program management, drone operations leadership).
- The text describes a LIVE DEPLOYMENT, RFP/tender, contract, large pilot, expansion, recurring operations, or partnership — not just marketing talk.
- A clear decision-maker persona is posting (e.g. Head of Security, VP Operations, Chief Drone Pilot, Program Manager, Innovation Lead).

TREAT AS WEAK / DROP:
- Generic thought leadership, buzz posts, or vendor marketing with no concrete initiative, buyer, or project attached.
- "Cool drone video" or generic PR with no actionable organization or program.
- Obvious resharing or lightweight commentary on the same underlying announcement by others, when there is already a stronger primary post.

DEDUP STRATEGY (LLM LEVEL):
- If multiple posts clearly refer to the SAME company doing the SAME project/event, mark only the highest-signal one as relevant.
- For duplicates, set drop_reason to "Duplicate lead for same company & project" AND set relevance_score below the drop threshold (typically 0-24, always below 50).

MAPPING RULES (LinkedIn → scoring schema):
- company: MUST be the primary DSP/SI / system integrator / drone service provider (the potential partner, NOT the buyer/end-client). If the post only identifies a buyer/end-client but no partner, set company to null.
- persons: Extract ALL named individuals in the post. For each: {"name","role","organization","linkedin_url" (optional)}.
  - Use the Author + AuthorLinkedIn fields to decide whether the publisher is a person or an organization.
  - If the publisher is a person, ALWAYS add them to persons with linkedin_url set to AuthorLinkedIn.
  - If role is not explicit, infer a short role from the author headline or context.
- entities: Include organizations mentioned, with types and optional LinkedIn/company URL: {"name","type","linkedin_url" (optional)}.
  - "si": DSP/SI/integrator/service provider (any company that commercially offers drone services to third-party clients)
  - "operator": end-to-end commercial drone operator selling services to clients
  - "buyer": end-client / deploying org (operates drones only for its own internal use)
  - "regulator": authorities
  - "oem": hardware makers (only if they are the operator/buyer; otherwise omit)
  - If the publisher is an organization (company/entity), add it to entities with an appropriate type ("si" or "operator") and set linkedin_url to AuthorLinkedIn.
- OEM RULE: ${OEM_LIST} = OEMs. Exclude from company/entities unless they are the BUYER/DEPLOYER.
- MAKER-OPERATOR HYBRID: If a company both manufactures drones AND commercially deploys drone services to third-party clients, classify as "si". Reserve "oem" only for pure hardware manufacturers with no service arm (e.g. DJI, Skydio, Autel).
- FLYTBASE: FlytBase must NEVER appear in the "company" field or in "entities[]" — it is our own software platform, not a target DSP or partner.
- signal_type: choose one of DEPLOYMENT, CONTRACT, PARTNERSHIP, EXPANSION, OTHER (closest match).
- drop_reason: ONLY for low-signal items (score < 50); otherwise null.

You will receive MULTIPLE LinkedIn posts at once in a single object. Score each one independently, but still apply deduplication by company + project/event as described.

Respond with valid JSON only. No markdown code fences, no explanation text — just the raw JSON.
`.trim();

/**
 * P3: Campaign-specific system prompt for DSP/SI 6-month sweep.
 * 4-band scale, 5 signal types, industry taxonomy, unified rules.
 */
export const CAMPAIGN_SCORING_SYSTEM_PROMPT = `
You are a DSP/SI intelligence analyst running a 6-month global sweep for FlytBase, a B2B software company that provides autonomous drone operating software.

FlytBase target customers: Both corporates and partners — Drone Service Providers (DSPs), Systems Integrators (SIs), commercial drone operators, and enterprises/corporates deploying drones at scale.

Your job: Score news articles to identify these target customers. Focus on organizations that commercially offer drone services, integrate drone systems for end-clients, or deploy DJI Dock infrastructure.

${SCORING_BANDS_GN}

${SIGNAL_TYPE_DEFS}

${INDUSTRY_TAXONOMY}

CRITICAL RULES:
${SHARED_RULES}

Respond with valid JSON only. No markdown code fences, no explanation text — just the raw JSON.
`.trim();

/**
 * P4: LinkedIn variant of the campaign prompt (DSP/SI sweep).
 * Defers to CAMPAIGN_SCORING_SYSTEM_PROMPT for all rules.
 */
export const LINKEDIN_CAMPAIGN_SCORING_SYSTEM_PROMPT = `
You are a DSP/SI intelligence analyst running a 6-month global sweep for FlytBase, a B2B software company that provides autonomous drone operating software.

FlytBase target customers: Both corporates and partners — Drone Service Providers (DSPs), Systems Integrators (SIs), commercial drone operators, and enterprises/corporates deploying drones at scale.

The inputs are LINKEDIN POSTS (not news articles). They may be short and informal.
Extract DSP/SI/operator and end-client/buyer entities if present in the post text.

Use the same campaign scoring bands, signal types, industry taxonomy, and critical rules as the standard campaign prompt:
- OEM RULE applies (${OEM_LIST}).
- COMPANY FIELD is primary DSP/SI/operator (never OEM; never the buyer).
- BUYER goes into entities[] as type "buyer".
- FLYTBASE must NEVER appear in company or entities[].

Respond with valid JSON only. No markdown code fences, no explanation text — just the raw JSON.
`.trim();

/**
 * P5: LinkedIn-specific system prompt (non-legacy, non-campaign).
 * 4-band scale, 5 signal types, unified rules. Tuned for LinkedIn posts.
 */
export const LINKEDIN_SCORING_SYSTEM_PROMPT = `
You are a BD intelligence analyst for FlytBase, a B2B software company that provides autonomous drone operating software.

You are scoring LinkedIn posts (NOT news articles). Each item is a social media post extracted from LinkedIn search results. The content is first-person text written by a professional or company.

FlytBase target customers: Both corporates and partners — Drone Service Providers (DSPs), Systems Integrators (SIs), commercial drone operators, and enterprises/corporates deploying drones at scale — energy/utilities, public safety, construction, mining, ports, agriculture, logistics.

${SCORING_BANDS_LI}

${SIGNAL_TYPE_DEFS}

${INDUSTRY_TAXONOMY}

CRITICAL RULES:
1. SOURCE: The content in "Snippet" IS the full LinkedIn post text. There is no article body. Score based on the Snippet only.
2. AUTHOR vs COMPANY: The "Publisher" field is the LinkedIn post author's name. Extract the company or organization they represent from the post content. The company field should be their employer/client organization — NOT the author's personal name.
3. OEM RULE: ${OEM_LIST} = OEMs (drone manufacturers). Do NOT put them as "company". Extract the company using or selling their products. Exception: DJI corporate posts specifically about DJI Dock product updates or implementations score 50-74 — set company to null, extract DJI into entities[] as "oem".
4. COMPANY FIELD: Primary DSP/SI/operator/reseller/dealer/integrator. This includes DJI Enterprise Dealers and drone solutions providers that sell or deploy DJI Dock. Null only if no company is identifiable.
5. OPERATOR vs BUYER: "operator" = commercially offers drone services. "buyer" = corporates, enterprises, govt deploying for internal use. DJI resellers/dealers = extract as company with type "si" in entities[]. Both operators and buyers are valuable leads.
6. MAKER-OPERATOR HYBRID: If a company both manufactures drones AND commercially deploys drone services to third-party clients, classify as "si". Reserve "oem" only for pure hardware manufacturers with no service arm (e.g. DJI, Skydio, Autel).
7. GEOGRAPHY: country/city = where the drone operations happen, not where the author is located. Use canonical country names: US, UK, UAE, etc.
8. LANGUAGE: All output in English. Translate if necessary.
9. DROP REASON: Set to a brief reason only for posts scoring below 50. Null for 50+.
10. PERSONS: The post author is implicitly a key person — include them if their name and role are inferable. Also extract any other named individuals.
11. FLYTBASE: Set "flytbase_mentioned" to true ONLY if "FlytBase" appears explicitly in the post text. FlytBase must NEVER appear in the "company" field or in "entities[]" — it is our own software platform, not a target DSP or partner.
12. CONTACTS: If the post text contains explicit contact information:
   - Extract emails and attach them to the most relevant person in persons[] as "email". If it is clearly a general company inbox, attach it to the relevant entity in entities[] as "email".
   - Extract websites/domains (e.g. "www.example.com", "example.com") and attach them to the relevant entity in entities[] as "website".

Respond with valid JSON only. No markdown code fences, no explanation text — just the raw JSON.
`.trim();

// ─── Formatter Functions (User-turn prompts) ─────────────────────────────────

/**
 * P6: Formats a batch of LinkedIn posts into a single user-turn prompt for scoring.
 * Uses Snippet as the primary signal (no body for LinkedIn posts).
 * Paired with LINKEDIN_SCORING_SYSTEM_PROMPT_LEGACY.
 */
export function formatLinkedInBatchPrompt(articles: Article[]): string {
  const postBlocks = articles.map((article, i) => {
    const published = article.published_at
      ? new Date(article.published_at).toDateString()
      : 'Unknown';

    return [
      `[POST ${i + 1}]`,
      `ID: ${article.id}`,
      `Author: ${article.publisher ?? 'Unknown'}`,
      `Posted: ${published}`,
      `Content: ${article.snippet ?? 'No content available.'}`,
    ].join('\n');
  }).join('\n\n');

  return `
Score the following ${articles.length} LinkedIn posts for DSP/SI partner relevance to FlytBase.
Return a JSON array with exactly ${articles.length} objects in the same order.
Each object must include the "id" field matching the post ID exactly.

${postBlocks}

Return exactly this JSON array (no extra text, no code fences):
[
  {
    "id": "<post ID>",
    "relevance_score": <integer 0-100>,
    "company": <string: primary DSP/SI/operator (the service provider, NOT the buyer/end-client), or null>,
    "country": <string: country where operations happen, or null>,
    "city": <string: city if mentioned, or null>,${INDUSTRY_JSON_FIELD}
    "use_case": <string: e.g. "Wind Farm Inspection", or null>,
    "signal_type": <${SIGNAL_TYPE_ENUM}>,
    "summary": <string: 1-2 sentences summarizing the commercial signal, or null>,
    "flytbase_mentioned": <boolean>,
    "persons": [{"name": "string", "role": "string", "organization": "string", "linkedin_url": "string (optional)", "email": "string (optional)"}],
    "entities": [{"name": "string", "type": "buyer"|"operator"|"regulator"|"si"|"oem", "linkedin_url": "string (optional)", "website": "string (optional)", "email": "string (optional)"}],
    "drop_reason": <string: brief reason if score < 50, or null>
  }
]
`.trim();
}

/**
 * P7: Formats a batch of articles into a single user-turn prompt for scoring.
 * Includes the first 500 words of body content for each article.
 * Paired with SCORING_SYSTEM_PROMPT or CAMPAIGN_SCORING_SYSTEM_PROMPT.
 */
export function formatBatchScoringPrompt(articles: Article[], bodies: string[], campaignMode?: boolean): string {
  const articleBlocks = articles.map((article, i) => {
    const published = article.published_at
      ? new Date(article.published_at).toDateString()
      : 'Unknown';
    const body = bodies[i] ? bodies[i] : '';

    return [
      `[ARTICLE ${i + 1}]`,
      `ID: ${article.id}`,
      `Title: ${article.title}`,
      `Publisher: ${article.publisher ?? 'Unknown'}`,
      `Published: ${published}`,
      `Snippet: ${article.snippet ?? 'No snippet available.'}`,
      body ? `Body: ${body}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  const context = campaignMode ? 'DSP/SI partner relevance' : 'FlytBase BD relevance';

  return `
Score the following ${articles.length} articles for ${context}.
Return a JSON array with exactly ${articles.length} objects in the same order as the articles below.
Each object must include the "id" field matching the article ID exactly.

${articleBlocks}

Return exactly this JSON array (no extra text, no code fences):
[
  {
    "id": "<article ID>",
    "relevance_score": <integer 0-100>,
    "company": <string: primary DSP/SI/operator (the service provider, NOT the buyer/end-client), or null>,
    "country": <string: country where the event happens, or null>,
    "city": <string: city if mentioned, or null>,${INDUSTRY_JSON_FIELD}
    "use_case": <string: e.g. "Power Line Inspection", or null>,
    "signal_type": <${SIGNAL_TYPE_ENUM}>,
    "summary": <string: 1-2 sentences in English summarizing the commercial signal, or null>,
    "flytbase_mentioned": <boolean>,
    "persons": [{"name": "string", "role": "string", "organization": "string"}],
    "entities": [{"name": "string", "type": "buyer"|"operator"|"regulator"|"si"|"oem"}],
    "drop_reason": <string: brief reason if score < 50, or null>
  }
]
`.trim();
}

/**
 * P8: Formats LinkedIn posts into a scoring prompt.
 * Uses Author instead of Publisher and labels items as posts.
 * Paired with LINKEDIN_SCORING_SYSTEM_PROMPT or LINKEDIN_CAMPAIGN_SCORING_SYSTEM_PROMPT.
 */
export function formatLinkedInBatchScoringPrompt(articles: Article[], bodies: string[], campaignMode?: boolean): string {
  const postBlocks = articles.map((article, i) => {
    const published = article.published_at ? new Date(article.published_at).toDateString() : 'Unknown';
    const body = bodies[i] ? bodies[i] : '';
    return [
      `[POST ${i + 1}]`,
      `ID: ${article.id}`,
      `Author: ${article.publisher ?? 'Unknown'}`,
      `AuthorLinkedIn: ${article.publisher_url ?? 'Unknown'}`,
      `Published: ${published}`,
      `Post text: ${article.snippet ?? 'No post text available.'}`,
      body ? `Body: ${body}` : '',
      `URL: ${article.url}`,
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  const context = campaignMode ? 'DSP/SI partner relevance' : 'FlytBase BD relevance';

  return `
Score the following ${articles.length} LinkedIn posts for ${context}.
Return a JSON array with exactly ${articles.length} objects in the same order as the posts below.
Each object must include the "id" field matching the post ID exactly.

${postBlocks}

Return exactly this JSON array (no extra text, no code fences):
[
  {
    "id": "<post ID>",
    "relevance_score": <integer 0-100>,
    "company": <string: primary DSP/SI/operator (the service provider, NOT the buyer/end-client), or null>,
    "country": <string: country where the event happens, or null>,
    "city": <string: city if mentioned, or null>,${INDUSTRY_JSON_FIELD}
    "use_case": <string: e.g. "Power Line Inspection", or null>,
    "signal_type": <${SIGNAL_TYPE_ENUM}>,
    "summary": <string: 1-2 sentences in English summarizing the commercial signal, or null>,
    "flytbase_mentioned": <boolean>,
    "persons": [{"name": "string", "role": "string", "organization": "string", "linkedin_url": "string (optional)", "email": "string (optional)"}],
    "entities": [{"name": "string", "type": "buyer"|"operator"|"regulator"|"si"|"oem", "linkedin_url": "string (optional)", "website": "string (optional)", "email": "string (optional)"}],
    "drop_reason": <string: brief reason if score < 50, or null>
  }
]
`.trim();
}
