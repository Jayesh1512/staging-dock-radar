import { NextRequest, NextResponse } from 'next/server';
import { requireSupabase } from '@/lib/supabase';

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

export async function GET(req: NextRequest) {
  try {
    const limitParam = req.nextUrl.searchParams.get('limit');
    const limit = Math.max(1, Math.min(10, Number(limitParam) || 5));

    const db = requireSupabase();

    const { data: rows, error } = await db
      .from('multi_sources_companies_import')
      // Need all table fields for the "All data from the table" UI.
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);

    const companies = (rows ?? []).map((r, idx) => {
      const row = r as unknown as Record<string, unknown>;

      const normalizedName = (row.normalized_name ?? '') as string;
      const displayName = (row.display_name ?? row.company_name ?? row.normalized_name ?? '') as string;

      const sourceTypes = (row.source_types ?? []) as string[];
      const verifications = (row.verifications ?? []) as VerificationEntry[];

      const evidenceUrls = Array.from(
        new Set(verifications.map(v => v.url).filter((u): u is string => !!u)),
      );

      const sourceCount = sourceTypes.length;
      const evidenceCount = evidenceUrls.length;
      const matchesPriority = sourceCount >= 2 && evidenceCount > 0;

      return {
        rank: idx + 1,
        // Convenience fields for the UI (while still returning the full row).
        normalized_name: normalizedName,
        display_name: displayName,
        website: (row.website ?? null) as string | null,
        linkedin: (row.linkedin ?? null) as string | null,
        country_code: (row.country_code ?? '') as string,
        source_count: sourceCount,
        source_types: sourceTypes,
        dock_verified: (row.dock_verified ?? null) as boolean | null,
        dock_models: (row.dock_models ?? null) as string | null,
        role: (row.role ?? null) as string | null,
        verifications,

        // Full row payload for "all table data" requirement.
        row,

        evidence_urls: evidenceUrls,
        evidence_count: evidenceCount,
        matches_priority: matchesPriority,
        updated_at: (row.updated_at ?? null) as string | null,
      };
    });

    return NextResponse.json({
      total: companies.length,
      companies,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

