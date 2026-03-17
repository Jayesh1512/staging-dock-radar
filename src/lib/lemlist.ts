/**
 * Lemlist API client — email enrichment and people database search.
 * Used only by the Enrichment Test Agent (not the main pipeline).
 *
 * Auth: HTTP Basic, username=empty, password=API key
 * Rate limit: 20 req / 2 sec
 * Credits: 5 per found email (charged on success only)
 */

const BASE = 'https://api.lemlist.com/api';

function authHeader(): string {
  const key = process.env.LEMLIST_API_KEY;
  if (!key) throw new Error('LEMLIST_API_KEY not set');
  return 'Basic ' + Buffer.from(':' + key).toString('base64');
}

async function lemlistFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LemlistEnrichResult {
  name: string;
  role: string;
  organization: string;
  email: string | null;
  emailStatus: 'found' | 'not_found' | 'no_domain' | 'error';
  errorDetail?: string;
}

export interface LemlistContact {
  name: string;
  role: string;
  organization: string;
  source: 'lemlist_db';
}

// ─── Email enrichment for a single person ────────────────────────────────────

/**
 * Kicks off an async email-find job for one person.
 * Returns the enrichment job ID.
 */
async function startEmailFind(
  firstName: string,
  lastName: string,
  companyName: string,
  companyDomain?: string,
): Promise<string> {
  const body: Record<string, string> = { firstName, lastName, companyName };
  if (companyDomain) body.companyDomain = companyDomain;

  const res = await lemlistFetch('/enrich?findEmail=true', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lemlist enrich start failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { id: string };
  return data.id;
}

/**
 * Polls for enrichment result. Returns the found email or null.
 * Retries up to maxAttempts × intervalMs ms.
 */
async function pollEmailFind(
  enrichId: string,
  maxAttempts = 12,
  intervalMs = 2500,
): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));

    const res = await lemlistFetch(`/enrich/${enrichId}`);
    if (res.status === 202) continue; // still processing

    if (!res.ok) return null;

    const data = await res.json() as {
      enrichmentStatus?: string;
      data?: { email?: { email?: string; notFound?: boolean } };
    };

    if (data.enrichmentStatus === 'done') {
      const emailData = data.data?.email;
      if (emailData?.notFound || !emailData?.email) return null;
      return emailData.email;
    }
  }
  return null; // timed out
}

/**
 * Finds the email for a person given their name and organization.
 * Splits display name into first/last automatically.
 */
export async function findEmailForPerson(
  fullName: string,
  role: string,
  organization: string,
  companyDomain?: string,
): Promise<LemlistEnrichResult> {
  // Lemlist requires companyDomain — without it the API returns 400 "Missing inputs"
  if (!companyDomain) {
    return { name: fullName, role, organization, email: null, emailStatus: 'no_domain' };
  }

  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] ?? fullName;
  const lastName = parts.slice(1).join(' ') || parts[0];

  try {
    const enrichId = await startEmailFind(firstName, lastName, organization, companyDomain);
    const email = await pollEmailFind(enrichId);
    return {
      name: fullName,
      role,
      organization,
      email,
      emailStatus: email ? 'found' : 'not_found',
    };
  } catch (err) {
    const errorDetail = err instanceof Error ? err.message : String(err);
    return { name: fullName, role, organization, email: null, emailStatus: 'error', errorDetail };
  }
}

// ─── Auto-derive company domain from org name ────────────────────────────────

/**
 * Queries Lemlist's company database to find the domain for a given org name.
 * Returns the best-match domain or null if not found.
 */
export async function findCompanyDomain(orgName: string): Promise<string | null> {
  try {
    const res = await lemlistFetch('/database/companies', {
      method: 'POST',
      body: JSON.stringify({ search: orgName, size: 5, page: 1 }),
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      results?: Array<{ company_name?: string; company_domain?: string }>;
    };

    if (!data.results?.length) return null;

    // Pick the result whose name most closely matches (case-insensitive contains)
    const lowerOrg = orgName.toLowerCase();
    const best =
      data.results.find(c => (c.company_name ?? '').toLowerCase().includes(lowerOrg)) ??
      data.results.find(c => lowerOrg.includes((c.company_name ?? '').toLowerCase())) ??
      data.results[0];

    return best?.company_domain ?? null;
  } catch {
    return null;
  }
}

// ─── Find additional people at the same organization ─────────────────────────

/**
 * Searches Lemlist's 450M-contact database for people at a given company.
 * Returns up to `limit` contacts, excluding anyone in `excludeNames`.
 */
export async function findPeopleAtOrg(
  organizationName: string,
  excludeNames: string[],
  limit = 2,
): Promise<LemlistContact[]> {
  try {
    const res = await lemlistFetch('/database/people', {
      method: 'POST',
      body: JSON.stringify({
        search: organizationName,
        size: 10, // fetch extra so we have room to exclude
        page: 1,
      }),
    });

    if (!res.ok) return [];

    const data = await res.json() as {
      results?: Array<{
        full_name?: string;
        title?: string;
        company_name?: string;
      }>;
    };

    const excluded = new Set(excludeNames.map(n => n.toLowerCase()));

    return (data.results ?? [])
      .filter(p => p.full_name && !excluded.has((p.full_name ?? '').toLowerCase()))
      .slice(0, limit)
      .map(p => ({
        name: p.full_name ?? '',
        role: p.title ?? '',
        organization: p.company_name ?? organizationName,
        source: 'lemlist_db' as const,
      }));
  } catch {
    return [];
  }
}

// ─── Credit balance check ────────────────────────────────────────────────────

export async function getLemlistCredits(): Promise<number | null> {
  try {
    const res = await lemlistFetch('/team/credits');
    if (!res.ok) return null;
    const data = await res.json() as { credits?: number };
    return data.credits ?? null;
  } catch {
    return null;
  }
}
