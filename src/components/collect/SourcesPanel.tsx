"use client";

import type { ArticleSource } from '@/lib/types';

interface SourcesPanelProps {
  selected: ArticleSource[];
  onChange: (sources: ArticleSource[]) => void;
}

function toggleSource(
  current: ArticleSource[],
  source: ArticleSource,
): ArticleSource[] {
  const exists = current.includes(source);
  if (exists) {
    // Never allow all sources to be turned off; keep at least one
    if (current.length === 1) return current;
    return current.filter((s) => s !== source);
  }
  return [...current, source];
}

export function SourcesPanel({ selected, onChange }: SourcesPanelProps) {
  const hasGoogle = selected.includes('google_news');
  const hasLinkedIn = selected.includes('linkedin');
  const hasLatest24h = selected.includes('latest_articles_24h');

  return (
    <div
      className="flex items-center gap-5 flex-wrap"
      style={{
        background: 'var(--dr-surface)', border: '1px solid var(--dr-border)',
        borderRadius: 8, padding: '12px 16px', marginBottom: 14,
      }}
    >
      <span className="whitespace-nowrap uppercase" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--dr-text-muted)', letterSpacing: 0.4 }}>
        Sources to scan:
      </span>

      {/* Google News toggle */}
      <div className="flex flex-col" style={{ gap: 2 }}>
        <button
          type="button"
          onClick={() => onChange(toggleSource(selected, 'google_news'))}
          className="flex items-center gap-1.5 cursor-pointer"
          aria-pressed={hasGoogle}
          style={{ background: 'transparent', border: 'none', padding: 0 }}
        >
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{
              width: 16, height: 16, borderRadius: 4,
              border: hasGoogle ? '2px solid var(--dr-blue)' : '2px solid #D1D5DB',
              background: hasGoogle ? 'var(--dr-blue)' : '#fff',
            }}
          >
            {hasGoogle && <span className="text-white font-bold" style={{ fontSize: 10 }}>✓</span>}
          </div>
          <span className="font-semibold" style={{ fontSize: 13, color: hasGoogle ? 'var(--dr-text-secondary)' : 'var(--dr-text-disabled)' }}>
            Google News
          </span>
        </button>
        <span style={{ fontSize: 10, color: 'var(--dr-text-muted)', fontStyle: 'italic', paddingLeft: 22 }}>
          can select news regions
        </span>
      </div>

      {/* NewsAPI - disabled */}
      <div className="flex flex-col" style={{ gap: 2, opacity: 0.5 }}>
        <div className="flex items-center gap-1.5" title="NewsAPI collection is disabled">
          <div className="flex-shrink-0" style={{ width: 16, height: 16, borderRadius: 4, border: '2px solid #D1D5DB', background: '#fff' }} />
          <span className="font-medium" style={{ fontSize: 13, color: 'var(--dr-text-disabled)' }}>NewsAPI</span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--dr-text-muted)', fontStyle: 'italic', paddingLeft: 22 }}>
          not used (Google News only)
        </span>
      </div>

      {/* LinkedIn toggle */}
      <div className="flex flex-col" style={{ gap: 2 }}>
        <button
          type="button"
          onClick={() => onChange(toggleSource(selected, 'linkedin'))}
          className="flex items-center gap-1.5 cursor-pointer"
          aria-pressed={hasLinkedIn}
          style={{ background: 'transparent', border: 'none', padding: 0 }}
        >
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{
              width: 16, height: 16, borderRadius: 4,
              border: hasLinkedIn ? '2px solid var(--dr-blue)' : '2px solid #D1D5DB',
              background: hasLinkedIn ? 'var(--dr-blue)' : '#fff',
            }}
          >
            {hasLinkedIn && <span className="text-white font-bold" style={{ fontSize: 10 }}>✓</span>}
          </div>
          <span className="font-semibold" style={{ fontSize: 13, color: hasLinkedIn ? 'var(--dr-text-secondary)' : 'var(--dr-text-disabled)' }}>
            LinkedIn
          </span>
        </button>
        <span style={{ fontSize: 10, color: 'var(--dr-text-muted)', fontStyle: 'italic', paddingLeft: 22 }}>
          global search only
        </span>
      </div>

      {/* Latest articles (24h) */}
      <div className="flex flex-col" style={{ gap: 2 }}>
        <button
          type="button"
          onClick={() => onChange(toggleSource(selected, 'latest_articles_24h'))}
          className="flex items-center gap-1.5 cursor-pointer"
          aria-pressed={hasLatest24h}
          style={{ background: 'transparent', border: 'none', padding: 0 }}
        >
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{
              width: 16, height: 16, borderRadius: 4,
              border: hasLatest24h ? '2px solid var(--dr-blue)' : '2px solid #D1D5DB',
              background: hasLatest24h ? 'var(--dr-blue)' : '#fff',
            }}
          >
            {hasLatest24h && <span className="text-white font-bold" style={{ fontSize: 10 }}>✓</span>}
          </div>
          <span className="font-semibold" style={{ fontSize: 13, color: hasLatest24h ? 'var(--dr-text-secondary)' : 'var(--dr-text-disabled)' }}>
            Latest Articles (last 24 hours)
          </span>
        </button>
        <span style={{ fontSize: 10, color: 'var(--dr-text-muted)', fontStyle: 'italic', paddingLeft: 22 }}>
          Google News + LinkedIn (preset) — 1 day, 8 regions for news — see panel below
        </span>
      </div>

      {/* Facebook - still disabled / coming soon */}
      <div className="flex flex-col" style={{ gap: 2 }}>
        <div className="flex items-center gap-1.5">
          <div className="flex-shrink-0" style={{ width: 16, height: 16, borderRadius: 4, border: '2px solid #D1D5DB', background: '#fff' }} />
          <span className="font-medium" style={{ fontSize: 13, color: 'var(--dr-text-disabled)' }}>Facebook</span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--dr-text-muted)', fontStyle: 'italic', paddingLeft: 22 }}>
          coming soon
        </span>
      </div>
    </div>
  );
}

