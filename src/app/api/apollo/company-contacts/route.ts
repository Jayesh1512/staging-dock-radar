import { NextResponse } from 'next/server';
import { apolloMatchPerson, apolloPeopleSearchByDomain } from '@/lib/apollo';

interface CompanyContactsRequestBody {
  companyName?: string;
  companyDomain?: string;
  limit?: number;
  includeWithoutEmail?: boolean;
  maxSeconds?: number;
  maxCandidates?: number;
}

interface ApolloCompanyContact {
  name: string;
  title: string;
  linkedinUrl: string | null;
  email: string | null;
  apolloPersonId?: string;
}

const MAX_CANDIDATES_TO_TRY = 100;
const MAX_PAGES_TO_SCAN = 50;
const DEFAULT_MAX_SECONDS = 20;
const MAX_CONCURRENCY = 8;

function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const out: R[] = new Array(items.length);
  let i = 0;

  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await mapper(items[idx], idx);
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return out;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CompanyContactsRequestBody;
    const companyName = (body.companyName ?? '').trim();
    const rawDomain = (body.companyDomain ?? '').trim();

    if (!companyName) {
      return NextResponse.json({ error: 'companyName is required' }, { status: 400 });
    }
    if (!rawDomain) {
      return NextResponse.json({ error: 'companyDomain is required' }, { status: 400 });
    }

    const companyDomain = normalizeDomain(rawDomain);
    const requestedLimit = Number(body.limit);
    const targetCount = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.trunc(requestedLimit)
      : null;
    const includeWithoutEmail = body.includeWithoutEmail !== false;
    const maxSeconds = Number.isFinite(Number(body.maxSeconds))
      ? Math.max(5, Math.min(120, Math.trunc(Number(body.maxSeconds))))
      : DEFAULT_MAX_SECONDS;
    const hardDeadline = Date.now() + maxSeconds * 1000;
    const maxCandidates = Number.isFinite(Number(body.maxCandidates))
      ? Math.max(1, Math.min(MAX_CANDIDATES_TO_TRY, Math.trunc(Number(body.maxCandidates))))
      : MAX_CANDIDATES_TO_TRY;

    // Step 1+2: Search broadly and match every candidate.
    // If `targetCount` is null, we return all records we can fetch within safety caps.
    const contacts: ApolloCompanyContact[] = [];
    const discoveredByName = new Map<string, ApolloCompanyContact>();
    let candidatesTried = 0;
    let peopleDiscovered = 0;
    let emailMatches = 0;

    let page = 1;
    while (
      (targetCount === null || contacts.length < targetCount) &&
      candidatesTried < maxCandidates &&
      page <= MAX_PAGES_TO_SCAN &&
      Date.now() < hardDeadline
    ) {
      const { people } = await apolloPeopleSearchByDomain(companyDomain, { page, perPage: 100 });
      if (people.length === 0) break;
      page++;
      peopleDiscovered += people.length;

      const remaining = targetCount === null ? people.length : Math.max(0, targetCount - contacts.length);
      if (remaining === 0) break;
      const candidateBatch = people.slice(0, remaining);

      const matchedBatch = await mapWithConcurrency(candidateBatch, MAX_CONCURRENCY, async (person) => {
        // Prefer matching by Apollo person ID (most reliable per docs).
        const matched = await apolloMatchPerson(
          { id: person.id, fullName: person.name, orgName: companyName, domain: companyDomain, linkedinUrl: person.linkedinUrl ?? undefined },
          { revealPersonalEmails: true },
        );
        return { person, matched };
      });

      for (const { person, matched } of matchedBatch) {
        candidatesTried++;
        if (matched.email) emailMatches++;
        const normalizedName = person.name.trim().toLowerCase();
        if (normalizedName && !discoveredByName.has(normalizedName)) {
          discoveredByName.set(normalizedName, {
            name: person.name,
            title: person.title ?? '',
            linkedinUrl: person.linkedinUrl ?? null,
            email: null,
            apolloPersonId: person.id,
          });
        }
        if (!includeWithoutEmail && !matched.email) continue;
        contacts.push({
          name: person.name,
          title: (matched.title ?? person.title ?? '') || '',
          linkedinUrl: matched.linkedinUrl ?? person.linkedinUrl ?? null,
          email: matched.email ?? null,
          apolloPersonId: person.id,
        });
      }
    }

    if (peopleDiscovered === 0) {
      return NextResponse.json({
        companyName,
        companyDomain,
        total: 0,
        contacts: [],
        message: 'No people found in Apollo for this company/domain.',
      });
    }

    // Fallback behavior: if enrichment found no usable contacts,
    // return discovered people names from Apollo people search.
    if (contacts.length === 0 && discoveredByName.size > 0) {
      return NextResponse.json({
        companyName,
        companyDomain,
        total: discoveredByName.size,
        contacts: [...discoveredByName.values()],
        candidatesTried,
        peopleDiscovered,
        emailMatches,
        pagesScanned: page - 1,
        includeWithoutEmail: true,
        fallbackUsed: 'people_names_only',
        message: 'No emails found; returning people names discovered at this company.',
        timedOut: Date.now() >= hardDeadline,
        maxSeconds,
        maxCandidates,
      });
    }

    return NextResponse.json({
      companyName,
      companyDomain,
      total: contacts.length,
      contacts,
      candidatesTried,
      peopleDiscovered,
      emailMatches,
      pagesScanned: page - 1,
      includeWithoutEmail,
      timedOut: Date.now() >= hardDeadline,
      maxSeconds,
      maxCandidates,
      creditsNote: 'Apollo may consume 1 credit for each successful email reveal/match.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Apollo company contacts lookup failed';
    console.error('[/api/apollo/company-contacts]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
