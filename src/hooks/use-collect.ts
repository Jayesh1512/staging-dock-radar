"use client";
import { useState, useCallback } from 'react';
import type { CollectResult, PipelineStats } from '@/lib/types';

export function useCollect() {
  const [isCollecting, setIsCollecting] = useState(false);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCollect = useCallback(async (
    keywords: string[],
    regions: string[],
    filterDays: number,
    maxArticles: number,
  ): Promise<CollectResult> => {
    setIsCollecting(true);
    setStats(null);
    setError(null);

    try {
      const res = await fetch('/api/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords, regions, filterDays, maxArticles }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? `Server error ${res.status}`);
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
