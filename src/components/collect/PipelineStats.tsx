"use client";
import type { PipelineStats as PipelineStatsType } from '@/lib/types';

interface PipelineStatsProps {
  stats: PipelineStatsType;
}

function fetchSourceSubtitle(stats: PipelineStatsType): string | null {
  const g = stats.fetchedGoogleNews;
  const l = stats.fetchedLinkedin;
  if (g === undefined && l === undefined) return null;
  const parts: string[] = [];
  if (g !== undefined) parts.push(`Google News ${g}`);
  if (l !== undefined) parts.push(`LinkedIn ${l}`);
  return parts.join(' · ');
}

export function PipelineStats({ stats }: PipelineStatsProps) {
  const pct = stats.totalFetched > 0 ? (stats.stored / stats.totalFetched) * 100 : 0;
  const fetchSplit = fetchSourceSubtitle(stats);
  return (
    <div style={{ background: 'var(--dr-surface)', border: '1px solid var(--dr-border)', borderRadius: 10, padding: '16px 20px' }}>
      <div className="uppercase" style={{ fontSize: 12, fontWeight: 700, color: 'var(--dr-text-muted)', letterSpacing: 0.4, marginBottom: 12 }}>
        Collection Pipeline
      </div>
      <div className="flex items-center flex-wrap gap-1" style={{ marginBottom: 12 }}>
        {[
          { label: 'Fetched', num: stats.totalFetched, green: false },
          { label: 'Date Filtered', num: stats.afterDateFilter, green: false },
          { label: 'After Dedup', num: stats.afterDedup, green: false },
          { label: 'Score Filtered', num: stats.afterScoreFilter, green: false },
          { label: 'Stored', num: stats.stored, green: true },
        ].map((step, i) => (
          <div key={step.label} className="flex items-center gap-1">
            {i > 0 && <span style={{ color: 'var(--dr-text-disabled)', fontSize: 14, margin: '0 2px' }}>→</span>}
            <div
              className="flex flex-col gap-0.5"
              style={{
                background: step.green ? '#F0FDF4' : '#fff',
                border: `1px solid ${step.green ? '#BBF7D0' : 'var(--dr-border)'}`,
                borderRadius: 6, padding: '5px 10px',
              }}
            >
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: 11, color: 'var(--dr-text-muted)', fontWeight: 500 }}>{step.label}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: step.green ? '#16A34A' : 'var(--dr-text)' }}>{step.num}</span>
              </div>
              {step.label === 'Fetched' && fetchSplit && (
                <span style={{ fontSize: 10, color: 'var(--dr-text-muted)', fontWeight: 500, lineHeight: 1.35, maxWidth: 280 }}>
                  {fetchSplit}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ background: '#E5E7EB', borderRadius: 4, height: 6, marginBottom: 10 }}>
        <div style={{ height: '100%', borderRadius: 4, background: 'var(--dr-blue)', width: `${pct}%` }} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--dr-text-muted)' }}>
        <strong style={{ color: '#16A34A' }}>{stats.stored} articles</strong> ready for scoring &nbsp;·&nbsp; {stats.dedupRemoved} duplicates removed &nbsp;·&nbsp; {stats.scoreFilterRemoved} already scored filtered
      </div>
    </div>
  );
}
