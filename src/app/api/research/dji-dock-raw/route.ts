import { NextResponse } from 'next/server';
import {
  DJI_DOCK_SNAPSHOT_KEYWORD,
  fetchAllGoogleNewsDjiDock24h,
  fetchLinkedInViaScraperapiAllCountries,
} from '@/lib/research/djiDockSnapshot';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  try {
    const googleNews = await fetchAllGoogleNewsDjiDock24h();

    const scraperKey = process.env.SCRAPERAPI_KEY?.trim();
    if (!scraperKey) {
      return NextResponse.json({
        keyword: DJI_DOCK_SNAPSHOT_KEYWORD,
        googleNews,
        linkedin: [],
        linkedinSkipped: true as const,
        linkedinSkipReason: 'SCRAPERAPI_KEY is not set in the environment (.env.local).',
      });
    }

    const linkedin = await fetchLinkedInViaScraperapiAllCountries(scraperKey, DJI_DOCK_SNAPSHOT_KEYWORD);

    return NextResponse.json({
      keyword: DJI_DOCK_SNAPSHOT_KEYWORD,
      googleNews,
      linkedin,
      linkedinSkipped: false as const,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[/api/research/dji-dock-raw]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
