import { NextResponse } from 'next/server';
import { loadRuns, loadAllScoredArticles } from '@/lib/db';

/**
 * GET /api/runs
 *
 * Returns all persisted runs and scored articles for dashboard restoration.
 * Called once on page mount to hydrate the UI from the database.
 */
export async function GET() {
  try {
    const [runs, scoredArticles] = await Promise.all([
      loadRuns(),
      loadAllScoredArticles(),
    ]);

    // Build runArticleMap: run_id → article_id[]
    const runArticleMap: Record<string, string[]> = {};
    for (const item of scoredArticles) {
      const runId = item.article.run_id;
      if (!runId) continue;
      if (!runArticleMap[runId]) runArticleMap[runId] = [];
      runArticleMap[runId].push(item.article.id);
    }

    return NextResponse.json({ runs, scoredArticles, runArticleMap });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load runs';
    console.error('[/api/runs]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
