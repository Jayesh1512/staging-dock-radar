"use client";
import { useState } from 'react';
import type { ArticleWithScore } from '@/lib/types';
import { ScoreBadge } from '@/components/shared/ScoreBadge';
import { SignalBadge } from '@/components/shared/SignalBadge';
import { SourceBadge } from '@/components/shared/SourceBadge';

interface DroppedArticlesProps {
  articles: ArticleWithScore[];
  minScore: number;
}

function dropLabel(a: ArticleWithScore, minScore: number): string {
  if (a.scored.is_duplicate) return 'Semantic duplicate (Gate 2)';
  if (a.scored.drop_reason) return a.scored.drop_reason;
  if (a.scored.status === 'dismissed') return 'Dismissed by user';
  if (a.scored.relevance_score < minScore) return 'Below relevance threshold';
  return 'Filtered';
}

export function DroppedArticles({ articles, minScore }: DroppedArticlesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (articles.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between cursor-pointer"
        style={{
          padding: '12px 16px', background: 'var(--dr-surface)',
          border: '1px solid var(--dr-border)', borderRadius: 8,
        }}
      >
        <span className="font-semibold" style={{ fontSize: 13, color: 'var(--dr-text-muted)' }}>
          <span className="inline-block transition-transform" style={{ marginRight: 6, transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
          Dropped by AI ({articles.length} articles)
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--dr-text-disabled)' }}>Click to {isOpen ? 'collapse' : 'expand'}</span>
      </div>

      {isOpen && (
        <div style={{ border: '1px solid var(--dr-border)', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '8px 0' }}>
          {articles.map((a) => {
            const isExpanded = expandedId === a.scored.id;
            const hasDetails = !!(a.scored.company || a.scored.country || a.scored.use_case || a.scored.summary);

            return (
              <div key={a.scored.id} style={{ borderBottom: '1px solid var(--dr-border)', padding: '8px 16px' }}>
                {/* Main row */}
                <div
                  className="flex items-center gap-3"
                  onClick={() => hasDetails && setExpandedId(isExpanded ? null : a.scored.id)}
                  style={{ cursor: hasDetails ? 'pointer' : 'default' }}
                >
                  <ScoreBadge score={a.scored.relevance_score} size="sm" />
                  <div className="flex-1 min-w-0">
                    <a
                      href={a.article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="block truncate font-medium hover:underline"
                      style={{ fontSize: 12.5, color: 'var(--dr-blue)' }}
                    >{a.article.title}</a>
                    <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 2 }}>
                      <span className="italic" style={{ fontSize: 11, color: 'var(--dr-text-disabled)' }}>
                        {dropLabel(a, minScore)}
                      </span>
                      {a.scored.company && (
                        <span style={{ fontSize: 11, color: 'var(--dr-text-muted)', background: 'var(--dr-surface)', border: '1px solid var(--dr-border)', borderRadius: 4, padding: '0 5px' }}>
                          {a.scored.company}
                        </span>
                      )}
                      {a.scored.country && (
                        <span style={{ fontSize: 11, color: 'var(--dr-text-muted)' }}>
                          {a.scored.country}
                        </span>
                      )}
                      {a.scored.signal_type && a.scored.signal_type !== 'OTHER' && (
                        <SignalBadge signal={a.scored.signal_type} />
                      )}
                      {a.scored.use_case && (
                        <span style={{ fontSize: 11, color: 'var(--dr-text-muted)', fontStyle: 'italic' }}>
                          {a.scored.use_case}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <SourceBadge source={a.article.source} />
                    {hasDetails && (
                      <span style={{ fontSize: 10, color: 'var(--dr-text-disabled)', display: 'inline-block', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>▼</span>
                    )}
                  </div>
                </div>

                {/* Expanded: LLM summary */}
                {isExpanded && a.scored.summary && (
                  <div style={{ marginTop: 8, paddingLeft: 40 }}>
                    <p style={{ fontSize: 12, color: 'var(--dr-text-secondary)', lineHeight: 1.5, background: 'var(--dr-surface)', border: '1px solid var(--dr-border)', borderRadius: 6, padding: '8px 10px', margin: 0 }}>
                      {a.scored.summary}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
