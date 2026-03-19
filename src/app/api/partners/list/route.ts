import { NextResponse } from 'next/server';
import { loadFlytBasePartners } from '@/lib/db';

/**
 * GET /api/partners/list
 * Returns all uploaded partners with region info
 */
export async function GET() {
  try {
    const partners = await loadFlytBasePartners();
    return NextResponse.json(partners);
  } catch (err) {
    console.error('[/api/partners/list] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load partners' },
      { status: 500 },
    );
  }
}
