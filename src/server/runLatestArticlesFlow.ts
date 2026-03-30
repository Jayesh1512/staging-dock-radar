import { POST as collectGoogleNews } from '@/app/api/collect/route';
import { POST as collectLinkedIn } from '@/app/api/collect-linkedin/route';
import { POST as scoreArticles } from '@/app/api/score/route';
import { CORE_8_REGIONS, DEFAULTS, LATEST_ARTICLES_24H_KEYWORD } from '@/lib/constants';
import { dedupeArticlesByNormalizedUrl } from '@/lib/dedup';
import type { Article, ArticleWithScore } from '@/lib/types';
import type { LatestArticlesScheduleConfig } from './latestArticlesScheduleStore';
import { NextRequest } from 'next/server';

const SCORE_CHUNK_SIZE = 40; // Must be <= /api/score MAX_BATCH (currently 50)

async function callRoutePost<T>(
  handler: (req: NextRequest) => Promise<Response>,
  body: unknown,
): Promise<T> {
  const req = new NextRequest('http://localhost/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await handler(req);
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const msg = (() => {
      if (!json || typeof json !== 'object') return `HTTP ${res.status}`;
      const maybe = json as Record<string, unknown>;
      const err = maybe.error;
      return typeof err === 'string' ? err : `HTTP ${res.status}`;
    })();
    throw new Error(msg);
  }
  return json as T;
}

async function scoreChunked(articles: Article[], minScore: number): Promise<ArticleWithScore[]> {
  const all: ArticleWithScore[] = [];
  for (let i = 0; i < articles.length; i += SCORE_CHUNK_SIZE) {
    const chunk = articles.slice(i, i + SCORE_CHUNK_SIZE);
    const res = await callRoutePost<{ results?: ArticleWithScore[] }>(scoreArticles as unknown as (req: NextRequest) => Promise<Response>, {
      articles: chunk,
      minScore,
      campaign: null,
    });
    all.push(...(res.results ?? []));
  }
  return all;
}

export async function runLatestArticlesFlow(config: LatestArticlesScheduleConfig) {
  const maxArticles = typeof config.maxArticles === 'number' ? config.maxArticles : DEFAULTS.maxArticles;
  const minScore = typeof config.minScore === 'number' ? config.minScore : DEFAULTS.minScore;

  console.log('[latest-articles-flow] Starting run', {
    timeOfDay: config.timeOfDay,
    minScore,
    maxArticles,
    linkedin30SecScrape: config.linkedin30SecScrape,
    linkedinHeadless: config.linkedinHeadless,
    browserTimeoutMs: config.browserTimeoutMs,
  });

  const google = await callRoutePost<{ articles: Article[] }>(collectGoogleNews as unknown as (req: NextRequest) => Promise<Response>, {
    keywords: [LATEST_ARTICLES_24H_KEYWORD],
    regions: [...CORE_8_REGIONS],
    sources: ['google_news'],
    filterDays: 1,
    maxArticles,
    minScore,
  });

  const linkedin = await callRoutePost<{ articles: Article[] }>(collectLinkedIn as unknown as (req: NextRequest) => Promise<Response>, {
    keywords: [LATEST_ARTICLES_24H_KEYWORD],
    filterDays: 1,
    maxArticles,
    linkedin30SecScrape: config.linkedin30SecScrape,
    linkedinHeadless: config.linkedinHeadless,
    browserTimeoutMs: config.browserTimeoutMs,
  });

  const merged = dedupeArticlesByNormalizedUrl([...google.articles, ...linkedin.articles]);
  console.log('[latest-articles-flow] Collected merged articles:', {
    google: google.articles.length,
    linkedin: linkedin.articles.length,
    merged: merged.deduped.length,
  });

  const scored = await scoreChunked(merged.deduped, minScore);

  // Filter to queue-eligible articles (score >= minScore, not dropped, not duplicate)
  const qualified = scored.filter(r =>
    r.scored.relevance_score >= minScore &&
    !r.scored.drop_reason &&
    !r.scored.is_duplicate
  );

  console.log('[latest-articles-flow] Run complete', { qualified: qualified.length, totalScored: scored.length });
  return {
    googleCount: google.articles.length,
    linkedinCount: linkedin.articles.length,
    mergedCount: merged.deduped.length,
    scoredCount: scored.length,
    qualifiedCount: qualified.length,
    qualified,
  };
}

