import { NextResponse } from 'next/server';
import { requireSupabase } from '@/lib/db';
import { normalizeCompanyName, fuzzyMatchCompany } from '@/lib/company-normalize';

/**
 * GET /api/registry/list
 * Returns registry companies with filters + dedup indicators.
 *
 * Query params:
 *   country   — comma-separated country codes (e.g. "FR,DE"). Default: all.
 *   min_score — minimum composite_score. Default: 0.
 *   confidence — comma-separated confidence levels (e.g. "high,medium"). Default: all.
 *   status    — qa_status filter. Default: "pending".
 *   limit     — max rows. Default: 500.
 *   offset    — pagination offset. Default: 0.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const countryParam = url.searchParams.get('country');
    const minScore = parseInt(url.searchParams.get('min_score') ?? '0', 10);
    const confidenceParam = url.searchParams.get('confidence');
    const statusParam = url.searchParams.get('status') ?? 'pending';
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '500', 10), 2000);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

    const db = requireSupabase();

    // Build query
    let query = db
      .from('country_registered_companies')
      .select('*', { count: 'exact' })
      .gte('composite_score', minScore)
      .order('composite_score', { ascending: false })
      .range(offset, offset + limit - 1);

    // Country filter
    if (countryParam && countryParam !== 'all') {
      const countries = countryParam.split(',').map(c => c.trim().toUpperCase());
      query = query.in('country_code', countries);
    }

    // Confidence filter
    if (confidenceParam && confidenceParam !== 'all') {
      const levels = confidenceParam.split(',').map(c => c.trim().toLowerCase());
      query = query.in('confidence', levels);
    }

    // Status filter
    if (statusParam && statusParam !== 'all') {
      query = query.eq('qa_status', statusParam);
    }

    const { data: rows, error, count } = await query;

    if (error) {
      console.error('[/api/registry/list] DB error:', error);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }

    // ── Dedup: check against discovered_companies + flytbase_partners ──

    // Load all normalized names from both tables (cached per request)
    const [{ data: discoveredRows }, { data: partnerRows }] = await Promise.all([
      db.from('discovered_companies').select('normalized_name, display_name'),
      db.from('flytbase_partners').select('normalized_name, name'),
    ]);

    const discoveredNames = new Set((discoveredRows ?? []).map(r => r.normalized_name));
    const partnerNormalizedNames = (partnerRows ?? []).map(r => r.normalized_name);

    // Compute dedup for each row
    const enrichedRows = (rows ?? []).map(row => {
      const normalized = normalizeCompanyName(row.company_name);
      const inDiscovered = discoveredNames.has(normalized);
      const partnerMatch = fuzzyMatchCompany(row.company_name, partnerNormalizedNames);
      const inPartners = partnerMatch.match !== null && partnerMatch.confidence === 'high';

      return {
        ...row,
        dedup: {
          in_discovered: inDiscovered,
          in_partners: inPartners,
          partner_match_name: inPartners ? partnerMatch.match : null,
          normalized_name: normalized,
        },
      };
    });

    // Aggregate stats
    const countries = [...new Set((rows ?? []).map(r => r.country_code))].sort();

    return NextResponse.json({
      rows: enrichedRows,
      total: count ?? 0,
      offset,
      limit,
      countries,
    });
  } catch (err) {
    console.error('[/api/registry/list] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list registry companies' },
      { status: 500 },
    );
  }
}
