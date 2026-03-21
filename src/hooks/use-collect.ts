"use client";
import { useState, useCallback } from 'react';
import type { ArticleSource, CollectResult, PipelineStats } from '@/lib/types';

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
    options?: { start_date?: string; end_date?: string; campaign?: string },
    browserTimeoutMs?: number,
  ): Promise<CollectResult> => {
    setIsCollecting(true);
    setStats(null);
    setError(null);

    try {
      const tasks: Promise<Response>[] = [];
      const hasNews = sources.includes('google_news');
      const hasNewsAPI = sources.includes('newsapi');
      const hasLinkedIn = sources.includes('linkedin');

      // Route to dedicated endpoint if ONLY newsapi is selected
      if (hasNewsAPI && !hasNews && !hasLinkedIn) {
        tasks.push(
          fetch('/api/collect-newsapi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              keywords,
              filterDays,
              maxArticles,
              ...options,
            }),
          }),
        );
      } else if (hasNews || hasNewsAPI) {
        // Combine google_news + newsapi into single /api/collect call
        const newsApiaSources: ArticleSource[] = [];
        if (hasNews) newsApiaSources.push('google_news');
        if (hasNewsAPI) newsApiaSources.push('newsapi');

        tasks.push(
          fetch('/api/collect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              keywords,
              regions,
              sources: newsApiaSources,
              filterDays,
              maxArticles,
              ...options,
            }),
          }),
        );
      }

      if (hasLinkedIn) {
        tasks.push(
          fetch('/api/collect-linkedin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keywords, filterDays, maxArticles, ...(browserTimeoutMs !== undefined && { browserTimeoutMs }) }),
          }),
        );
      }

      const settled = await Promise.allSettled(tasks);

      let newsResult: CollectResult | null = null;
      let liResult: CollectResult | null = null;
      let liErrorMessage: string | null = null;

      // Map settled responses back to services in order: [news/newsapi?, linkedin?]
      let idx = 0;
      const newsIdx = hasNews || hasNewsAPI ? idx++ : -1;
      const liIdx = hasLinkedIn ? idx++ : -1;

      if (newsIdx !== -1) {
        const s = settled[newsIdx];
        if (s.status === 'fulfilled') {
          const res = s.value;
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error ?? `Collection server error ${res.status}`);
          }
          newsResult = data as CollectResult;
        }
      }

      if (liIdx !== -1) {
        const s = settled[liIdx];
        if (s.status === 'fulfilled') {
          const res = s.value;
          const data = await res.json();
          if (res.ok) {
            liResult = data as CollectResult;
          } else {
            liErrorMessage = data.error ?? `LinkedIn server error ${res.status}`;
          }
        } else if (s.status === 'rejected') {
          liErrorMessage = s.reason instanceof Error ? s.reason.message : String(s.reason);
        }
      }

      if (!newsResult && !liResult) {
        throw new Error(liErrorMessage ?? 'Collection failed for selected sources');
      }

      // Merge results when both succeed; otherwise fall back to whichever is available.
      const base = newsResult ?? liResult!;
      if (newsResult && liResult) {
        const mergedStats: PipelineStats = {
          totalFetched: newsResult.stats.totalFetched + liResult.stats.totalFetched,
          afterDedup: newsResult.stats.afterDedup + liResult.stats.afterDedup,
          afterDateFilter: newsResult.stats.afterDateFilter + liResult.stats.afterDateFilter,
          afterScoreFilter: newsResult.stats.afterScoreFilter + liResult.stats.afterScoreFilter,
          stored: newsResult.stats.stored + liResult.stats.stored,
          dedupRemoved: newsResult.stats.dedupRemoved + liResult.stats.dedupRemoved,
          scoreFilterRemoved: newsResult.stats.scoreFilterRemoved + liResult.stats.scoreFilterRemoved,
        };

        const merged: CollectResult = {
          ...base,
          articles: [...newsResult.articles, ...liResult.articles],
          stats: mergedStats,
          // keep base runId/regions/keywords as-is; underlying runs are stored separately in DB
        };

        setStats(merged.stats);
        if (liErrorMessage) {
          setError(`LinkedIn collection partially failed: ${liErrorMessage}`);
        }
        return merged;
      }

      const single = base;
      setStats(single.stats);
      if (!newsResult && liErrorMessage) {
        setError(`News/NewsAPI collection failed, using LinkedIn only: ${liErrorMessage}`);
      } else if (!liResult && liErrorMessage) {
        setError(`LinkedIn collection failed, using News/NewsAPI only: ${liErrorMessage}`);
      }
      return single;
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
