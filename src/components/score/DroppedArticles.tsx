"use client";
import { useState } from 'react';
import type { ArticleWithScore } from '@/lib/types';
import { ScoreBadge } from '@/components/shared/ScoreBadge';
import { SignalBadge } from '@/components/shared/SignalBadge';
import { formatTimeAgo } from '@/lib/utils';

interface DroppedArticlesProps {
  articles: ArticleWithScore[];
  minScore: number;
}

function dropLabel(a: ArticleWithScore, minScore: number): string {
  if (a.scored.drop_reason) return a.scored.drop_reason;
  if (a.scored.is_duplicate) return 'Duplicate story';
  if (a.scored.status === 'dismissed') return 'Dismissed by user';
  if (a.scored.relevance_score < minScore) return 'Below relevance threshold';
  return 'Filtered';
}

export function DroppedArticles({ articles, minScore }: DroppedArticlesProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (articles.length === 0) return null;

  const headers = ['Score', 'Article', 'Company', 'Country', 'Signal', 'Use Case', 'FlytBase', 'Reason'];

  return (
    <div style={{ marginTop: 16 }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between cursor-pointer"
        style={{
          padding: '12px 16px', background: 'var(--dr-surface)',
          border: '1px solid var(--dr-border)', borderRadius: isOpen ? '8px 8px 0 0' : 8,
        }}
      >
        <span className="font-semibold" style={{ fontSize: 13, color: 'var(--dr-text-muted)' }}>
          <span className="inline-block transition-transform" style={{ marginRight: 6, transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
          Dropped by AI ({articles.length} articles)
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--dr-text-disabled)' }}>Click to {isOpen ? 'collapse' : 'expand'}</span>
      </div>

      {isOpen && (
        <div style={{ border: '1px solid var(--dr-border)', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {headers.map((h) => (
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
                      ...(h === 'Reason' ? { minWidth: 160 } : {}),
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {articles.map((a, i) => {
                const isUrlDedup = a.scored.is_duplicate && a.scored.relevance_score === 0;
                return (
                  <tr key={a.scored.id} className="hover:bg-[#FAFAFA]" style={{ borderBottom: i < articles.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                    <td style={{ padding: '11px 12px' }}>
                      {isUrlDedup
                        ? <span style={{ fontSize: 12, color: 'var(--dr-text-disabled)' }}>—</span>
                        : <ScoreBadge score={a.scored.relevance_score} />
                      }
                    </td>
                    <td style={{ padding: '11px 12px' }}>
                      <a
                        href={a.article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block font-semibold truncate hover:underline"
                        style={{ fontSize: 13, color: 'var(--dr-blue)', maxWidth: 320 }}
                      >
                        {a.article.title}
                      </a>
                      {a.article.publisher && (
                        <span style={{ fontSize: 11, color: 'var(--dr-text-muted)', marginTop: 2, display: 'block' }}>
                          {a.article.publisher} · {a.article.published_at ? formatTimeAgo(a.article.published_at) : ''}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '11px 12px', fontSize: 12.5, fontWeight: 500, color: a.scored.company ? 'var(--dr-text-secondary)' : 'var(--dr-text-muted)' }}>
                      {a.scored.company ?? '—'}
                    </td>
                    <td style={{ padding: '11px 12px', fontSize: 12.5, color: 'var(--dr-text-muted)' }}>
                      {a.scored.country ?? '—'}
                    </td>
                    <td style={{ padding: '11px 12px' }}>
                      <SignalBadge signal={a.scored.signal_type} />
                    </td>
                    <td style={{ padding: '11px 12px', fontSize: 12.5, color: 'var(--dr-text-muted)' }}>
                      {a.scored.use_case ?? '—'}
                    </td>
                    <td style={{ padding: '11px 12px', textAlign: 'center', fontSize: 11, fontWeight: a.scored.flytbase_mentioned ? 600 : 400, color: a.scored.flytbase_mentioned ? '#16A34A' : 'var(--dr-text-disabled)' }}>
                      {a.scored.flytbase_mentioned ? 'Yes' : 'No'}
                    </td>
                    <td style={{ padding: '11px 12px', fontSize: 12, color: 'var(--dr-text-muted)', fontStyle: 'italic' }}>
                      {dropLabel(a, minScore)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
