import { NextResponse } from 'next/server';
import { requireSupabase } from '@/lib/db';

/**
 * PATCH /api/registry/review
 * Bulk update qa_status for selected registry companies.
 * Body: { ids: string[], qa_status: 'approved' | 'rejected', qa_notes?: string }
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json() as {
      ids?: string[];
      qa_status?: string;
      qa_notes?: string;
    };

    if (!body.ids || body.ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }
    if (!body.qa_status || !['approved', 'rejected'].includes(body.qa_status)) {
      return NextResponse.json({ error: 'qa_status must be "approved" or "rejected"' }, { status: 400 });
    }

    const db = requireSupabase();
    const updatePayload: Record<string, unknown> = {
      qa_status: body.qa_status,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (body.qa_notes !== undefined) {
      updatePayload.qa_notes = body.qa_notes;
    }

    const { error, count } = await db
      .from('country_registered_companies')
      .update(updatePayload)
      .in('id', body.ids)
      .neq('qa_status', 'merged'); // Don't change status of already-merged rows

    if (error) {
      console.error('[/api/registry/review] DB error:', error);
      return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      updated: count ?? body.ids.length,
      qa_status: body.qa_status,
    });
  } catch (err) {
    console.error('[/api/registry/review] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to review' },
      { status: 500 },
    );
  }
}
