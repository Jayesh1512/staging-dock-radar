import { NextResponse } from 'next/server';
import { deduplicateWithinRun } from '@/lib/dedup';
import { insertRun, insertArticles } from '@/lib/db';
import { validateArticles, formatValidationErrors } from '@/lib/article-validation';
import type { ArticleSource, PipelineStats, Run } from '@/lib/types';

/**
 * POST /api/import-articles
 *
 * Imports articles from Comet crawler (or any external JSON source).
 * Expects the same article structure as collected from other sources.
 * Applies dedup pipeline and stores articles in the database.
 *
 * Request body:
 * {
 *   articles: Array<{
 *     title: string;
 *     url: string;
 *     normalized_url: string;
 *     snippet: string | null;
 *     publisher: string | null;
 *     published_at: string | null; // ISO 8601 format
 *     source: 'google_news' | 'newsapi' | 'linkedin' | 'facebook' | 'comet_crawler';
 *     keyword?: string;
 *   }>;
 *   source: 'comet_crawler' | 'custom_feed'; // What collected these articles
 *   maxArticles?: number; // Default 50
 *   campaign?: string; // Campaign identifier (optional)
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      articles: Array<{
        title: string;
        url: string;
        normalized_url: string;
        snippet: string | null;
        publisher: string | null;
        published_at: string | null;
        source?: ArticleSource;
        keyword?: string;
      }>;
      source: ArticleSource | string;
      maxArticles?: number;
      campaign?: string;
    };

    const { articles: rawArticles, source, maxArticles = 50, campaign } = body;

    if (!Array.isArray(rawArticles) || rawArticles.length === 0) {
      return NextResponse.json(
        { error: 'At least one article is required' },
        { status: 400 }
      );
    }

    // ── Step 0: Validate article schema ──────────────────────────────────────
    const validationResult = validateArticles(rawArticles);
    if (!validationResult.isValid) {
      const errorMessage = formatValidationErrors(validationResult.errors, 5);
      console.warn('[/api/import-articles] Schema validation failed:\n', errorMessage);
      return NextResponse.json(
        {
          error: 'Schema validation failed',
          details: errorMessage,
          errorCount: validationResult.errors.length,
          validationErrors: validationResult.errors.slice(0, 20), // Return first 20 errors
        },
        { status: 400 }
      );
    }

    // Validate required fields
    const validated = rawArticles.filter(a => {
      if (!a.title?.trim() || !a.url?.trim() || !a.normalized_url?.trim()) {
        console.warn('[/api/import-articles] Skipping article with missing required fields:', a);
        return false;
      }
      return true;
    });

    if (validated.length === 0) {
      return NextResponse.json(
        { error: 'No valid articles in request (must have title, url, normalized_url)' },
        { status: 400 }
      );
    }

    // Generate run ID
    const runId = `run_${new Date().toISOString().replace(/[:.TZ-]/g, '').slice(0, 15)}`;
    const totalFetched = validated.length;

    // ── Step 1: Cross-article dedup (within this run only) ────────────────────
    const { deduplicated, removedCount } = deduplicateWithinRun(validated);

    // ── Step 2: Cap at maxArticles ───────────────────────────────────────────
    const capped = deduplicated.slice(0, maxArticles);

    // ── Step 3: Map to canonical Article type with generated IDs ──────────────
    const ts = Date.now();
    const articles = capped.map((raw, i) => {
      return {
        id: `article_${ts}_${i}`,
        run_id: runId,
        // Use the exact source from the incoming JSON if present; otherwise fall back to the top-level source
        source: (raw.source as ArticleSource | undefined) ?? (source as ArticleSource),
        title: raw.title,
        url: raw.url,
        normalized_url: raw.normalized_url,
        snippet: raw.snippet || null,
        publisher: raw.publisher || null,
        published_at: raw.published_at || null,
        created_at: new Date().toISOString(),
      };
    });

    const stats: PipelineStats = {
      totalFetched,
      afterDateFilter: validated.length,
      afterDedup: deduplicated.length,
      afterScoreFilter: capped.length,
      stored: articles.length,
      dedupRemoved: removedCount,
      scoreFilterRemoved: 0,
    };

    // ── Step 4: Persist to Supabase ──────────────────────────────────────────
    const run: Run = {
      id: runId,
      keywords: [source === 'comet_crawler' ? 'comet_import' : source] || [],
      sources: [source as ArticleSource],
      regions: [],
      filter_days: 0, // Not applicable for imports
      min_score: 40,
      max_articles: maxArticles,
      status: 'completed',
      articles_fetched: totalFetched,
      articles_stored: articles.length,
      dedup_removed: removedCount,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      campaign: campaign ?? 'dsp_6mo_sweep',
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
        console.log(
          `[/api/import-articles] DB: ${idMap.size} articles remapped to existing DB IDs (cross-run dedup)`
        );
      }

      console.log(
        `[/api/import-articles] DB: run ${runId}, ${insertedCount} new articles persisted`
      );
    } catch (dbErr) {
      // DB write failure is non-fatal — data still returned to client
      console.error(
        '[/api/import-articles] DB write failed (non-fatal):',
        dbErr instanceof Error ? dbErr.message : dbErr
      );
    }

    return NextResponse.json({
      articles,
      stats,
      runId,
      source,
      campaign: campaign ?? 'dsp_6mo_sweep',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[/api/import-articles]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
