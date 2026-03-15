"use client";
import { useState, useCallback, useRef, useEffect } from 'react';
import type { Article, ArticleWithScore } from '@/lib/types';

async function scoreBatch(articles: Article[], selectedRegions: string[]): Promise<ArticleWithScore[]> {
  try {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles, selectedRegions }),
    });
    const data = await res.json();
    if (res.ok && Array.isArray(data.results)) return data.results as ArticleWithScore[];
    console.error('[use-score] batch error:', data.error);
    return [];
  } catch (err) {
    console.error('[use-score] fetch error:', err);
    return [];
  }
}

export function useScore() {
  const [isScoring, setIsScoring] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [partialResults, setPartialResults] = useState<ArticleWithScore[]>([]);
  const abortRef = useRef(false);

  const startScoring = useCallback(async (
    articles: Article[],
    onComplete: (results: ArticleWithScore[]) => void,
    selectedRegions: string[] = [],
  ) => {
    if (articles.length === 0) return;

    setTotal(articles.length);
    setProgress(0);
    setPartialResults([]);
    setError(null);
    setIsScoring(true);
    abortRef.current = false;

    try {
      const results = await scoreBatch(articles, selectedRegions);

      if (!abortRef.current) {
        setProgress(articles.length);
        setPartialResults(results);

        if (results.length === 0) {
          setError('All articles failed to score — check your LLM API key and server logs');
        } else {
          onComplete(results);
        }
      }
    } catch (err) {
      if (!abortRef.current) {
        setError(err instanceof Error ? err.message : 'Scoring failed');
      }
    } finally {
      setIsScoring(false);
    }
  }, []);

  useEffect(() => {
    return () => { abortRef.current = true; };
  }, []);

  return { isScoring, progress, total, error, partialResults, startScoring };
}
