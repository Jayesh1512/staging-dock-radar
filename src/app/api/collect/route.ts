import { NextResponse } from 'next/server';
import { searchGoogleNewsRss, mapToArticle, COUNTRY_TO_EDITION } from '@/lib/google-news-rss';
import { deduplicateWithinRun } from '@/lib/dedup';
import { insertRun, insertArticles } from '@/lib/db';
import { requireSupabase } from '@/lib/supabase';
import type { PipelineStats, Run } from '@/lib/types';

/**
 * Limits concurrent async tasks to `limit` at a time.
 * Prevents Google News RSS from throttling on large keyword x region grids.
 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      keywords: string[];
      regions: string[];
      filterDays: number;
      maxArticles: number;
      minScore: number;
    };

    const { keywords, regions, filterDays, maxArticles, minScore } = body;

    if (!keywords?.length) {
      return NextResponse.json({ error: 'At least one keyword is required' }, { status: 400 });
    }

    // Generate run ID early so articles can reference it
    const runId = `run_${new Date().toISOString().replace(/[:.TZ-]/g, '').slice(0, 15)}`;

    // Map selected country names -> unique Google News editions (deduplicate by gl code)
    const editionMap = new Map<string, { gl: string; ceid: string }>();
    for (const region of (regions ?? [])) {
      const edition = COUNTRY_TO_EDITION[region];
      if (edition && !editionMap.has(edition.gl)) {
        editionMap.set(edition.gl, edition);
      }
    }
    // Fall back to US edition if no valid regions resolved
    const targetEditions = editionMap.size > 0
      ? [...editionMap.values()]
      : [{ gl: 'US', ceid: 'US:en' }];

    // ── Step 1: Fetch from Google News RSS ───────────────────────────────────
    const calls = keywords.flatMap((keyword) =>
      targetEditions.map((edition) => () => searchGoogleNewsRss(keyword, edition, filterDays)),
    );
    const rawResults = await runWithConcurrency(calls, 5);
    const allRaw = rawResults.flat();
    const totalFetched = allRaw.length;

    // ── Step 2: Date safety net ──────────────────────────────────────────────
    const cutoff = new Date(Date.now() - filterDays * 86_400_000);
    const dateFiltered = allRaw.filter((a) => {
      // Reject articles with no publication date — cannot confirm they are within range
      if (!a.published_at) return false;
      return new Date(a.published_at) >= cutoff;
    });

    // ── Step 3: Cross-keyword dedup (within this run only) ──────────────────
    const { deduplicated, removedCount } = deduplicateWithinRun(dateFiltered);

    // ── Step 4: Cap at maxArticles ───────────────────────────────────────────
    const capped = deduplicated.slice(0, maxArticles ?? 20);

    // ── Map to canonical Article type with generated IDs ────────────────────
    // D4 scoring cache (skip LLM for already-scored articles) runs in /api/score
    const ts = Date.now();
    const articles = capped.map((raw, i) => mapToArticle(raw, `article_${ts}_${i}`, runId));

    const stats: PipelineStats = {
      totalFetched,
      afterDateFilter: dateFiltered.length,
      afterDedup: deduplicated.length,
      afterScoreFilter: capped.length,
      stored: articles.length,
      dedupRemoved: removedCount,
      scoreFilterRemoved: 0,
    };

    // ── Persist to Supabase ──────────────────────────────────────────────────
    const run: Run = {
      id: runId,
      keywords,
      sources: ['google_news'],
      regions: regions ?? [],
      filter_days: filterDays,
      min_score: minScore ?? 40,
      max_articles: maxArticles,
      status: 'completed',
      articles_fetched: totalFetched,
      articles_stored: articles.length,
      dedup_removed: removedCount,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };

    try {
      await insertRun(run);
      const { insertedCount, idMap } = await insertArticles(articles);

      // Remap cross-run duplicate article IDs to their existing DB IDs.
      // This ensures the scoring FK (scored_articles.article_id → articles.id) works
      // even when the same article appears in multiple runs.
      if (idMap.size > 0) {
        for (const a of articles) {
          const dbId = idMap.get(a.id);
          if (dbId) a.id = dbId;
        }
        console.log(`[/api/collect] DB: ${idMap.size} articles remapped to existing DB IDs (cross-run dedup)`);
      }

      console.log(`[/api/collect] DB: run ${runId}, ${insertedCount} new articles persisted`);
    } catch (dbErr) {
      // DB write failure is non-fatal — data still returned to client
      console.error('[/api/collect] DB write failed (non-fatal):', dbErr instanceof Error ? dbErr.message : dbErr);
    }

    return NextResponse.json({
      articles,
      stats,
      runId,
      keywords,
      regions: regions ?? [],
      filterDays,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[/api/collect]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
