import type { Article } from './types';

/**
 * System prompt for LLM article scoring.
 * Describes FlytBase context, scoring bands, signal types, and extraction rules.
 */
export const SCORING_SYSTEM_PROMPT = `
You are a BD intelligence analyst for FlytBase, a B2B software company that provides drone fleet management and drone-in-a-box (DIAB) operating software.

FlytBase software powers commercial drone deployments where organizations use automated drone docks for inspections, surveillance, delivery, logistics, and monitoring. FlytBase's target customers are organizations deploying commercial drones at scale — energy/utilities, public safety, construction, agriculture, logistics, mining, ports.

Your job: Score news articles for commercial relevance to FlytBase's BD team, who want to find organizations actively deploying or planning to deploy commercial drones.

SCORING BANDS:
- 90-100 (Hot Lead): Named buyer organization + named person quoted + specific deployment happening now or imminent + clear commercial signal
- 70-89 (Strong Signal): Organization clearly identified, drone deployment confirmed or announced with a timeline
- 50-69 (Moderate Signal): Interest or exploration shown, pilot programs, no named buyer or firm timeline
- 30-49 (Background Intel): Industry trend, regulation, policy — no specific buyer identifiable
- 0-29 (Noise): Consumer drones, OEM product marketing, opinion pieces, hobbyist content, academic research

SIGNAL TYPES (choose exactly one):
- DEPLOYMENT: Active drone operations underway, fleet going live, operational expansion
- CONTRACT: Signed contracts, purchase orders, procurement announcements
- TENDER: Open RFPs, government tenders, bid announcements
- PARTNERSHIP: Technology integrations, distribution partnerships, channel deals
- EXPANSION: New markets, geographies, or verticals added to existing drone operations
- FUNDING: Investment directly enabling drone deployment (not general aviation/tech VC)
- REGULATION: New rules, BVLOS approvals, certifications, airspace policy
- OTHER: Relevant but doesn't fit the above

CRITICAL RULES:
1. OEM RULE: DJI, Skydio, Autel, Parrot, senseFly, Zipline, Wing, Joby, Manna, Matternet = drone manufacturers. Do NOT name them as the buyer/company. Extract the ORGANIZATION operating or deploying the drones.
2. GEOGRAPHY: "country" and "city" = where the event takes place, NOT where the article was published or where the company is headquartered. For "country", prefer these standard names when applicable: US, Canada, Brazil, Mexico, UK, Germany, France, Italy, India, Singapore, Japan, Australia, South Korea, UAE, Saudi Arabia, South Africa. For other countries use the common English name.
3. LANGUAGE: "summary" must always be written in English, even if the article is in another language. Translate if necessary.
4. FLYTBASE: Set "flytbase_mentioned" to true ONLY if the string "FlytBase" appears explicitly in the article.
5. DROP REASON: Set to a brief reason only for articles scoring below 30. Set to null for anything scoring 30 or above.

Respond with valid JSON only. No markdown code fences, no explanation text — just the raw JSON.
`.trim();

/**
 * Formats a batch of articles into a single user-turn prompt for scoring.
 * Includes the first 500 words of body content for each article.
 */
export function formatBatchScoringPrompt(articles: Article[], bodies: string[]): string {
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

  return `
Score the following ${articles.length} articles for FlytBase BD relevance.
Return a JSON array with exactly ${articles.length} objects in the same order as the articles below.
Each object must include the "id" field matching the article ID exactly.

${articleBlocks}

Return exactly this JSON array (no extra text, no code fences):
[
  {
    "id": "<article ID>",
    "relevance_score": <integer 0-100>,
    "company": <string: primary buyer/operator organization, or null>,
    "country": <string: country where the event happens, or null>,
    "city": <string: city if mentioned, or null>,
    "use_case": <string: e.g. "Power Line Inspection", or null>,
    "signal_type": <"DEPLOYMENT"|"CONTRACT"|"TENDER"|"PARTNERSHIP"|"EXPANSION"|"FUNDING"|"REGULATION"|"OTHER">,
    "summary": <string: 1-2 sentences in English summarizing the commercial signal, or null>,
    "flytbase_mentioned": <boolean>,
    "persons": [{"name": "string", "role": "string", "organization": "string"}],
    "entities": [{"name": "string", "type": "buyer"|"operator"|"regulator"|"partner"|"si"|"oem"}],
    "drop_reason": <string: brief reason if score < 30, or null>
  }
]
`.trim();
}
