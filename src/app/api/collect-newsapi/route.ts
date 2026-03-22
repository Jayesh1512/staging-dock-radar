import { NextResponse } from 'next/server';

/**
 * POST /api/collect-newsapi — disabled.
 * NewsAPI / `NEWSAPI_KEY` are not used; collection is Google News (and other sources) only.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'NewsAPI collection is disabled; NEWSAPI_KEY is not used.' },
    { status: 501 },
  );
}
