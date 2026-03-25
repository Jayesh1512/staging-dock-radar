import { NextResponse } from 'next/server';
import { requireSupabase } from '@/lib/db';

/**
 * PATCH /api/registry/enrich
 * Update website/linkedin for a specific registry company.
 * Body: { id: string, website?: string, linkedin?: string, city?: string, address?: string }
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json() as {
      id?: string;
      website?: string;
      linkedin?: string;
      city?: string;
      address?: string;
    };

    if (!body.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.website !== undefined) updatePayload.website = body.website || null;
    if (body.linkedin !== undefined) updatePayload.linkedin = body.linkedin || null;
    if (body.city !== undefined) updatePayload.city = body.city || null;
    if (body.address !== undefined) updatePayload.address = body.address || null;

    if (Object.keys(updatePayload).length === 1) {
      return NextResponse.json({ error: 'At least one field to update is required' }, { status: 400 });
    }

    const db = requireSupabase();
    const { error } = await db
      .from('country_registered_companies')
      .update(updatePayload)
      .eq('id', body.id);

    if (error) {
      console.error('[/api/registry/enrich] DB error:', error);
      return NextResponse.json({ error: 'Failed to update enrichment' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: body.id });
  } catch (err) {
    console.error('[/api/registry/enrich] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to enrich' },
      { status: 500 },
    );
  }
}
