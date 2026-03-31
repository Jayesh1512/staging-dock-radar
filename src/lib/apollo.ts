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

export interface ApolloPeopleSearchResult {
  id: string;
  name: string;
  title: string | null;
  linkedinUrl: string | null;
  hasEmail: boolean;
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
  input: {
    id?: string;
    fullName?: string;
    orgName?: string;
    domain?: string | null;
    linkedinUrl?: string;
  },
  opts?: { revealPersonalEmails?: boolean; revealPhoneNumber?: boolean },
): Promise<ApolloPersonResult> {
  try {
    const params = new URLSearchParams();
    if (input.id) params.set('id', input.id);
    if (input.linkedinUrl) params.set('linkedin_url', input.linkedinUrl);
    if (input.fullName) params.set('name', input.fullName);
    if (input.orgName) params.set('organization_name', input.orgName);
    if (input.domain) params.set('domain', input.domain);
    if (opts?.revealPersonalEmails === true) params.set('reveal_personal_emails', 'true');
    if (opts?.revealPhoneNumber === true) params.set('reveal_phone_number', 'true');

    const res = await fetch(`${BASE}/people/match?${params.toString()}`, {
      method: 'POST',
      headers: apolloHeaders(),
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

/**
 * People API Search by employer domain.
 * POST /mixed_people/api_search (0 credits).
 *
 * Docs: https://docs.apollo.io/reference/people-api-search
 */
export async function apolloPeopleSearchByDomain(
  domain: string,
  opts?: { page?: number; perPage?: number; seniorities?: string[]; titles?: string[] },
): Promise<{ totalEntries: number; people: ApolloPeopleSearchResult[] }> {
  try {
    const page = Math.max(1, opts?.page ?? 1);
    const perPage = Math.max(1, Math.min(100, opts?.perPage ?? 100));
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('per_page', String(perPage));
    params.append('q_organization_domains_list[]', domain);

    const seniorities = opts?.seniorities ?? ['owner', 'founder', 'c_suite', 'vp', 'head', 'director', 'manager'];
    for (const s of seniorities) params.append('person_seniorities[]', s);

    const titles = opts?.titles ?? [];
    for (const t of titles) params.append('person_titles[]', t);

    const parsePeople = (data: {
      total_entries?: number;
      people?: Array<{
        id?: string;
        first_name?: string;
        last_name?: string;
        name?: string;
        title?: string;
        linkedin_url?: string;
        has_email?: boolean;
      }>;
    }): { totalEntries: number; people: ApolloPeopleSearchResult[] } => {
      const people = (data.people ?? [])
        .map((p) => {
          const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || (p.name ?? '').trim();
          return {
            id: p.id ?? '',
            name: fullName,
            title: p.title ?? null,
            linkedinUrl: p.linkedin_url ?? null,
            hasEmail: p.has_email === true,
          } satisfies ApolloPeopleSearchResult;
        })
        .filter((p) => p.id && p.name);
      return { totalEntries: data.total_entries ?? 0, people };
    };

    // 1) Preferred per docs: People API Search via query params
    const res1 = await fetch(`${BASE}/mixed_people/api_search?${params.toString()}`, {
      method: 'POST',
      headers: apolloHeaders(),
    });
    if (res1.ok) {
      const parsed = parsePeople(await res1.json() as any);
      if (parsed.people.length > 0) return parsed;
    }

    // 2) Fallback: same endpoint with JSON body (some tenants accept this)
    const body2: Record<string, unknown> = {
      page,
      per_page: perPage,
      q_organization_domains_list: [domain],
      person_seniorities: seniorities,
      person_titles: titles,
    };
    const res2 = await fetch(`${BASE}/mixed_people/api_search`, {
      method: 'POST',
      headers: apolloHeaders(),
      body: JSON.stringify(body2),
    });
    if (res2.ok) {
      const parsed = parsePeople(await res2.json() as any);
      if (parsed.people.length > 0) return parsed;
    }

    // 3) Fallback: resolve organization_id by domain and search by org id
    let orgId: string | null = null;
    const orgRes = await fetch(`${BASE}/mixed_companies/search`, {
      method: 'POST',
      headers: apolloHeaders(),
      body: JSON.stringify({ q_organization_domains_list: [domain], per_page: 1 }),
    });
    if (orgRes.ok) {
      const orgData = await orgRes.json() as {
        accounts?: Array<{ id?: string; organization_id?: string }>;
        organizations?: Array<{ id?: string; organization_id?: string }>;
      };
      orgId =
        orgData.accounts?.[0]?.organization_id ??
        orgData.accounts?.[0]?.id ??
        orgData.organizations?.[0]?.organization_id ??
        orgData.organizations?.[0]?.id ??
        null;
    }
    if (orgId) {
      const params3 = new URLSearchParams();
      params3.set('page', String(page));
      params3.set('per_page', String(perPage));
      params3.append('organization_ids[]', orgId);
      for (const s of seniorities) params3.append('person_seniorities[]', s);
      for (const t of titles) params3.append('person_titles[]', t);

      const res3 = await fetch(`${BASE}/mixed_people/api_search?${params3.toString()}`, {
        method: 'POST',
        headers: apolloHeaders(),
      });
      if (res3.ok) {
        const parsed = parsePeople(await res3.json() as any);
        if (parsed.people.length > 0) return parsed;
      }
    }

    // 4) Last fallback: older mixed_people/search endpoint
    const res4 = await fetch(`${BASE}/mixed_people/search`, {
      method: 'POST',
      headers: apolloHeaders(),
      body: JSON.stringify({
        q_organization_domains: [domain],
        page,
        per_page: perPage,
        person_seniorities: seniorities,
        person_titles: titles,
      }),
    });
    if (res4.ok) {
      const parsed = parsePeople(await res4.json() as any);
      if (parsed.people.length > 0) return parsed;
    }

    return { totalEntries: 0, people: [] };
  } catch {
    return { totalEntries: 0, people: [] };
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
  opts?: { page?: number; perPage?: number },
): Promise<ApolloContact[]> {
  try {
    const page = Math.max(1, opts?.page ?? 1);
    const perPage = Math.max(1, Math.min(100, opts?.perPage ?? 25));
    const baseBody: Record<string, unknown> = {
      page,
      per_page: perPage,
      // Bias towards decision-makers where business emails are likelier.
      person_seniorities: ['owner', 'founder', 'c_suite', 'vp', 'head', 'director', 'manager'],
    };
    const attempts: Array<{ endpoint: string; body: Record<string, unknown> }> = [
      {
        endpoint: `${BASE}/mixed_people/search`,
        body: {
          ...baseBody,
          organization_name: orgName,
          ...(domain ? { q_organization_domains: [domain] } : {}),
        },
      },
      {
        endpoint: `${BASE}/mixed_people/search`,
        body: {
          ...baseBody,
          q_organization_name: orgName,
          ...(domain ? { q_organization_domains: [domain] } : {}),
        },
      },
      {
        endpoint: `${BASE}/mixed_people/api_search`,
        body: {
          ...baseBody,
          organization_name: orgName,
          ...(domain ? { q_organization_domains: domain } : {}),
        },
      },
    ];

    let people: Array<{ first_name?: string; last_name?: string; name?: string; title?: string; linkedin_url?: string }> = [];
    for (const attempt of attempts) {
      const res = await fetch(attempt.endpoint, {
        method: 'POST',
        headers: apolloHeaders(),
        body: JSON.stringify(attempt.body),
      });
      if (!res.ok) continue;
      const data = await res.json() as {
        people?: Array<{ first_name?: string; last_name?: string; name?: string; title?: string; linkedin_url?: string }>;
      };
      if ((data.people?.length ?? 0) > 0) {
        people = data.people ?? [];
        break;
      }
    }
    if (people.length === 0) return [];

    const excluded = new Set(excludeNames.map(n => n.toLowerCase()));

    return people
      .map(p => ({
        name: [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.name ?? ''),
        title: p.title ?? '',
        linkedinUrl: p.linkedin_url ?? null,
      }))
      .filter(p => p.name && !excluded.has(p.name.toLowerCase()))
      .slice(0, limit);
  } catch {
    return [];
  }
}
