"use client";
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

  return (
    <div>
      <div className="uppercase" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--dr-text-muted)', letterSpacing: 0.6, marginBottom: 10 }}>
        Summary
      </div>
      <p style={{ fontSize: 13, color: 'var(--dr-text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
        {scored.summary}
      </p>

      <div className="uppercase" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--dr-text-muted)', letterSpacing: 0.6, marginBottom: 10 }}>
        Metadata
      </div>
      <div className="grid grid-cols-2 gap-2" style={{ marginBottom: 16 }}>
        {[
          { label: 'Company', value: scored.company ?? '—' },
          { label: 'Location', value: [scored.city, scored.country].filter(Boolean).join(', ') || '—' },
          { label: 'Use Case', value: scored.use_case ?? '—' },
          { label: 'Signal', value: null, badge: <SignalBadge signal={scored.signal_type} /> },
          { label: 'Score', value: null, badge: (
            <span className="inline-flex items-center gap-1.5 font-bold" style={{ background: band.bg, color: band.text, fontSize: 12, padding: '2px 9px', borderRadius: 5 }}>
              {scored.relevance_score} <span className="font-medium" style={{ fontSize: 11, color: 'var(--dr-text-muted)' }}>{band.label}</span>
            </span>
          )},
          { label: 'FlytBase', value: null, badge: scored.flytbase_mentioned
            ? <span className="font-semibold" style={{ color: '#16A34A' }}>✓ Mentioned</span>
            : <span style={{ color: 'var(--dr-text-muted)' }}>Not mentioned</span>
          },
        ].map((item) => (
          <div key={item.label}>
            <label className="block" style={{ fontSize: 10.5, color: 'var(--dr-text-muted)', fontWeight: 600, marginBottom: 2 }}>{item.label}</label>
            {item.badge ?? <span className="font-medium" style={{ fontSize: 12.5, color: 'var(--dr-text)' }}>{item.value}</span>}
          </div>
        ))}
      </div>

      {scored.persons.length > 0 && (
        <>
          <div className="uppercase" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--dr-text-muted)', letterSpacing: 0.6, marginBottom: 10, marginTop: 16 }}>
            People Mentioned
          </div>
          {scored.persons.map((person, i) => (
            <PersonCard key={person.name} person={person} index={i} />
          ))}
        </>
      )}
    </div>
  );
}
