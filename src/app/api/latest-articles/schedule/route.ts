import { NextResponse } from 'next/server';
import {
  computeNextRunAt,
  loadLatestArticlesScheduleConfig,
  saveLatestArticlesScheduleConfig,
  type LatestArticlesScheduleConfig,
} from '@/server/latestArticlesScheduleStore';
import { ensureLatestArticlesSchedulerStarted } from '@/server/latestArticlesScheduler';

export const runtime = 'nodejs';

function isValidTimeOfDay(t: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(t);
}

export async function GET() {
  const config = await loadLatestArticlesScheduleConfig();
  ensureLatestArticlesSchedulerStarted();
  return NextResponse.json(config);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<LatestArticlesScheduleConfig>;

    const enabled = body.enabled === true;
    const timeOfDay = typeof body.timeOfDay === 'string' ? body.timeOfDay : '09:00';
    if (enabled && !isValidTimeOfDay(timeOfDay)) {
      return NextResponse.json({ error: 'timeOfDay must be HH:mm (24h)' }, { status: 400 });
    }

    const existing = await loadLatestArticlesScheduleConfig();

    const next: LatestArticlesScheduleConfig = {
      ...existing,
      enabled,
      timeOfDay,
      minScore: typeof body.minScore === 'number' ? body.minScore : existing.minScore,
      maxArticles: typeof body.maxArticles === 'number' ? body.maxArticles : existing.maxArticles,
      linkedin30SecScrape: typeof body.linkedin30SecScrape === 'boolean' ? body.linkedin30SecScrape : existing.linkedin30SecScrape,
      linkedinHeadless: typeof body.linkedinHeadless === 'boolean' ? body.linkedinHeadless : existing.linkedinHeadless,
      browserTimeoutMs: typeof body.browserTimeoutMs === 'number' ? body.browserTimeoutMs : existing.browserTimeoutMs,
      nextRunAt: enabled ? computeNextRunAt(timeOfDay, new Date()) : null,
      lastStatus: null,
    };

    await saveLatestArticlesScheduleConfig(next);
    ensureLatestArticlesSchedulerStarted();
    return NextResponse.json(next);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save latest articles schedule';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

