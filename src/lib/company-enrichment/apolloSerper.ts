/**
 * Apollo + Serper helpers shared with registry enrich-batch and CSV company pipeline.
 * Apollo: mixed_companies/search, organizations/enrich by domain.
 * Serper: LinkedIn company + domain discovery.
 */

export function apolloHeaders(): Record<string, string> {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY not set');
  return {
    'x-api-key': key,
    'Content-Type': 'application/json',
    accept: 'application/json',
  };
}

export function hasApolloKey(): boolean {
  return Boolean(process.env.APOLLO_API_KEY?.trim());
}

/**
 * Apollo Company Search — domain + LinkedIn by company name.
 * POST /mixed_companies/search (0 credits).
 */
export async function apolloCompanySearch(
  companyName: string,
): Promise<{ domain: string | null; linkedinUrl: string | null }> {
  try {
    const res = await fetch('https://api.apollo.io/api/v1/mixed_companies/search', {
      method: 'POST',
      headers: apolloHeaders(),
      body: JSON.stringify({ q_organization_name: companyName, per_page: 1 }),
    });
    if (!res.ok) return { domain: null, linkedinUrl: null };
    const data = (await res.json()) as {
      accounts?: Array<{ domain?: string; linkedin_url?: string }>;
    };
    const acct = data.accounts?.[0];
    return {
      domain: acct?.domain ?? null,
      linkedinUrl: acct?.linkedin_url ?? null,
    };
  } catch {
    return { domain: null, linkedinUrl: null };
  }
}

/** GET /organizations/enrich?domain= (0 credits). */
export async function apolloOrgEnrich(domain: string): Promise<{ linkedinUrl: string | null }> {
  try {
    const res = await fetch(
      `https://api.apollo.io/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`,
      { headers: apolloHeaders() },
    );
    if (!res.ok) return { linkedinUrl: null };
    const data = (await res.json()) as {
      organization?: { linkedin_url?: string };
    };
    return { linkedinUrl: data.organization?.linkedin_url ?? null };
  } catch {
    return { linkedinUrl: null };
  }
}

export function extractDomain(website: string | null): string | null {
  if (!website) return null;
  try {
    const u = new URL(website.startsWith('http') ? website : `https://${website}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function normalizeWebsiteUrl(domainOrUrl: string): string | null {
  const raw = domainOrUrl.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

export async function serperLinkedInLookup(
  companyName: string,
  countryCode: string,
  apiKey: string,
): Promise<string | null> {
  try {
    const gl = countryCode.toLowerCase();
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: `"${companyName}" site:linkedin.com/company`,
        gl,
        num: 3,
      }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { organic?: Array<{ link: string }> };
    const match = data.organic?.find(
      (r) =>
        r.link.includes('linkedin.com/company/') &&
        !r.link.includes('/posts') &&
        !r.link.includes('/jobs'),
    );
    return match?.link ?? null;
  } catch {
    return null;
  }
}

export async function serperDomainLookup(
  companyName: string,
  countryCode: string,
  apiKey: string,
): Promise<string | null> {
  try {
    const gl = countryCode.toLowerCase();
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: `"${companyName}" -site:linkedin.com -site:facebook.com -site:twitter.com`,
        gl,
        num: 5,
      }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { organic?: Array<{ link: string }> };

    const EXCLUDE = [
      'linkedin.com',
      'facebook.com',
      'twitter.com',
      'youtube.com',
      'amazon.',
      'ebay.',
      'wikipedia.org',
      'yelp.com',
      'trustpilot.com',
      'societe.com',
      'pappers.fr',
      'infogreffe.fr',
      'kvk.nl',
      'opencorporates.com',
    ];

    const match = data.organic?.find((r) => {
      const url = r.link.toLowerCase();
      return !EXCLUDE.some((ex) => url.includes(ex));
    });

    if (!match) return null;

    try {
      const u = new URL(match.link);
      return `${u.protocol}//${u.hostname}`;
    } catch {
      return match.link;
    }
  } catch {
    return null;
  }
}
