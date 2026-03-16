import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { fetchContentSearch } from '@/lib/linkedin/contentClient';
import type { Article, CollectResult, PipelineStats, Run } from '@/lib/types';
import { insertArticles, insertRun } from '@/lib/db';
import { normalizeUrl } from '@/lib/google-news-rss';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sanitizeText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
    .replace(/[\u0080-\u009F]/g, '')
    .replace(/[\u2000-\u200D]/g, '')
    .replace(/[\uFFF0-\uFFFF]/g, '')
    .trim();
}

function createTitle(postContent: string): string {
  if (!postContent) return '(LinkedIn post)';
  const sanitized = sanitizeText(postContent);
  return sanitized.replace(/\s+/g, ' ').trim();
}

function parseLinkedInDate(timeStr: string | null): string | null {
  if (!timeStr) return null;
  try {
    const now = new Date();
    const lowerTime = timeStr.toLowerCase().trim();

    const match = lowerTime.match(/^(\d+)\s*([hdwmy])$/);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2];
      const date = new Date(now);

      switch (unit) {
        case 'h':
          date.setHours(date.getHours() - value);
          break;
        case 'd':
          date.setDate(date.getDate() - value);
          break;
        case 'w':
          date.setDate(date.getDate() - value * 7);
          break;
        case 'm':
          date.setMonth(date.getMonth() - value);
          break;
        case 'y':
          date.setFullYear(date.getFullYear() - value);
          break;
      }
      return date.toISOString();
    }

    const parsed = new Date(lowerTime);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
    return null;
  } catch {
    return null;
  }
}

function generateStableId(normalizedUrl: string, keyword: string, authorName: string | null): string {
  const src = `${normalizedUrl}|${authorName ?? ''}|${keyword}`;
  return crypto.createHash('sha256').update(src).digest('hex').slice(0, 16);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      keywords: string[];
      filterDays?: number;
      maxArticles?: number;
      minScore?: number;
    };

    const {
      keywords,
      filterDays = 30,
      maxArticles = 20,
      minScore = 40,
    } = body;

    if (!keywords?.length) {
      return NextResponse.json({ error: 'At least one keyword is required' }, { status: 400 });
    }

    const runId = `run_${new Date().toISOString().replace(/[:.TZ-]/g, '').slice(0, 15)}`;

    // ── Step 1: Scrape LinkedIn per keyword (sequential to reduce throttling) ──
    const allScraped: Array<{
      keyword: string;
      postUrl: string | null;
      postContent: string;
      authorName: string | null;
      publishedAt: string | null;
    }> = [];

    for (const keyword of keywords) {
      console.log(`[/api/collect-linkedin] Scraping keyword: "${keyword}"`);
      try {
        const result = await fetchContentSearch(keyword, { maxScrolls: 5, scrollDelay: 2000 });
        console.log(`[/api/collect-linkedin] "${keyword}": ${result.posts.length} posts`);

        for (const p of result.posts) {
          allScraped.push({ ...p, keyword });
        }

        if (keywords.length > 1) {
          await new Promise((r) => setTimeout(r, 3000));
        }
      } catch (err) {
        console.error(`[/api/collect-linkedin] Keyword "${keyword}" failed:`, err instanceof Error ? err.message : err);
      }
    }

    if (allScraped.length > 0) {
      const first = allScraped[0];
      console.log('[/api/collect-linkedin] First scraped post (preview):');
      console.log(
        JSON.stringify(
          {
            keyword: first.keyword,
            authorName: first.authorName ?? null,
            publishedAt: first.publishedAt ?? null,
            postUrl: first.postUrl ?? null,
            postContentPreview: sanitizeText(first.postContent).slice(0, 280),
          },
          null,
          2,
        ),
      );
    }

    const totalFetched = allScraped.length;

    // ── Step 2: Dedup by normalized URL (best-effort) ────────────────────────
    const seen = new Set<string>();
    const deduped = allScraped.filter((p) => {
      const url = p.postUrl ? normalizeUrl(p.postUrl) : '';
      if (!url) return false;
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });

    // ── Step 3: Date filter (best-effort; keep null dates) ───────────────────
    const cutoff = new Date(Date.now() - filterDays * 86_400_000);
    const dateFiltered = deduped.filter((p) => {
      const iso = parseLinkedInDate(p.publishedAt);
      if (!iso) return true;
      return new Date(iso) >= cutoff;
    });

    // ── Step 4: Cap ──────────────────────────────────────────────────────────
    const capped = dateFiltered.slice(0, maxArticles);

    // ── Map to canonical Article type ─────────────────────────────────────────
    const articles: Article[] = capped.map((p, i) => {
      const url = p.postUrl ?? '';
      const normalized = url ? normalizeUrl(url) : `linkedin_unknown_${Date.now()}_${i}`;
      const id = `article_${generateStableId(normalized, p.keyword, p.authorName)}`;
      return {
        id,
        run_id: runId,
        source: 'linkedin',
        title: createTitle(p.postContent),
        url,
        normalized_url: normalized,
        snippet: sanitizeText(p.postContent).slice(0, 500) || null,
        publisher: p.authorName ?? null,
        published_at: parseLinkedInDate(p.publishedAt),
        created_at: new Date().toISOString(),
      };
    });

    const stats: PipelineStats = {
      totalFetched,
      afterDateFilter: dateFiltered.length,
      afterDedup: deduped.length,
      afterScoreFilter: articles.length,
      stored: articles.length,
      dedupRemoved: totalFetched - deduped.length,
      scoreFilterRemoved: 0,
    };

    const run: Run = {
      id: runId,
      keywords,
      sources: ['linkedin'],
      regions: [],
      filter_days: filterDays,
      min_score: minScore,
      max_articles: maxArticles,
      status: 'completed',
      articles_fetched: totalFetched,
      articles_stored: articles.length,
      dedup_removed: stats.dedupRemoved,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };

    // ── Persist (same pattern as /api/collect; non-fatal on DB failure) ──────
    try {
      await insertRun(run);
      const { insertedCount, idMap } = await insertArticles(articles);

      if (idMap.size > 0) {
        for (const a of articles) {
          const dbId = idMap.get(a.id);
          if (dbId) a.id = dbId;
        }
        console.log(`[/api/collect-linkedin] DB: ${idMap.size} articles remapped to existing DB IDs (cross-run dedup)`);
      }

      console.log(`[/api/collect-linkedin] DB: run ${runId}, ${insertedCount} new articles persisted`);
    } catch (dbErr) {
      console.error('[/api/collect-linkedin] DB write failed (non-fatal):', dbErr instanceof Error ? dbErr.message : dbErr);
    }

    const result: CollectResult = {
      articles,
      stats,
      runId,
      keywords,
      regions: [],
      filterDays,
    };

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[/api/collect-linkedin]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

