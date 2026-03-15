"use client";
import type { ReactNode } from 'react';
import type { ArticleWithScore } from '@/lib/types';
import { PersonCard } from './PersonCard';
import { SignalBadge } from '@/components/shared/SignalBadge';
import { getScoreBand } from '@/lib/constants';

interface ArticleDetailProps {
  article: ArticleWithScore;
}

export function ArticleDetail({ article }: ArticleDetailProps) {
  const { scored } = article;
  const band = getScoreBand(scored.relevance_score);

  const metadata = [
    { label: 'Company', value: scored.company ?? '—' },
    { label: 'Location', value: [scored.city, scored.country].filter(Boolean).join(', ') || '—' },
    { label: 'Use Case', value: scored.use_case ?? '—' },
    {
      label: 'Signal',
      badge: <SignalBadge signal={scored.signal_type} />,
    },
    {
      label: 'Score',
      badge: (
        <span
          className="inline-flex items-center gap-1.5 font-bold"
          style={{ background: band.bg, color: band.text, fontSize: 12, padding: '2px 9px', borderRadius: 5 }}
        >
          {scored.relevance_score}
          <span className="font-medium" style={{ fontSize: 11, color: band.text, opacity: 0.75 }}>{band.label}</span>
        </span>
      ),
    },
    {
      label: 'FlytBase',
      badge: scored.flytbase_mentioned
        ? <span className="font-semibold" style={{ color: '#16A34A', fontSize: 12.5 }}>✓ Mentioned</span>
        : <span style={{ color: 'var(--dr-text-muted)', fontSize: 12.5 }}>Not mentioned</span>,
    },
  ];

  return (
    <div>
      <SectionLabel>Summary</SectionLabel>
      <div
        style={{
          background: '#fff', border: '1px solid var(--dr-border)',
          borderRadius: 8, padding: '12px 14px', marginBottom: 18,
        }}
      >
        <p style={{ fontSize: 13, color: 'var(--dr-text-secondary)', lineHeight: 1.65, margin: 0 }}>
          {scored.summary ?? 'No summary available'}
        </p>
      </div>

      <SectionLabel>Metadata</SectionLabel>
      <div
        style={{
          background: '#fff', border: '1px solid var(--dr-border)',
          borderRadius: 8, padding: '12px 14px', marginBottom: 18,
        }}
      >
        <div className="grid grid-cols-2 gap-4">
          {metadata.map((item) => (
            <div key={item.label}>
              <div
                className="uppercase"
                style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--dr-text-muted)', letterSpacing: 0.5, marginBottom: 4 }}
              >
                {item.label}
              </div>
              {'badge' in item
                ? item.badge
                : <span className="font-medium" style={{ fontSize: 12.5, color: 'var(--dr-text)' }}>{item.value}</span>
              }
            </div>
          ))}
        </div>
      </div>

      {scored.persons.length > 0 && (
        <>
          <SectionLabel>People Mentioned</SectionLabel>
          {scored.persons.map((person, i) => (
            <PersonCard key={person.name} person={person} index={i} />
          ))}
        </>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
      <span
        className="uppercase"
        style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--dr-text-muted)', letterSpacing: 0.7, whiteSpace: 'nowrap' }}
      >
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--dr-border)' }} />
    </div>
  );
}
