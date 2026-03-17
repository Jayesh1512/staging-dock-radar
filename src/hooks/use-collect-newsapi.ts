"use client";
import { useState, useCallback } from 'react';
import type { CollectResult, PipelineStats } from '@/lib/types';

/**
 * Hook for collecting articles from NewsAPI independent of other sources.
 * Returns articles in the same format as useCollect() and can be passed directly to scoring.
 */
export function useCollectNewsAPI() {
  const [isCollecting, setIsCollecting] = useState(false);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCollect = useCallback(async (
    keywords: string[],
    filterDays: number,
    maxArticles: number = 20,
    options?: { start_date?: string; end_date?: string; campaign?: string },
  ): Promise<CollectResult> => {
    setIsCollecting(true);
    setStats(null);
    setError(null);

    try {
      if (!keywords?.length) {
        throw new Error('At least one keyword is required');
      }

      const response = await fetch('/api/collect-newsapi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords,
          filterDays,
          maxArticles,
          ...options,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? `Server error ${response.status}`);
      }

      const result = data as CollectResult;
      setStats(result.stats);
      return result;
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
