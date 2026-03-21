import { NextResponse } from 'next/server';
import { requireSupabase } from '@/lib/supabase';

const VALID_STAGES = new Set([
  'prospect', 'connecting_linkedin', 'connecting_email',
  'scheduling_meeting', 'sent_to_crm', 'lost_archived',
]);

/**
 * PATCH /api/pipeline/:id/stage
 * Moves a pipeline lead to a new stage. Logs the transition event.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const db = requireSupabase();
    const { stage, note } = await req.json() as { stage: string; note?: string };

    if (!stage || !VALID_STAGES.has(stage)) {
      return NextResponse.json({ error: `Invalid stage: ${stage}` }, { status: 400 });
    }

    // Fetch current state
    const { data: current, error: fetchErr } = await db
      .from('pipeline_leads')
      .select('id, stage')
      .eq('id', id)
      .single();

    if (fetchErr || !current) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Update stage
    const { data: updated, error: updateErr } = await db
      .from('pipeline_leads')
      .update({ stage, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr) throw updateErr;

    // Log event
    await db.from('pipeline_events').insert({
      lead_id: id,
      from_stage: current.stage,
      to_stage: stage,
      note: note ?? null,
    });

    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[/api/pipeline/stage] PATCH failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
