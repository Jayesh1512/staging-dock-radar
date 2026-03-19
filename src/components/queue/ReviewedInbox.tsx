"use client";
import React, { useState } from 'react';
import type { ArticleWithScore, ArticleAction } from '@/lib/types';
import { ScoreBadge } from '@/components/shared/ScoreBadge';
import { SignalBadge } from '@/components/shared/SignalBadge';
import { formatTimeAgo } from '@/lib/utils';
import { getScoreBand } from '@/lib/constants';

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
              padding: '5px 12px', borderRadius: 6, fontSize: 12,
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
              const isExpanded = expandedId === a.scored.id;
              const band = getScoreBand(a.scored.relevance_score);
              return (
                <React.Fragment key={a.scored.id}>
                  <tr
                    onClick={() => setExpandedId(isExpanded ? null : a.scored.id)}
                    className="cursor-pointer hover:bg-[#FAFAFA]"
                    style={{ borderBottom: i < filtered.length - 1 || isExpanded ? '1px solid #F3F4F6' : 'none' }}
                  >
                    <td style={{ padding: '11px 12px' }}>
                      <a
                        href={a.article.resolved_url ?? a.article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="font-semibold truncate block hover:underline"
                        style={{ fontSize: 13, color: 'var(--dr-blue)', maxWidth: 280 }}
                      >
                        {a.article.title}
                      </a>
                    </td>
                    <td style={{ padding: '11px 12px', fontSize: 12.5, fontWeight: 500 }}>{a.scored.company ?? '—'}</td>
                    <td style={{ padding: '11px 12px', fontSize: 12.5, color: 'var(--dr-text-muted)' }}>{a.scored.country ?? '—'}</td>
                    <td style={{ padding: '11px 12px' }}><SignalBadge signal={a.scored.signal_type} /></td>
                    <td style={{ padding: '11px 12px' }}><ScoreBadge score={a.scored.relevance_score} /></td>
                    <td style={{ padding: '11px 12px' }}>
                      {hasSlack && <span className="font-bold" style={{ color: 'var(--dr-blue)', fontSize: 13 }}>→✓</span>}
                      {hasBookmark && <span className="font-bold" style={{ color: 'var(--dr-gold)', fontSize: 13, marginLeft: hasSlack ? 4 : 0 }}>★</span>}
                      {!hasSlack && !hasBookmark && <span className="italic" style={{ color: 'var(--dr-text-disabled)', fontSize: 11.5 }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 12px' }}>
                      <span className="italic" style={{ fontSize: 11, color: 'var(--dr-text-muted)' }}>
                        {a.scored.reviewed_at ? formatTimeAgo(a.scored.reviewed_at) : '—'}
                      </span>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${a.scored.id}-detail`}>
                      <td colSpan={7} style={{ padding: '16px 20px', background: 'var(--dr-surface)', borderBottom: '1px solid var(--dr-border)' }}>
                        {/* Summary */}
                        {a.scored.summary && (
                          <p style={{ fontSize: 13, color: 'var(--dr-text-secondary)', lineHeight: 1.6, marginBottom: 14 }}>
                            {a.scored.summary}
                          </p>
                        )}

                        {/* Metadata grid */}
                        <div className="grid grid-cols-3 gap-x-8 gap-y-3" style={{ marginBottom: a.scored.persons.length > 0 || a.scored.entities.length > 0 ? 14 : 0 }}>
                          {[
                            { label: 'Use Case', value: a.scored.use_case ?? '—' },
                            { label: 'Location', value: [a.scored.city, a.scored.country].filter(Boolean).join(', ') || '—' },
                            { label: 'Publisher', value: a.article.publisher ?? '—' },
                            { label: 'Published', value: a.article.published_at ? formatTimeAgo(a.article.published_at) : '—' },
                            {
                              label: 'FlytBase',
                              value: a.scored.flytbase_mentioned ? '✓ Mentioned' : 'Not mentioned',
                              color: a.scored.flytbase_mentioned ? '#16A34A' : undefined,
                            },
                          ].map((item) => (
                            <div key={item.label}>
                              <div className="uppercase" style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--dr-text-muted)', letterSpacing: 0.5, marginBottom: 3 }}>
                                {item.label}
                              </div>
                              <span className="font-medium" style={{ fontSize: 12.5, color: item.color ?? 'var(--dr-text)' }}>
                                {item.value}
                              </span>
                            </div>
                          ))}

                          {/* Signal + Score inline */}
                          <div>
                            <div className="uppercase" style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--dr-text-muted)', letterSpacing: 0.5, marginBottom: 3 }}>Signal</div>
                            <SignalBadge signal={a.scored.signal_type} />
                          </div>
                          <div>
                            <div className="uppercase" style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--dr-text-muted)', letterSpacing: 0.5, marginBottom: 3 }}>Score</div>
                            <span className="inline-flex items-center gap-1 font-bold" style={{ background: band.bg, color: band.text, fontSize: 12, padding: '2px 8px', borderRadius: 5 }}>
                              {a.scored.relevance_score}
                              <span className="font-medium" style={{ fontSize: 10, opacity: 0.75 }}>{band.label}</span>
                            </span>
                          </div>
                        </div>

                        {/* People */}
                        {a.scored.persons.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            <div className="uppercase" style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--dr-text-muted)', letterSpacing: 0.5, marginBottom: 6 }}>People Mentioned</div>
                            <div className="flex flex-wrap gap-2">
                              {a.scored.persons.map((p) => (
                                <span key={p.name} style={{ fontSize: 12, background: '#fff', border: '1px solid var(--dr-border)', borderRadius: 6, padding: '3px 8px', color: 'var(--dr-text)' }}>
                                  {p.linkedin_url ? (
                                    <a
                                      href={p.linkedin_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-semibold hover:underline"
                                      style={{ color: 'var(--dr-blue)' }}
                                    >
                                      {p.name}
                                    </a>
                                  ) : (
                                    <span className="font-semibold">{p.name}</span>
                                  )}
                                  {p.role && <span style={{ color: 'var(--dr-text-muted)' }}> · {p.role}</span>}
                                  {p.organization && <span style={{ color: 'var(--dr-text-muted)' }}> @ {p.organization}</span>}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Entities */}
                        {a.scored.entities.length > 0 && (
                          <div style={{ marginTop: 10 }}>
                            <div className="uppercase" style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--dr-text-muted)', letterSpacing: 0.5, marginBottom: 6 }}>Entities</div>
                            <div className="flex flex-wrap gap-2">
                              {a.scored.entities.map((e) => (
                                <span key={e.name} style={{ fontSize: 11.5, background: '#fff', border: '1px solid var(--dr-border)', borderRadius: 6, padding: '3px 8px', color: 'var(--dr-text)' }}>
                                  {e.linkedin_url ? (
                                    <a
                                      href={e.linkedin_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-semibold hover:underline"
                                      style={{ color: 'var(--dr-blue)' }}
                                    >
                                      {e.name}
                                    </a>
                                  ) : (
                                    <span className="font-semibold">{e.name}</span>
                                  )}
                                  <span style={{ color: 'var(--dr-text-muted)', textTransform: 'uppercase', fontSize: 10, marginLeft: 4 }}>{e.type}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
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
