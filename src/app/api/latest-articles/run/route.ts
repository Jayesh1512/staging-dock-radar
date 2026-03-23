import { NextResponse } from 'next/server';
import {
  loadLatestArticlesScheduleConfig,
  type LatestArticlesScheduleConfig,
} from '@/server/latestArticlesScheduleStore';
import { runLatestArticlesFlow } from '@/server/runLatestArticlesFlow';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<LatestArticlesScheduleConfig>;
    const existing = await loadLatestArticlesScheduleConfig();
    const config: LatestArticlesScheduleConfig = {
      ...existing,
      ...body,
      enabled: body.enabled === undefined ? existing.enabled : Boolean(body.enabled),
    };
    const result = await runLatestArticlesFlow(config);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to run latest articles';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

