"use client";
import { useState } from 'react';
import { ScoringProgress } from './ScoringProgress';
import { ScoredTable } from './ScoredTable';
import { DroppedArticles } from './DroppedArticles';
import type { ArticleWithScore, Run } from '@/lib/types';

interface ScorePanelProps {
  currentRun: Run | null;
  scoredArticles: ArticleWithScore[];
  minScore: number;
  onDismiss: (articleId: string) => void;
  // Scoring state lifted to page.tsx so it survives tab navigation
  isScoring: boolean;
  progress: number;
  total: number;
  scoringError: string | null;
  partialResults: ArticleWithScore[];
}

export function ScorePanel({ currentRun, scoredArticles, minScore, onDismiss, isScoring, progress, total, scoringError, partialResults }: ScorePanelProps) {
  const [signalFilter, setSignalFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('score');

  // During scoring show partial results as they arrive; after scoring show full prop data
  const displayArticles = isScoring ? partialResults : scoredArticles;

  const relevant = displayArticles.filter(a =>
    a.scored.relevance_score >= minScore &&
    !a.scored.drop_reason &&
    !a.scored.is_duplicate &&
    a.scored.status !== 'dismissed'
  );

  const dropped = displayArticles.filter(a =>
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
        {isScoring && <ScoringProgress progress={progress} total={total} />}

        {scoringError && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#991B1B' }}>
            <strong>Scoring failed:</strong> {scoringError}
          </div>
        )}

        {/* Table is always visible — shows partial results live during scoring, full results after */}
        {(isScoring ? partialResults.length > 0 : true) && (
          <>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <div className="flex items-center gap-2">
                <span className="font-bold" style={{ fontSize: 15, color: 'var(--dr-text)' }}>Scored Articles</span>
                <span style={{ fontSize: 13, color: 'var(--dr-text-muted)' }}>({filtered.length} relevant{isScoring ? ' so far' : ''})</span>
              </div>
              <div className="flex gap-2">
                <select value={signalFilter} onChange={(e) => setSignalFilter(e.target.value)} className="cursor-pointer" style={{ padding: '5px 12px', border: '1px solid var(--dr-border)', borderRadius: 6, background: '#fff', fontSize: 12, fontWeight: 500, color: 'var(--dr-text)' }}>
                  <option value="all">All Signals ▾</option>
                  {signals.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} className="cursor-pointer" style={{ padding: '5px 12px', border: '1px solid var(--dr-border)', borderRadius: 6, background: '#fff', fontSize: 12, fontWeight: 500, color: 'var(--dr-text)' }}>
                  <option value="all">All Countries ▾</option>
                  {countries.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="cursor-pointer" style={{ padding: '5px 12px', border: '1px solid var(--dr-border)', borderRadius: 6, background: '#fff', fontSize: 12, fontWeight: 500, color: 'var(--dr-text)' }}>
                  <option value="score">Sort: Score ▾</option>
                  <option value="date">Sort: Date</option>
                </select>
              </div>
            </div>

            <ScoredTable articles={filtered} onDismiss={onDismiss} />
            <DroppedArticles articles={dropped} minScore={minScore} />

            {!isScoring && (
              <div className="flex items-center gap-2" style={{ padding: '8px 14px', background: 'var(--dr-surface)', border: '1px dashed #D1D5DB', borderRadius: 6, marginTop: 12, fontSize: 11.5, color: 'var(--dr-text-muted)' }}>
                <span style={{ fontSize: 14 }}>ℹ</span>
                Articles auto-flow to queue when scoring completes.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
