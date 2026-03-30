import { NextRequest, NextResponse } from 'next/server';
import { requireSupabase } from '@/lib/supabase';

/**
 * GET /api/partners/multi-source?country=FR&verified=true
 *
 * Returns companies from multi_sources_companies_import.
 * Used by the Multi-Source Intelligence V2 tab.
 *
 * Query params:
 *   country   — ISO-2 code (default: FR)
 *   verified  — "true" (default, dock_verified=true only) | "all" (includes false/null)
 */

/* ─── Source badge config (shared with UI) ─── */

const SOURCE_BADGE_MAP: Record<string, { key: string; label: string; fullLabel: string }> = {
  dji_dealer:            { key: 'dji_dealer',            label: 'DJI',    fullLabel: 'DJI Enterprise Dealer' },
  fr_sirene:             { key: 'fr_sirene',             label: 'Reg',    fullLabel: 'SIRENE Registry (FR)' },
  nl_aviation_registry:  { key: 'nl_aviation_registry',  label: 'Reg',    fullLabel: 'Aviation Registry (NL)' },
  comet:                 { key: 'comet',                 label: 'Comet',  fullLabel: 'Comet Intelligence' },
  google_search:         { key: 'google_search',         label: 'Google', fullLabel: 'Google Search' },
  chatgpt:               { key: 'chatgpt',               label: 'GPT',    fullLabel: 'ChatGPT Research' },
  claude:                { key: 'claude',                 label: 'Claude', fullLabel: 'Claude Research' },
};

/* ─── Types ─── */

interface VerificationEntry {
  method: string;
  hits: number;
  url: string | null;
  relevance: string;
  at: string;
  keywords_matched: string[];
  post_date: string | null;
  note: string | null;
}

interface MultiSourceCompany {
  rank: number;
  normalized_name: string;
  display_name: string;
  website: string | null;
  linkedin: string | null;
  country_code: string;
  source_count: number;
  source_types: string[];
  dock_verified: boolean | null;
  dock_models: string | null;
  role: string | null;
  evidence_urls: string[];
  evidence_count: number;
  verifications: VerificationEntry[];
  matches_priority: boolean;
  import_batch: string | null;
  source_refs: Record<string, unknown> | null;
}

interface ApiResponse {
  country: string;
  filter: 'verified' | 'all';
  total: number;
  stats: {
    verified: number;
    not_verified: number;
    unchecked: number;
    multi_source: number;
    with_evidence: number;
    with_website: number;
    with_linkedin: number;
    priority_matches: number;
  };
  source_breakdown: Record<string, number>;
  companies: MultiSourceCompany[];
}

export async function GET(req: NextRequest) {
  try {
    const db = requireSupabase();
    const country = req.nextUrl.searchParams.get('country')?.toUpperCase() ?? 'FR';
    const verifiedParam = req.nextUrl.searchParams.get('verified') ?? 'true';
    const verifiedOnly = verifiedParam === 'true';

    // Build query
    let query = db
      .from('multi_sources_companies_import')
      .select(
        'normalized_name, display_name, company_name, website, linkedin, country_code, ' +
        'source_types, source_refs, dock_verified, dock_models, role, ' +
        'verifications, import_batch, normalized_domain',
      )
      .eq('country_code', country);

    if (verifiedOnly) {
      query = query.eq('dock_verified', true);
    }

    const { data: rows, error } = await query.order('display_name', { ascending: true });
    if (error) throw new Error(error.message);

    type Row = {
      normalized_name: string;
      display_name: string | null;
      company_name: string | null;
      website: string | null;
      linkedin: string | null;
      country_code: string;
      source_types: string[] | null;
      source_refs: Record<string, unknown> | null;
      dock_verified: boolean | null;
      dock_models: string | null;
      role: string | null;
      verifications: VerificationEntry[] | null;
      import_batch: string | null;
      normalized_domain: string | null;
    };
    const allRows = (rows ?? []) as unknown as Row[];

    // Build companies
    const companies: MultiSourceCompany[] = allRows.map((r, idx) => {
      const verifications = (r.verifications ?? []) as VerificationEntry[];
      const evidenceUrls = [
        ...new Set(
          verifications
            .map((v) => v.url)
            .filter((u): u is string => !!u),
        ),
      ];
      const sourceTypes = (r.source_types ?? []) as string[];
      const sourceCount = sourceTypes.length;
      const hasEvidence = evidenceUrls.length > 0;
      const matchesPriority = sourceCount >= 2 && hasEvidence;

      return {
        rank: idx + 1,
        normalized_name: r.normalized_name,
        display_name: r.display_name || r.company_name || r.normalized_name,
        website: r.website,
        linkedin: r.linkedin,
        country_code: r.country_code,
        source_count: sourceCount,
        source_types: sourceTypes,
        dock_verified: r.dock_verified,
        dock_models: r.dock_models,
        role: r.role,
        evidence_urls: evidenceUrls,
        evidence_count: evidenceUrls.length,
        verifications,
        matches_priority: matchesPriority,
        import_batch: r.import_batch,
        source_refs: r.source_refs as Record<string, unknown> | null,
      };
    });

    // Sort: priority first → multi-source → verified → alphabetical
    companies.sort((a, b) => {
      if (a.matches_priority !== b.matches_priority) return a.matches_priority ? -1 : 1;
      if (a.source_count !== b.source_count) return b.source_count - a.source_count;
      if (a.dock_verified !== b.dock_verified) {
        if (a.dock_verified === true) return -1;
        if (b.dock_verified === true) return 1;
      }
      return (a.display_name ?? '').localeCompare(b.display_name ?? '');
    });

    // Re-rank after sort
    companies.forEach((c, i) => { c.rank = i + 1; });

    // Stats
    const verified = allRows.filter((r) => r.dock_verified === true).length;
    const notVerified = allRows.filter((r) => r.dock_verified === false).length;
    const unchecked = allRows.filter((r) => r.dock_verified == null).length;
    const multiSource = companies.filter((c) => c.source_count >= 2).length;
    const withEvidence = companies.filter((c) => c.evidence_count > 0).length;
    const withWebsite = allRows.filter((r) => r.website?.trim()).length;
    const withLinkedin = allRows.filter((r) => r.linkedin?.trim()).length;
    const priorityMatches = companies.filter((c) => c.matches_priority).length;

    // Source breakdown
    const sourceBreakdown: Record<string, number> = {};
    for (const r of allRows) {
      for (const s of (r.source_types ?? []) as string[]) {
        sourceBreakdown[s] = (sourceBreakdown[s] ?? 0) + 1;
      }
    }

    const response: ApiResponse = {
      country,
      filter: verifiedOnly ? 'verified' : 'all',
      total: companies.length,
      stats: {
        verified,
        not_verified: notVerified,
        unchecked,
        multi_source: multiSource,
        with_evidence: withEvidence,
        with_website: withWebsite,
        with_linkedin: withLinkedin,
        priority_matches: priorityMatches,
      },
      source_breakdown: sourceBreakdown,
      companies,
    };

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
