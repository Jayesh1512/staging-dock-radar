/**
 * POST /api/contacts
 *
 * Test-only endpoint — used by EnrichmentTestAgent to find emails and
 * additional org contacts via Lemlist. NOT used by the main pipeline.
 *
 * Body: { persons: { name, role, organization }[], companyDomain?: string }
 * Returns: { enriched: LemlistEnrichResult[], additional: LemlistContact[], credits: number | null }
 */

import { NextResponse } from 'next/server';
import {
  findEmailForPerson,
  findPeopleAtOrg,
  getLemlistCredits,
  type LemlistEnrichResult,
  type LemlistContact,
} from '@/lib/lemlist';

interface PersonInput {
  name: string;
  role: string;
  organization: string;
}

export async function POST(req: Request) {
  try {
    const { persons, companyDomain } = await req.json() as {
      persons: PersonInput[];
      companyDomain?: string;
    };

    if (!Array.isArray(persons) || persons.length === 0) {
      return NextResponse.json({ error: 'persons array required' }, { status: 400 });
    }

    // 1. Find email for each extracted person (sequential to respect rate limit)
    const enriched: LemlistEnrichResult[] = [];
    for (const p of persons) {
      const result = await findEmailForPerson(p.name, p.role, p.organization, companyDomain);
      enriched.push(result);
    }

    // 2. Find 2 additional people at the primary organization
    // Use the first person's org as the target (most likely the main org in the article)
    const primaryOrg = persons[0].organization;
    const extractedNames = persons.map(p => p.name);
    const additional: LemlistContact[] = await findPeopleAtOrg(primaryOrg, extractedNames, 2);

    // 3. Return remaining credits so the test agent can display them
    const credits = await getLemlistCredits();

    return NextResponse.json({ enriched, additional, credits });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
