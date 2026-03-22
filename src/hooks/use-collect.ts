"use client";
import { useState, useCallback } from 'react';
import { CORE_8_REGIONS, LATEST_ARTICLES_24H_KEYWORD } from '@/lib/constants';
import { dedupeArticlesByNormalizedUrl } from '@/lib/dedup';
import type { ArticleSource, CollectResult, PipelineStats } from '@/lib/types';

function mergePipelineStats(a: PipelineStats, b: PipelineStats): PipelineStats {
  return {
    totalFetched: a.totalFetched + b.totalFetched,
    afterDedup: a.afterDedup + b.afterDedup,
    afterDateFilter: a.afterDateFilter + b.afterDateFilter,
    afterScoreFilter: a.afterScoreFilter + b.afterScoreFilter,
    stored: a.stored + b.stored,
    dedupRemoved: a.dedupRemoved + b.dedupRemoved,
    scoreFilterRemoved: a.scoreFilterRemoved + b.scoreFilterRemoved,
  };
}

/** Strip per-source fetch annotations before summing stats (avoid double-counting in merges). */
function stripFetchBreakdown(s: PipelineStats): PipelineStats {
  const { fetchedGoogleNews: _g, fetchedLinkedin: _l, ...rest } = s;
  return rest;
}

function mergeTwoNewsResults(primary: CollectResult, secondary: CollectResult): CollectResult {
  const { deduped, removedCount } = dedupeArticlesByNormalizedUrl([
    ...primary.articles,
    ...secondary.articles,
  ]);
  const merged = mergePipelineStats(stripFetchBreakdown(primary.stats), stripFetchBreakdown(secondary.stats));
  return {
    ...primary,
    articles: deduped,
    stats: {
      ...merged,
      stored: deduped.length,
      dedupRemoved: merged.dedupRemoved + removedCount,
    },
    secondaryParts: [secondary],
  };
}

/** Extra pass for single-source results (usually no-op). */
function applyCrossSourceDedup(result: CollectResult): CollectResult {
  const { deduped, removedCount } = dedupeArticlesByNormalizedUrl(result.articles);
  if (removedCount === 0) return result;
  return {
    ...result,
    articles: deduped,
    stats: {
      ...result.stats,
      stored: deduped.length,
      dedupRemoved: result.stats.dedupRemoved + removedCount,
    },
  };
}

async function tryParseCollectResult(res: Response): Promise<CollectResult | null> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof (data as { error?: string }).error === 'string'
      ? (data as { error: string }).error
      : `Collection server error ${res.status}`;
    throw new Error(msg);
  }
  return data as CollectResult;
}

