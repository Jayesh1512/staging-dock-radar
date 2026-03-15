"use client";
import { useState, useCallback, useRef, useEffect } from 'react';

export function useScore() {
  const [isScoring, setIsScoring] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const abortRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startScoring = useCallback((articleCount: number, onComplete: () => void) => {
    setTotal(articleCount);
    setProgress(0);
    setIsScoring(true);
    abortRef.current = false;

    intervalRef.current = setInterval(() => {
      if (abortRef.current) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }
      setProgress((prev) => {
        const next = prev + 1;
        if (next >= articleCount) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setIsScoring(false);
          onComplete();
        }
        return Math.min(next, articleCount);
      });
    }, 200);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { isScoring, progress, total, startScoring, cachedCount: 7 };
}
