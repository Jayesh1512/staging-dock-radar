"use client";
import { useState, useCallback, useRef, useEffect } from 'react';
import type { Article, ArticleWithScore } from '@/lib/types';

async function scoreBatch(articles: Article[], selectedRegions: string[], minScore: number): Promise<ArticleWithScore[]> {
  const res = await fetch('/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articles, selectedRegions, minScore }),
  });

  const data = await res.json() as { results?: ArticleWithScore[]; error?: string };

  if (res.ok && Array.isArray(data.results)) {
    return data.results;
  }

  // Surface actionable error messages for known failure modes
  const serverError = typeof data.error === 'string' ? data.error : null;

  if (res.status === 400 && serverError?.includes('Batch too large')) {
    throw new Error(
      `Too many articles for a single scoring batch (${articles.length} sent). ` +
      `This is a server configuration issue — MAX_BATCH and maxArticles must match. ` +
      `Contact your administrator or check server logs.`
    );
  }

  if (res.status === 500) {
    throw new Error(
      serverError
        ? `Scoring server error: ${serverError}`
        : `The scoring server returned an internal error (HTTP 500). ` +
          `This is usually caused by an invalid LLM API key, exhausted API quota, or a network timeout. ` +
          `Check your LLM provider dashboard and server logs, then retry.`
    );
  }

  throw new Error(
    serverError
      ? `Scoring failed: ${serverError}`
      : `Scoring API returned an unexpected response (HTTP ${res.status}). Check server logs for details.`
  );
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
    minScore: number = 0,
  ) => {
    if (articles.length === 0) return;

    setTotal(articles.length);
    setProgress(0);
    setPartialResults([]);
    setError(null);
    setIsScoring(true);
    abortRef.current = false;

    try {
      const results = await scoreBatch(articles, selectedRegions, minScore);

      if (!abortRef.current) {
        setProgress(articles.length);
        setPartialResults(results);

        if (results.length === 0) {
          setError(
            'All articles returned a score of zero — the LLM may have failed to parse the batch response. ' +
            'This can happen if the response was malformed or truncated. ' +
            'Try reducing the number of articles (Max Articles in Step 1) and retry.'
          );
        } else {
          onComplete(results);
        }
      }
    } catch (err) {
      if (!abortRef.current) {
        setError(err instanceof Error ? err.message : 'Scoring failed — an unexpected error occurred. Check server logs.');
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
