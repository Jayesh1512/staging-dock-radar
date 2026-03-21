import { NextResponse } from 'next/server';
import { requireSupabase } from '@/lib/db';

/**
 * GET /api/companies/dismiss
 * Returns list of normalized_names with status = 'dismissed'.
 */
export async function GET() {
  try {
    const db = requireSupabase();
    const { data, error } = await db
      .from('discovered_companies')
      .select('normalized_name')
      .eq('status', 'dismissed');

    if (error) {
      console.error('[/api/companies/dismiss] GET error:', error);
      return NextResponse.json([], { status: 500 });
    }

    return NextResponse.json((data ?? []).map(r => r.normalized_name));
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}

/**
 * PATCH /api/companies/dismiss
 * Toggle discovered_companies status between 'active' and 'dismissed'.
 * Body: { normalized_name: string, status: 'active' | 'dismissed' }
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json() as {
      normalized_name?: string;
      status?: string;
    };

    if (!body.normalized_name || !body.status || !['active', 'dismissed'].includes(body.status)) {
      return NextResponse.json(
        { error: 'normalized_name and status (active|dismissed) are required' },
        { status: 400 },
      );
    }

    const db = requireSupabase();
    const { error } = await db
      .from('discovered_companies')
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq('normalized_name', body.normalized_name);

    if (error) {
      console.error('[/api/companies/dismiss] DB error:', error);
      return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
    }

    return NextResponse.json({ success: true, normalized_name: body.normalized_name, status: body.status });
  } catch (err) {
    console.error('[/api/companies/dismiss] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update' },
      { status: 500 },
    );
  }
}
