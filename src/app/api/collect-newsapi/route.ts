import { NextResponse } from 'next/server';
import { searchNewsAPI, mapToArticle as mapNewsAPIArticle } from '@/lib/newsapi';
import { deduplicateWithinRun } from '@/lib/dedup';
import { insertRun, insertArticles } from '@/lib/db';
import type { ArticleSource, PipelineStats, Run } from '@/lib/types';

/**
 * POST /api/collect-newsapi
 *
 * Dedicated endpoint for NewsAPI collection.
 * Fetches articles only from NewsAPI, applies the same filtering/dedup pipeline,
 * and stores them in the same database format for seamless integration with scoring.
 *
 * Request body:
 * {
 *   keywords: string[];
 *   filterDays: number;
 *   maxArticles?: number;
 *   minScore?: number;
 *   start_date?: string;   // YYYY-MM-DD for historical searches
 *   end_date?: string;     // YYYY-MM-DD for historical searches
 *   campaign?: string;     // Campaign identifier
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      keywords: string[];
      filterDays: number;
      maxArticles?: number;
      minScore?: number;
      start_date?: string;
      end_date?: string;
      campaign?: string;
    };

    const {
      keywords,
      filterDays,
      maxArticles = 20,
      minScore = 40,
      start_date,
      end_date,
      campaign,
    } = body;

    if (!keywords?.length) {
      return NextResponse.json({ error: 'At least one keyword is required' }, { status: 400 });
    }

    // Generate run ID
    const runId = `run_${new Date().toISOString().replace(/[:.TZ-]/g, '').slice(0, 15)}`;

    // ── Step 1: Fetch from NewsAPI only ──────────────────────────────────────
    const dateRange = (start_date && end_date) ? { start_date, end_date } : undefined;
    const allRaw: any[] = [];

    // Fetch articles for each keyword sequentially (NewsAPI doesn't need regional editions)
    for (const keyword of keywords) {
      try {
        const results = await searchNewsAPI(keyword, filterDays, 'en', dateRange);
        allRaw.push(...results);
      } catch (err) {
        console.error(`[/api/collect-newsapi] Failed to fetch keyword "${keyword}":`, err instanceof Error ? err.message : err);
        // Continue with other keywords instead of failing entire request
      }
    }

    const totalFetched = allRaw.length;

    // ── Step 2: Date safety net ──────────────────────────────────────────────
    // Campaign mode: use explicit date window; Regular mode: relative days from now
    const cutoffStart = dateRange
      ? new Date(dateRange.start_date)
      : new Date(Date.now() - filterDays * 86_400_000);
    const cutoffEnd = dateRange
      ? new Date(new Date(dateRange.end_date).getTime() + 86_400_000) // end_date is inclusive
      : new Date(Date.now() + 86_400_000); // allow 1 day ahead for timezone drift

    const dateFiltered = allRaw.filter((a) => {
      if (!a.published_at) return false;
      const pub = new Date(a.published_at);
      return pub >= cutoffStart && pub <= cutoffEnd;
    });

    // ── Step 3: Cross-keyword dedup (within this run only) ──────────────────
    const { deduplicated, removedCount } = deduplicateWithinRun(dateFiltered);

    // ── Step 4: Cap at maxArticles ───────────────────────────────────────────
    const capped = deduplicated.slice(0, maxArticles);

    // ── Step 5: Map to canonical Article type with generated IDs ──────────────
    const ts = Date.now();
    const articles = capped.map((raw, i) => {
      return mapNewsAPIArticle(raw, `article_${ts}_${i}`, runId);
    });

    const stats: PipelineStats = {
      totalFetched,
      afterDateFilter: dateFiltered.length,
      afterDedup: deduplicated.length,
      afterScoreFilter: capped.length,
      stored: articles.length,
      dedupRemoved: removedCount,
      scoreFilterRemoved: 0,
    };

    // ── Step 6: Persist to Supabase ──────────────────────────────────────────
    const run: Run = {
      id: runId,
      keywords,
      sources: ['newsapi'] as ArticleSource[],
      regions: [], // NewsAPI doesn't use regions, but field must exist in Run type
      filter_days: filterDays,
      min_score: minScore,
      max_articles: maxArticles,
      status: 'completed',
      articles_fetched: totalFetched,
      articles_stored: articles.length,
      dedup_removed: removedCount,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      campaign: campaign ?? null,
    };

    try {
      await insertRun(run);
      const { insertedCount, idMap } = await insertArticles(articles);

      // Remap cross-run duplicate article IDs to their existing DB IDs
      if (idMap.size > 0) {
        for (const a of articles) {
          const dbId = idMap.get(a.id);
          if (dbId) a.id = dbId;
        }
        console.log(`[/api/collect-newsapi] DB: ${idMap.size} articles remapped to existing DB IDs (cross-run dedup)`);
      }

      console.log(`[/api/collect-newsapi] DB: run ${runId}, ${insertedCount} new articles persisted`);
    } catch (dbErr) {
      // DB write failure is non-fatal — data still returned to client
      console.error('[/api/collect-newsapi] DB write failed (non-fatal):', dbErr instanceof Error ? dbErr.message : dbErr);
    }

    return NextResponse.json({
      articles,
      stats,
      runId,
      keywords,
      filterDays,
      campaign: campaign ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[/api/collect-newsapi]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
