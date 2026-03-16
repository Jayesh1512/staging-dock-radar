"use client";
import type { ReactNode } from 'react';
import type { ArticleWithScore, Person, Entity } from '@/lib/types';
import { PersonCard } from './PersonCard';
import { SignalBadge } from '@/components/shared/SignalBadge';
import { getScoreBand } from '@/lib/constants';

export type EnrichmentStatus = 'idle' | 'loading' | 'done' | 'failed';

interface ArticleDetailProps {
  article: ArticleWithScore;
  enrichmentStatus?: EnrichmentStatus;
  enrichedPersons?: Person[];
  enrichedEntities?: Entity[];
}

export function ArticleDetail({ article, enrichmentStatus = 'idle', enrichedPersons, enrichedEntities: _enrichedEntities }: ArticleDetailProps) {
  const { scored } = article;
  const band = getScoreBand(scored.relevance_score);

  // Use enriched persons if available, fall back to scoring-time persons
  const displayPersons = enrichedPersons ?? scored.persons;

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

      {/* People section — always rendered regardless of enrichment status */}
      <SectionLabel>People Mentioned</SectionLabel>
      {enrichmentStatus === 'loading' ? (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', marginBottom: 10,
            background: '#F0F9FF', border: '1px solid #BAE6FD',
            borderRadius: 8, fontSize: 12, color: '#0369A1',
          }}
        >
          <span
            style={{
              display: 'inline-block', width: 11, height: 11,
              border: '2px solid #0369A1', borderTopColor: 'transparent',
              borderRadius: '50%', animation: 'spin 0.7s linear infinite',
              flexShrink: 0,
            }}
          />
          Enriching article — fetching full text to identify people…
        </div>
      ) : displayPersons.length > 0 ? (
        displayPersons.map((person, i) => (
          <PersonCard key={`${person.name}-${i}`} person={person} index={i} />
        ))
      ) : (
        <div
          style={{
            padding: '10px 14px', marginBottom: 10,
            background: '#fff', border: '1px solid var(--dr-border)',
            borderRadius: 8, fontSize: 12, color: 'var(--dr-text-muted)',
            fontStyle: 'italic',
          }}
        >
          {enrichmentStatus === 'failed'
            ? 'Could not fetch full article — names may not be available'
            : 'No named individuals identified in this article'}
        </div>
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
