import { NextRequest, NextResponse } from 'next/server';
import { requireSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ResellerRow = {
  id: number;
  name: string;
  linkedin_url: string | null;
};

function extractCompanySlug(linkedinUrl: string | null): string | null {
  const url = String(linkedinUrl || '').trim();
  if (!url) return null;
  const match = url.match(/linkedin\.com\/company\/([^/?#]+)/i);
  if (!match?.[1]) return null;
  const slug = decodeURIComponent(match[1]).trim().replace(/^\/+|\/+$/g, '');
  if (!slug) return null;
  if (!/^[a-zA-Z0-9-]+$/.test(slug)) return null;
  return slug.toLowerCase();
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const offset = Math.max(0, Number(searchParams.get('offset') ?? 0) || 0);
    const batchSize = Math.min(500, Math.max(1, Number(searchParams.get('batchSize') ?? 100) || 100));

    const db = requireSupabase();
    const end = offset + batchSize - 1;
    const { data, error, count } = await db
      .from('dji_resellers')
      .select('id, name, linkedin_url', { count: 'exact' })
      .not('linkedin_url', 'is', null)
      .order('id', { ascending: true })
      .range(offset, end);

    if (error) {
      throw new Error(error.message);
    }

    const rows = ((data ?? []) as ResellerRow[])
      .map((row) => {
        const companySlug = extractCompanySlug(row.linkedin_url);
        if (!companySlug) return null;
        return {
          id: row.id,
          name: row.name,
          linkedinUrl: row.linkedin_url,
          companySlug,
        };
      })
      .filter((row): row is { id: number; name: string; linkedinUrl: string | null; companySlug: string } => !!row);

    const total = count ?? 0;
    const nextOffset = offset + batchSize < total ? offset + batchSize : null;

    return NextResponse.json({
      rows,
      offset,
      batchSize,
      total,
      nextOffset,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load DJI resellers with LinkedIn URLs' },
      { status: 500 },
    );
  }
}