export function useCollect() {
  const [isCollecting, setIsCollecting] = useState(false);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCollect = useCallback(async (
    keywords: string[],
    regions: string[],
    filterDays: number,
    maxArticles: number,
    sources: ArticleSource[],
    options?: {
      start_date?: string;
      end_date?: string;
      campaign?: string;
      /** Faster LinkedIn pass: ~30s-style pacing per keyword (fewer scrolls / shorter waits). */
      linkedin30SecScrape?: boolean;
      /** Puppeteer for LinkedIn: `true` = headless, `false` = show Chromium (debug). Omit = server default (headed). */
      linkedinHeadless?: boolean;
    },
    browserTimeoutMs?: number,
  ): Promise<CollectResult> => {
    setIsCollecting(true);
    setStats(null);
    setError(null);

    try {
      const hasNews = sources.includes('google_news');
      const hasLinkedIn = sources.includes('linkedin');
      const hasLatest24h = sources.includes('latest_articles_24h');

      type TaskTag = 'news-main' | 'news-latest24' | 'linkedin';
      const taskSpecs: { tag: TaskTag; promise: Promise<Response> }[] = [];

      if (hasNews) {
        taskSpecs.push({
          tag: 'news-main',
          promise: fetch('/api/collect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              keywords,
              regions,
              sources: ['google_news'] as ArticleSource[],
              filterDays,
              maxArticles,
              ...options,
            }),
          }),
        });
      }

      if (hasLatest24h) {
        taskSpecs.push({
          tag: 'news-latest24',
          promise: fetch('/api/collect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              keywords: [LATEST_ARTICLES_24H_KEYWORD],
              regions: [...CORE_8_REGIONS],
              sources: ['google_news'] as ArticleSource[],
              filterDays: 1,
              maxArticles,
              ...options,
            }),
          }),
        });
      }

      // Phase 2: LinkedIn — either explicit source (user keywords / filter) or bundled with Latest Articles (preset)
      const linkedInFromLatest24 = hasLatest24h && !hasLinkedIn;
      if (hasLinkedIn || linkedInFromLatest24) {
        const liKeywords = hasLinkedIn ? keywords : [LATEST_ARTICLES_24H_KEYWORD];
        const liFilterDays = hasLinkedIn ? filterDays : 1;
        taskSpecs.push({
          tag: 'linkedin',
          promise: fetch('/api/collect-linkedin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              keywords: liKeywords,
              filterDays: liFilterDays,
              maxArticles,
              ...(options?.linkedin30SecScrape && { linkedin30SecScrape: true }),
              ...(browserTimeoutMs !== undefined && { browserTimeoutMs }),
              ...(options?.linkedinHeadless !== undefined && { linkedinHeadless: options.linkedinHeadless }),
            }),
          }),
        });
      }

      const settled = await Promise.allSettled(taskSpecs.map((t) => t.promise));

      let mainNews: CollectResult | null = null;
      let latest24News: CollectResult | null = null;
      let liResult: CollectResult | null = null;
      let liErrorMessage: string | null = null;
      let mainNewsError: string | null = null;
      let latest24Error: string | null = null;

      for (let i = 0; i < taskSpecs.length; i++) {
        const { tag } = taskSpecs[i];
        const s = settled[i];
        if (s.status === 'rejected') {
          const msg = s.reason instanceof Error ? s.reason.message : String(s.reason);
          if (tag === 'linkedin') liErrorMessage = msg;
          else if (tag === 'news-latest24') latest24Error = msg;
          else mainNewsError = msg;
          continue;
        }
        const res = s.value;
        try {
          const data = await tryParseCollectResult(res);
          if (tag === 'news-main') mainNews = data;
          else if (tag === 'news-latest24') latest24News = data;
          else if (tag === 'linkedin') liResult = data;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (tag === 'linkedin') liErrorMessage = msg;
          else if (tag === 'news-latest24') latest24Error = msg;
          else mainNewsError = msg;
        }
      }

      let newsResult: CollectResult | null = null;
      if (mainNews && latest24News) {
        newsResult = mergeTwoNewsResults(mainNews, latest24News);
      } else {
        newsResult = mainNews ?? latest24News;
      }

      if (!newsResult && !liResult) {
        const parts = [mainNewsError, latest24Error, liErrorMessage].filter(Boolean);
        throw new Error(parts[0] ?? 'Collection failed for selected sources');
      }

      const base = newsResult ?? liResult!;
      if (newsResult && liResult) {
        const { deduped, removedCount } = dedupeArticlesByNormalizedUrl([
          ...newsResult.articles,
          ...liResult.articles,
        ]);
        const mergedStats = mergePipelineStats(
          stripFetchBreakdown(newsResult.stats),
          stripFetchBreakdown(liResult.stats),
        );
        const merged: CollectResult = {
          ...newsResult,
          articles: deduped,
          stats: {
            ...mergedStats,
            stored: deduped.length,
            dedupRemoved: mergedStats.dedupRemoved + removedCount,
            fetchedGoogleNews: newsResult.stats.totalFetched,
            fetchedLinkedin: liResult.stats.totalFetched,
          },
          secondaryParts: [...(newsResult.secondaryParts ?? []), liResult],
        };

        setStats(merged.stats);
        if (liErrorMessage) {
          setError(`LinkedIn collection partially failed: ${liErrorMessage}`);
        } else if (latest24Error && mainNews) {
          setError(`Latest 24h collection failed; using other news sources only: ${latest24Error}`);
        } else if (mainNewsError && latest24News) {
          setError(`Main news collection failed; using Latest Articles (24h) only: ${mainNewsError}`);
        }
        return merged;
      }

      const single = applyCrossSourceDedup(base);
      const singleStats: PipelineStats =
        newsResult && !liResult
          ? { ...single.stats, fetchedGoogleNews: newsResult.stats.totalFetched }
          : !newsResult && liResult
            ? { ...single.stats, fetchedLinkedin: liResult.stats.totalFetched }
            : single.stats;
      setStats(singleStats);

      if (latest24Error && mainNews && !liResult) {
        setError(`Latest 24h collection failed; using other news sources only: ${latest24Error}`);
      } else if (mainNewsError && latest24News && !liResult) {
        setError(`Main news collection failed; using Latest Articles (24h) only: ${mainNewsError}`);
      } else if (newsResult && !liResult && liErrorMessage) {
        setError(`LinkedIn collection failed, using news sources only: ${liErrorMessage}`);
      } else if (!newsResult && liResult && (mainNewsError || latest24Error)) {
        setError(`News collection failed, using LinkedIn only: ${mainNewsError ?? latest24Error}`);
      }

      return { ...single, stats: singleStats };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Collection failed';
      setError(message);
      throw err;
    } finally {
      setIsCollecting(false);
    }
  }, []);

  const reset = useCallback(() => {
    setStats(null);
    setError(null);
  }, []);

  return { isCollecting, stats, error, startCollect, reset };
}
