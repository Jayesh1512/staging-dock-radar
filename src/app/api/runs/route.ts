import { NextResponse } from 'next/server';
import { loadRuns, loadAllScoredArticles } from '@/lib/db';

/** Parse EXCLUDE_TITLE_KEYWORDS env (comma-separated) for filtering already-scored articles in UI */
function getExcludeTitleKeywords(): string[] {
  const env = process.env.EXCLUDE_TITLE_KEYWORDS;
  if (!env || typeof env !== 'string') return [];
  return env.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Key for same-story dedup when normalized_url differs (e.g. different Google redirect URLs) */
function titlePublisherKey(title: string, publisher: string | null, url: string): string {
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  })();
  const source = (publisher ?? host).trim() || 'unknown';
  return `${title.toLowerCase().trim()}|${source}`;
}

/**
 * GET /api/runs
 *
 * Returns all persisted runs and scored articles for dashboard restoration.
 * Called once on page mount to hydrate the UI from the database.
 * Deduplicates articles across runs so the same story appears in at most one run (the earliest).
 */
export async function GET() {
  try {
    const [runs, rawScoredArticles] = await Promise.all([
      loadRuns(),
      loadAllScoredArticles(),
    ]);

    // Hide already-scored articles that match EXCLUDE_TITLE_KEYWORDS (e.g. "Kansas City")
    const excludeKeywords = getExcludeTitleKeywords();
    const scoredArticles = excludeKeywords.length === 0
      ? rawScoredArticles
      : rawScoredArticles.filter((item) => {
          const titleLower = item.article.title.toLowerCase();
          return !excludeKeywords.some((kw) => titleLower.includes(kw));
        });

    // Sort runs by created_at ascending so we assign each article to the earliest run that has it
    const runsByTime = [...runs].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    const runArticleMap: Record<string, string[]> = {};
    for (const r of runsByTime) runArticleMap[r.id] = [];

    const seenNormalizedUrls = new Set<string>();
    const seenTitlePublisher = new Set<string>();

    for (const run of runsByTime) {
      const seenTitleInRun = new Set<string>(); // same run: show each headline only once
      for (const item of scoredArticles) {
        if (item.article.run_id !== run.id) continue;
        const a = item.article;
        const urlKey = a.normalized_url;
        const titleKey = titlePublisherKey(a.title, a.publisher, a.url);
        const titleOnlyKey = a.title.toLowerCase().trim();
        if (seenNormalizedUrls.has(urlKey) || seenTitlePublisher.has(titleKey)) continue;
        if (seenTitleInRun.has(titleOnlyKey)) continue; // duplicate headline in same run
        runArticleMap[run.id].push(a.id);
        seenNormalizedUrls.add(urlKey);
        seenTitlePublisher.add(titleKey);
        seenTitleInRun.add(titleOnlyKey);
      }
    }

    return NextResponse.json({ runs, scoredArticles, runArticleMap });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load runs';
    console.error('[/api/runs]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
