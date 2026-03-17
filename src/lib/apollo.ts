/**
 * Apollo.io API client — used only by the Enrichment Test Agent.
 * NOT used by the main scoring/enrichment pipeline.
 *
 * Auth: x-api-key header
 * Rate limit: 200 req/min on paid plans
 * Credits: 1 per email match, 0 for org enrich / people search
 */

const BASE = 'https://api.apollo.io/api/v1';

function apolloHeaders() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY not set');
  return {
    'x-api-key': key,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    accept: 'application/json',
  };
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ApolloOrgResult {
  domain: string | null;
  linkedinUrl: string | null;
}

export interface ApolloPersonResult {
  email: string | null;
  linkedinUrl: string | null;
  title: string | null;
}

export interface ApolloContact {
  name: string;
  title: string;
  linkedinUrl: string | null;
}

// ─── 1. Org domain + LinkedIn lookup ────────────────────────────────────────

/**
 * Enriches an org by name → returns domain and LinkedIn URL.
 * No email credits consumed.
 */
export async function apolloFindOrgDomain(orgName: string): Promise<ApolloOrgResult> {
  try {
    const res = await fetch(
      `${BASE}/organizations/enrich?organization_name=${encodeURIComponent(orgName)}`,
      { headers: apolloHeaders() },
    );
    if (!res.ok) return { domain: null, linkedinUrl: null };
    const data = await res.json() as {
      organization?: { primary_domain?: string; linkedin_url?: string };
    };
    return {
      domain: data.organization?.primary_domain ?? null,
      linkedinUrl: data.organization?.linkedin_url ?? null,
    };
  } catch {
    return { domain: null, linkedinUrl: null };
  }
}

// ─── 2. Person email + LinkedIn match ────────────────────────────────────────

/**
 * Matches a person by name + org → returns email and LinkedIn URL.
 * Consumes 1 email credit if email is found.
 */
export async function apolloMatchPerson(
  fullName: string,
  orgName: string,
  domain?: string | null,
): Promise<ApolloPersonResult> {
  try {
    const parts = fullName.trim().split(/\s+/);
    const body: Record<string, string | boolean> = {
      first_name: parts[0] ?? fullName,
      last_name: parts.slice(1).join(' ') || (parts[0] ?? ''),
      name: fullName,
      organization_name: orgName,
      reveal_personal_emails: false,
    };
    if (domain) body.domain = domain;

    const res = await fetch(`${BASE}/people/match`, {
      method: 'POST',
      headers: apolloHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) return { email: null, linkedinUrl: null, title: null };
    const data = await res.json() as {
      person?: { email?: string; linkedin_url?: string; title?: string };
    };
    return {
      email: data.person?.email ?? null,
      linkedinUrl: data.person?.linkedin_url ?? null,
      title: data.person?.title ?? null,
    };
  } catch {
    return { email: null, linkedinUrl: null, title: null };
  }
}

// ─── 3. People search at org (for orgs with no extracted persons) ────────────

/**
 * Searches Apollo's 275M-contact DB for people at a given org.
 * Returns names, titles, LinkedIn URLs. No email credits consumed.
 */
export async function apolloFindPeopleAtOrg(
  orgName: string,
  domain: string | null,
  excludeNames: string[],
  limit = 2,
): Promise<ApolloContact[]> {
  try {
    const body: Record<string, unknown> = {
      organization_name: orgName,
      page: 1,
      per_page: 10,
    };
    if (domain) body.q_organization_domains = domain;

    const res = await fetch(`${BASE}/mixed_people/api_search`, {
      method: 'POST',
      headers: apolloHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      people?: Array<{ first_name?: string; last_name?: string; title?: string; linkedin_url?: string }>;
    };

    const excluded = new Set(excludeNames.map(n => n.toLowerCase()));

    return (data.people ?? [])
      .map(p => ({
        name: [p.first_name, p.last_name].filter(Boolean).join(' '),
        title: p.title ?? '',
        linkedinUrl: p.linkedin_url ?? null,
      }))
      .filter(p => p.name && !excluded.has(p.name.toLowerCase()))
      .slice(0, limit);
  } catch {
    return [];
  }
}
