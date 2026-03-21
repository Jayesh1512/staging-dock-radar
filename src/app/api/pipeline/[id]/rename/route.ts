import { NextResponse } from 'next/server';
import { requireSupabase } from '@/lib/supabase';

/**
 * PATCH /api/pipeline/:id/rename
 * Updates the deal name of a pipeline lead.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const db = requireSupabase();
    const { deal_name } = await req.json() as { deal_name: string };

    if (!deal_name?.trim()) {
      return NextResponse.json({ error: 'deal_name is required' }, { status: 400 });
    }

    const { data: updated, error } = await db
      .from('pipeline_leads')
      .update({ deal_name: deal_name.trim(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    if (!updated) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[/api/pipeline/rename] PATCH failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
