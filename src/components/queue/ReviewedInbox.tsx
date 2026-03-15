"use client";
import { useState } from 'react';
import type { ArticleWithScore, ArticleAction } from '@/lib/types';
import { ScoreBadge } from '@/components/shared/ScoreBadge';
import { SignalBadge } from '@/components/shared/SignalBadge';
import { formatTimeAgo } from '@/lib/utils';

interface ReviewedInboxProps {
  articles: ArticleWithScore[];
  getActions: (articleId: string) => ArticleAction[];
}

export function ReviewedInbox({ articles, getActions }: ReviewedInboxProps) {
  const [filter, setFilter] = useState<'all' | 'slack' | 'bookmarked'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = articles.filter((a) => {
    if (filter === 'all') return true;
    const actions = getActions(a.article.id);
    if (filter === 'slack') return actions.includes('slack');
    if (filter === 'bookmarked') return actions.includes('bookmarked');
    return true;
  }).sort((a, b) => new Date(b.scored.reviewed_at ?? 0).getTime() - new Date(a.scored.reviewed_at ?? 0).getTime());

  const filterBtns = [
    { key: 'all' as const, label: 'All' },
    { key: 'slack' as const, label: '→ Slacked' },
    { key: 'bookmarked' as const, label: '★ Bookmarked' },
  ];

  return (
    <div>
      <div className="flex items-center gap-1.5 flex-wrap" style={{ marginBottom: 14 }}>
        {filterBtns.map((btn) => (
          <button
            key={btn.key}
            onClick={() => setFilter(btn.key)}
            className="cursor-pointer"
            style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 12, fontFamily: 'Inter, sans-serif',
              fontWeight: filter === btn.key ? 600 : 500,
              background: filter === btn.key ? 'var(--dr-blue-light)' : '#fff',
              color: filter === btn.key ? 'var(--dr-blue)' : 'var(--dr-text-muted)',
              border: `1px solid ${filter === btn.key ? '#BFDBFE' : 'var(--dr-border)'}`,
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      <div style={{ border: '1px solid var(--dr-border)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Title', 'Company', 'Country', 'Signal', 'Score', 'Actions', 'Reviewed'].map((h) => (
                <th key={h} className="text-left uppercase" style={{ fontSize: 11, fontWeight: 700, color: 'var(--dr-text-muted)', letterSpacing: 0.4, padding: '8px 12px', background: 'var(--dr-surface)', borderBottom: '1px solid var(--dr-border)', ...(h === 'Country' ? { width: 80 } : {}), ...(h === 'Score' ? { width: 52 } : {}), ...(h === 'Actions' ? { width: 110 } : {}), ...(h === 'Reviewed' ? { width: 100 } : {}) }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((a, i) => {
              const actions = getActions(a.article.id);
              const hasSlack = actions.includes('slack');
              const hasBookmark = actions.includes('bookmarked');
              return (
                <>
                  <tr
                    key={a.scored.id}
                    onClick={() => setExpandedId(expandedId === a.scored.id ? null : a.scored.id)}
                    className="cursor-pointer hover:bg-[#FAFAFA]"
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F3F4F6' : 'none' }}
                  >
                    <td style={{ padding: '11px 12px' }}>
                      <span className="font-semibold truncate block" style={{ fontSize: 13, color: 'var(--dr-text)', maxWidth: 280 }}>{a.article.title}</span>
                    </td>
                    <td style={{ padding: '11px 12px', fontSize: 12.5, fontWeight: 500 }}>{a.scored.company ?? '—'}</td>
                    <td style={{ padding: '11px 12px', fontSize: 12.5, color: 'var(--dr-text-muted)' }}>{a.scored.country ?? '—'}</td>
                    <td style={{ padding: '11px 12px' }}><SignalBadge signal={a.scored.signal_type} /></td>
                    <td style={{ padding: '11px 12px' }}><ScoreBadge score={a.scored.relevance_score} /></td>
                    <td style={{ padding: '11px 12px' }}>
                      {hasSlack && <span className="font-bold" style={{ color: 'var(--dr-blue)', fontSize: 13 }}>→✓</span>}
                      {hasBookmark && <span className="font-bold" style={{ color: 'var(--dr-gold)', fontSize: 13, marginLeft: hasSlack ? 4 : 0 }}>★</span>}
                      {!hasSlack && !hasBookmark && <span className="italic" style={{ color: '#9CA3AF', fontSize: 11.5 }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 12px' }}>
                      <span className="italic" style={{ fontSize: 11, color: 'var(--dr-text-muted)' }}>
                        {a.scored.reviewed_at ? formatTimeAgo(a.scored.reviewed_at) : '—'}
                      </span>
                    </td>
                  </tr>
                  {expandedId === a.scored.id && (
                    <tr key={`${a.scored.id}-detail`}>
                      <td colSpan={7} style={{ padding: '12px 16px', background: 'var(--dr-surface)', borderBottom: '1px solid var(--dr-border)' }}>
                        <p style={{ fontSize: 13, color: 'var(--dr-text-secondary)', lineHeight: 1.6 }}>{a.scored.summary}</p>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center" style={{ padding: 32, fontSize: 13, color: 'var(--dr-text-muted)' }}>No reviewed articles yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
