import { NextResponse } from 'next/server';
import { requireSupabase } from '@/lib/supabase';

/**
 * GET /api/pipeline
 * Returns all pipeline leads ordered by created_at desc.
 */
export async function GET() {
  try {
    const db = requireSupabase();
    const { data, error } = await db
      .from('pipeline_leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[/api/pipeline] GET failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/pipeline
 * Creates a new pipeline lead. Guards against duplicates via DB unique index.
 */
export async function POST(req: Request) {
  try {
    const db = requireSupabase();
    const body = await req.json() as {
      deal_name?: string;
      company_name: string;
      score?: string;
      region?: string;
      signal?: string;
      source?: string;
      source_article_id?: string;
      is_known_partner?: boolean;
    };

    if (!body.company_name?.trim()) {
      return NextResponse.json({ error: 'company_name is required' }, { status: 400 });
    }

    const companyName = body.company_name.trim();
    // Escape LIKE special chars for safe ilike matching
    const escapedName = companyName.replace(/[%_\\]/g, '\\$&');

    // Check for existing active lead (mirrors the unique index guard)
    const { data: existing } = await db
      .from('pipeline_leads')
      .select('id, stage')
      .ilike('company_name', escapedName)
      .neq('stage', 'lost_archived')
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Company already in pipeline', existing_id: existing.id }, { status: 409 });
    }

    // Check for archived lead to reactivate
    const { data: archived } = await db
      .from('pipeline_leads')
      .select('*')
      .ilike('company_name', escapedName)
      .eq('stage', 'lost_archived')
      .limit(1)
      .maybeSingle();

    let lead;

    if (archived) {
      // Reactivate archived lead
      const { data: updated, error: updateErr } = await db
        .from('pipeline_leads')
        .update({ stage: 'prospect', updated_at: new Date().toISOString() })
        .eq('id', archived.id)
        .select('*')
        .single();

      if (updateErr) throw updateErr;
      lead = updated;

      // Log reactivation event
      await db.from('pipeline_events').insert({
        lead_id: lead.id,
        from_stage: 'lost_archived',
        to_stage: 'prospect',
        note: 'Reactivated from Partner Hit List',
      });
    } else {
      // Insert new lead
      const { data: inserted, error: insertErr } = await db
        .from('pipeline_leads')
        .insert({
          deal_name: body.deal_name ?? `DJI Dock – ${companyName}`,
          company_name: companyName,
          score: body.score ?? null,
          region: body.region ?? null,
          signal: body.signal ?? null,
          source: body.source ?? null,
          source_article_id: body.source_article_id ?? null,
          is_known_partner: body.is_known_partner ?? false,
          stage: 'prospect',
        })
        .select('*')
        .single();

      if (insertErr) throw insertErr;
      lead = inserted;

      // Log creation event
      await db.from('pipeline_events').insert({
        lead_id: lead.id,
        from_stage: null,
        to_stage: 'prospect',
        note: 'Added from Partner Hit List',
      });
    }

    return NextResponse.json(lead, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[/api/pipeline] POST failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
