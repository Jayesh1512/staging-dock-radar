"use client";
import { useState, useCallback } from 'react';
import type { PipelineStats } from '@/lib/types';
import { MOCK_PIPELINE_STATS } from '@/data/mock-data';

export function useCollect() {
  const [isCollecting, setIsCollecting] = useState(false);
  const [stats, setStats] = useState<PipelineStats | null>(null);

  const startCollect = useCallback(() => {
    setIsCollecting(true);
    setStats(null);
    return new Promise<PipelineStats>((resolve) => {
      setTimeout(() => {
        setIsCollecting(false);
        setStats(MOCK_PIPELINE_STATS);
        resolve(MOCK_PIPELINE_STATS);
      }, 2000);
    });
  }, []);

  const reset = useCallback(() => {
    setStats(null);
  }, []);

  return { isCollecting, stats, startCollect, reset };
}
