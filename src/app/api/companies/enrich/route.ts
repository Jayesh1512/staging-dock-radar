import { NextResponse } from 'next/server';
import { enrichDiscoveredCompanies } from '@/lib/db';

/**
 * POST /api/companies/enrich
 *
 * Bulk update website/linkedin for discovered companies.
 * Designed for Comet AI browser output or manual enrichment.
 *
 * Body: [{ name: "DroneForce", website?: "https://...", linkedin?: "https://..." }]
 * Returns: { updated: N, not_found: N, total: N }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!Array.isArray(body) || body.length === 0) {
      return NextResponse.json(
        { error: 'Body must be a non-empty array of { name, website?, linkedin? }' },
        { status: 400 },
      );
    }

    // Validate entries
    const entries = body
      .filter((e: unknown): e is { name: string; website?: string; linkedin?: string } =>
        typeof e === 'object' && e !== null && typeof (e as Record<string, unknown>).name === 'string',
      )
      .map(e => ({
        name: e.name,
        website: e.website || undefined,
        linkedin: e.linkedin || undefined,
      }));

    if (entries.length === 0) {
      return NextResponse.json(
        { error: 'No valid entries found. Each entry must have a "name" field.' },
        { status: 400 },
      );
    }

    const result = await enrichDiscoveredCompanies(entries);

    return NextResponse.json({
      ...result,
      total: entries.length,
    });
  } catch (err) {
    console.error('[/api/companies/enrich] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Enrichment failed' },
      { status: 500 },
    );
  }
}
