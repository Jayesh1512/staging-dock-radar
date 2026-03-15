"use client";

interface ScoringProgressProps {
  progress: number;
  total: number;
  cachedCount: number;
}

export function ScoringProgress({ progress, total, cachedCount }: ScoringProgressProps) {
  const pct = total > 0 ? (progress / total) * 100 : 0;
  return (
    <div style={{ background: 'var(--dr-surface)', border: '1px solid var(--dr-border)', borderRadius: 8, padding: '16px 20px', marginBottom: 20 }}>
      <span className="uppercase" style={{ fontSize: 12, fontWeight: 700, color: 'var(--dr-text-muted)', letterSpacing: 0.4 }}>
        Scoring Progress
      </span>
      <div className="flex items-center gap-3" style={{ marginTop: 10, marginBottom: 6 }}>
        <span className="spinner" />
        <div className="flex-1" style={{ background: '#E5E7EB', borderRadius: 4, height: 8 }}>
          <div style={{ height: '100%', borderRadius: 4, background: 'var(--dr-blue)', width: `${pct}%`, transition: 'width 0.2s' }} />
        </div>
        <span className="font-semibold" style={{ fontSize: 13, color: 'var(--dr-text)' }}>
          Scoring... {progress}/{total} articles
        </span>
      </div>
      <div style={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic', marginTop: 4 }}>
        {cachedCount} already cached from previous runs
      </div>
    </div>
  );
}
