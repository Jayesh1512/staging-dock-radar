"use client";
import type { ArticleWithScore } from '@/lib/types';
import { ScoreBadge } from '@/components/shared/ScoreBadge';
import { SignalBadge } from '@/components/shared/SignalBadge';
import { formatTimeAgo } from '@/lib/utils';

interface ScoredTableProps {
  articles: ArticleWithScore[];
  onDismiss: (articleId: string) => void;
}

export function ScoredTable({ articles, onDismiss }: ScoredTableProps) {
  return (
    <div style={{ border: '1px solid var(--dr-border)', borderRadius: 8, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Score', 'Article', 'Company', 'Country', 'Signal', 'Use Case', 'FlytBase', 'Dismiss'].map((h) => (
              <th
                key={h}
                className="text-left uppercase"
                style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--dr-text-muted)',
                  letterSpacing: 0.4, padding: '8px 12px',
                  background: 'var(--dr-surface)', borderBottom: '1px solid var(--dr-border)',
                  ...(h === 'Score' ? { width: 52 } : {}),
                  ...(h === 'Country' ? { width: 72 } : {}),
                  ...(h === 'FlytBase' ? { width: 56, textAlign: 'center' as const } : {}),
                  ...(h === 'Dismiss' ? { width: 56, textAlign: 'center' as const } : {}),
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {articles.map((a, i) => (
            <tr key={a.scored.id} className="hover:bg-[#FAFAFA]" style={{ borderBottom: i < articles.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
              <td style={{ padding: '11px 12px' }}><ScoreBadge score={a.scored.relevance_score} /></td>
              <td style={{ padding: '11px 12px' }}>
                <span className="block font-semibold truncate" style={{ fontSize: 13, color: 'var(--dr-text)', maxWidth: 320 }}>
                  {a.article.title}
                </span>
              </td>
              <td style={{ padding: '11px 12px', fontSize: 12.5, fontWeight: 500, color: a.scored.company ? 'var(--dr-text-secondary)' : 'var(--dr-text-muted)' }}>
                {a.scored.company ?? '—'}
              </td>
              <td style={{ padding: '11px 12px', fontSize: 12.5, color: 'var(--dr-text-muted)' }}>{a.scored.country ?? '—'}</td>
              <td style={{ padding: '11px 12px' }}><SignalBadge signal={a.scored.signal_type} /></td>
              <td style={{ padding: '11px 12px', fontSize: 12.5, color: 'var(--dr-text-muted)' }}>{a.scored.use_case ?? '—'}</td>
              <td style={{ padding: '11px 12px', textAlign: 'center', fontSize: 11, fontWeight: a.scored.flytbase_mentioned ? 600 : 400, color: a.scored.flytbase_mentioned ? '#16A34A' : '#9CA3AF' }}>
                {a.scored.flytbase_mentioned ? 'Yes' : 'No'}
              </td>
              <td style={{ padding: '11px 12px', textAlign: 'center' }}>
                <button
                  onClick={() => onDismiss(a.article.id)}
                  className="cursor-pointer transition-colors hover:text-red-500"
                  style={{ background: 'none', border: 'none', color: '#D1D5DB', fontSize: 16, padding: '2px 6px', borderRadius: 4, fontFamily: 'Inter, sans-serif' }}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
          {articles.length === 0 && (
            <tr><td colSpan={8} className="text-center" style={{ padding: 32, fontSize: 13, color: 'var(--dr-text-muted)' }}>All articles dismissed</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
