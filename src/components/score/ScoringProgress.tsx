"use client";

interface ScoringProgressProps {
  progress: number;
  total: number;
}

export function ScoringProgress({ progress, total }: ScoringProgressProps) {
  // Batch mode: progress stays 0 until the single LLM call completes.
  // Show an animated full-width bar while waiting; a filled bar when done.
  const isBatchPending = total > 0 && progress === 0;
  const pct = isBatchPending ? 100 : total > 0 ? (progress / total) * 100 : 0;
  const label = isBatchPending
    ? `Analyzing ${total} articles...`
    : `Scoring... ${progress}/${total} articles`;

  return (
    <div style={{ background: 'var(--dr-surface)', border: '1px solid var(--dr-border)', borderRadius: 8, padding: '16px 20px', marginBottom: 20 }}>
      <span className="uppercase" style={{ fontSize: 12, fontWeight: 700, color: 'var(--dr-text-muted)', letterSpacing: 0.4 }}>
        Scoring Progress
      </span>
      <div className="flex items-center gap-3" style={{ marginTop: 10, marginBottom: 6 }}>
        <span className="spinner" />
        <div className="flex-1" style={{ background: '#E5E7EB', borderRadius: 4, height: 8 }}>
          <div
            style={{
              height: '100%',
              borderRadius: 4,
              background: 'var(--dr-blue)',
              width: `${pct}%`,
              transition: 'width 0.2s',
              opacity: isBatchPending ? 0.4 : 1,
              animation: isBatchPending ? 'pulse 1.5s ease-in-out infinite' : 'none',
            }}
          />
        </div>
        <span className="font-semibold" style={{ fontSize: 13, color: 'var(--dr-text)' }}>
          {label}
        </span>
      </div>
    </div>
  );
}
