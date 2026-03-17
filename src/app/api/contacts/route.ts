/**
 * POST /api/contacts
 *
 * Test-only endpoint — used by EnrichmentTestAgent.
 * Orchestrates Apollo + Lemlist to enrich persons extracted from articles.
 *
 * Workflow per org:
 *   1. Domain resolution: Apollo Org Enrich → Lemlist Company DB → manual fallback
 *   2. Per extracted person: Apollo People Match (email + LinkedIn) → Lemlist Waterfall (email fallback)
 *   3. For target orgs with no extracted persons: Apollo People Search (LinkedIn only, no credits)
 */

import { NextResponse } from 'next/server';
import { apolloFindOrgDomain, apolloMatchPerson, apolloFindPeopleAtOrg } from '@/lib/apollo';
import { findCompanyDomain, findEmailForPerson, getLemlistCredits } from '@/lib/lemlist';

interface PersonInput {
  name: string;
  role: string;
  organization: string;
}

export interface ContactResult {
  name: string | null;
  title: string | null;
  organization: string;
  email: string | null;
  emailStatus: 'found' | 'not_found' | 'no_domain' | 'error';
  emailSource: 'apollo' | 'lemlist' | null;
  linkedinUrl: string | null;
  isFromArticle: boolean;
}

export interface OrgResolution {
  orgName: string;
  domain: string | null;
  domainSource: 'apollo' | 'lemlist' | 'manual' | null;
}

export async function POST(req: Request) {
  try {
    const { persons, targetOrgs, domainOverrides } = await req.json() as {
      persons: PersonInput[];
      targetOrgs: string[];           // target entity org names (operators, buyers, partners, SIs)
      domainOverrides?: Record<string, string>; // per-org domain override: { "OrgName": "domain.com" }
    };

    // Collect all unique orgs we need to resolve (from article persons + target entities)
    const articleOrgs = [...new Set(persons.map(p => p.organization))];
    const allOrgs = [...new Set([...articleOrgs, ...targetOrgs])];

    // ── Step 1: Resolve domain for each org ────────────────────────────────
    const orgResolutions: OrgResolution[] = [];
    const domainByOrg = new Map<string, string | null>();

    for (const org of allOrgs) {
      // User-provided domain override takes priority (per-org)
      const override = domainOverrides?.[org]?.trim();
      if (override) {
        orgResolutions.push({ orgName: org, domain: override, domainSource: 'manual' });
        domainByOrg.set(org, override);
        continue;
      }

      // Apollo org enrich (free)
      const apollo = await apolloFindOrgDomain(org);
      if (apollo.domain) {
        orgResolutions.push({ orgName: org, domain: apollo.domain, domainSource: 'apollo' });
        domainByOrg.set(org, apollo.domain);
        continue;
      }

      // Lemlist company DB fallback
      const lemlistDomain = await findCompanyDomain(org);
      if (lemlistDomain) {
        orgResolutions.push({ orgName: org, domain: lemlistDomain, domainSource: 'lemlist' });
        domainByOrg.set(org, lemlistDomain);
        continue;
      }

      orgResolutions.push({ orgName: org, domain: null, domainSource: null });
      domainByOrg.set(org, null);
    }

    const contacts: ContactResult[] = [];

    // ── Step 2: Enrich each extracted person ───────────────────────────────
    for (const p of persons) {
      const domain = domainByOrg.get(p.organization) ?? null;

      // Apollo People Match → email + LinkedIn (1 credit if email found)
      const apollo = await apolloMatchPerson(p.name, p.organization, domain);

      if (apollo.email) {
        contacts.push({
          name: p.name,
          title: p.role,
          organization: p.organization,
          email: apollo.email,
          emailStatus: 'found',
          emailSource: 'apollo',
          linkedinUrl: apollo.linkedinUrl,
          isFromArticle: true,
        });
        continue;
      }

      // Lemlist waterfall fallback (5 credits if found, 0 if not found)
      const lemlist = await findEmailForPerson(p.name, p.role, p.organization, domain ?? undefined);

      contacts.push({
        name: p.name,
        title: p.role,
        organization: p.organization,
        email: lemlist.email,
        emailStatus: lemlist.emailStatus === 'found' ? 'found'
          : lemlist.emailStatus === 'no_domain' ? 'no_domain'
          : lemlist.emailStatus === 'error' ? 'error'
          : 'not_found',
        emailSource: lemlist.email ? 'lemlist' : null,
        linkedinUrl: apollo.linkedinUrl, // Apollo gives LinkedIn even without email
        isFromArticle: true,
      });
    }

    // ── Step 3: For target orgs with no extracted persons, find contacts ───
    const orgsWithPersons = new Set(persons.map(p => p.organization));
    const orgsNeedingDiscovery = targetOrgs.filter(o => !orgsWithPersons.has(o));

    for (const org of orgsNeedingDiscovery) {
      const domain = domainByOrg.get(org) ?? null;

      // Guardrail: without a domain, Apollo people search returns low-quality results
      // (wrong company matches). Skip and add placeholder instead.
      if (!domain) {
        contacts.push({
          name: null, title: null, organization: org,
          email: null, emailStatus: 'no_domain', emailSource: null,
          linkedinUrl: null, isFromArticle: false,
        });
        continue;
      }

      const extractedNames = persons.map(p => p.name);
      const discovered = await apolloFindPeopleAtOrg(org, domain, extractedNames, 2);

      for (const d of discovered) {
        contacts.push({
          name: d.name,
          title: d.title,
          organization: org,
          email: null,
          emailStatus: 'not_found',
          emailSource: null,
          linkedinUrl: d.linkedinUrl,
          isFromArticle: false,
        });
      }

      // If Apollo found nothing, add one blank placeholder row for the org
      if (discovered.length === 0) {
        contacts.push({
          name: null,
          title: null,
          organization: org,
          email: null,
          emailStatus: 'no_domain',
          emailSource: null,
          linkedinUrl: null,
          isFromArticle: false,
        });
      }
    }

    const lemlistCredits = await getLemlistCredits();

    return NextResponse.json({ contacts, orgResolutions, lemlistCredits });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
