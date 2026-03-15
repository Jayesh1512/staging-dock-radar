"use client";
import { useEffect, useRef, useState } from 'react';
import { ScoringProgress } from './ScoringProgress';
import { ScoredTable } from './ScoredTable';
import { DroppedArticles } from './DroppedArticles';
import { useScore } from '@/hooks/use-score';
import type { ArticleWithScore, Run } from '@/lib/types';

interface ScorePanelProps {
  currentRun: Run | null;
  scoredArticles: ArticleWithScore[];
  minScore: number;
  onScoringComplete: () => void;
  onDismiss: (articleId: string) => void;
  hasScored: boolean;
}

export function ScorePanel({ currentRun, scoredArticles, minScore, onScoringComplete, onDismiss, hasScored }: ScorePanelProps) {
  const { isScoring, progress, total, startScoring, cachedCount } = useScore();
  const hasStartedRef = useRef(false);
  const [signalFilter, setSignalFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('score');

  useEffect(() => {
    if (currentRun && !hasScored && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startScoring(currentRun.articles_stored, onScoringComplete);
    }
  }, [currentRun, hasScored, startScoring, onScoringComplete]);

  const relevant = scoredArticles.filter(a =>
    a.scored.relevance_score >= minScore &&
    !a.scored.drop_reason &&
    !a.scored.is_duplicate &&
    a.scored.status !== 'dismissed'
  );

  const dropped = scoredArticles.filter(a =>
    a.scored.relevance_score < minScore ||
    a.scored.drop_reason ||
    a.scored.is_duplicate ||
    a.scored.status === 'dismissed'
  );

  let filtered = relevant;
  if (signalFilter !== 'all') filtered = filtered.filter(a => a.scored.signal_type === signalFilter);
  if (countryFilter !== 'all') filtered = filtered.filter(a => a.scored.country === countryFilter);
  filtered = [...filtered].sort((a, b) => sortBy === 'score' ? b.scored.relevance_score - a.scored.relevance_score : new Date(b.article.published_at ?? 0).getTime() - new Date(a.article.published_at ?? 0).getTime());

  const countries = [...new Set(relevant.map(a => a.scored.country).filter(Boolean))] as string[];
  const signals = [...new Set(relevant.map(a => a.scored.signal_type))];

  if (!currentRun) {
    return (
      <div className="bg-white flex items-center justify-center" style={{ border: '1px solid var(--dr-border)', borderRadius: 'var(--dr-radius-card)', padding: 48 }}>
        <p style={{ fontSize: 14, color: 'var(--dr-text-muted)' }}>Run a collection first to see scored articles here.</p>
      </div>
    );
  }

  return (
    <div className="bg-white" style={{ border: '1px solid var(--dr-border)', borderRadius: 'var(--dr-radius-card)', overflow: 'hidden' }}>
      <div style={{ padding: 20 }}>
        {isScoring && <ScoringProgress progress={progress} total={total} cachedCount={cachedCount} />}

        {!isScoring && (
          <>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <div className="flex items-center gap-2">
                <span className="font-bold" style={{ fontSize: 15, color: 'var(--dr-text)' }}>Scored Articles</span>
                <span style={{ fontSize: 13, color: 'var(--dr-text-muted)' }}>({filtered.length} relevant)</span>
              </div>
              <div className="flex gap-2">
                <select value={signalFilter} onChange={(e) => setSignalFilter(e.target.value)} className="cursor-pointer" style={{ padding: '5px 12px', border: '1px solid var(--dr-border)', borderRadius: 6, background: '#fff', fontSize: 12, fontWeight: 500, fontFamily: 'Inter, sans-serif', color: 'var(--dr-text)' }}>
                  <option value="all">All Signals ▾</option>
                  {signals.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} className="cursor-pointer" style={{ padding: '5px 12px', border: '1px solid var(--dr-border)', borderRadius: 6, background: '#fff', fontSize: 12, fontWeight: 500, fontFamily: 'Inter, sans-serif', color: 'var(--dr-text)' }}>
                  <option value="all">All Countries ▾</option>
                  {countries.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="cursor-pointer" style={{ padding: '5px 12px', border: '1px solid var(--dr-border)', borderRadius: 6, background: '#fff', fontSize: 12, fontWeight: 500, fontFamily: 'Inter, sans-serif', color: 'var(--dr-text)' }}>
                  <option value="score">Sort: Score ▾</option>
                  <option value="date">Sort: Date</option>
                </select>
              </div>
            </div>

            <ScoredTable articles={filtered} onDismiss={onDismiss} />
            <DroppedArticles articles={dropped} />

            <div className="flex items-center gap-2" style={{ padding: '8px 14px', background: 'var(--dr-surface)', border: '1px dashed #D1D5DB', borderRadius: 6, marginTop: 12, fontSize: 11.5, color: 'var(--dr-text-muted)' }}>
              <span style={{ fontSize: 14 }}>ℹ</span>
              Articles auto-flow to queue when scoring completes.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
