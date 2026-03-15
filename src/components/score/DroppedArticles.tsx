"use client";
import { useState } from 'react';
import type { ArticleWithScore } from '@/lib/types';
import { ScoreBadge } from '@/components/shared/ScoreBadge';
import { SourceBadge } from '@/components/shared/SourceBadge';

interface DroppedArticlesProps {
  articles: ArticleWithScore[];
}

export function DroppedArticles({ articles }: DroppedArticlesProps) {
  const [isOpen, setIsOpen] = useState(false);

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
        <span style={{ fontSize: 11.5, color: '#9CA3AF' }}>Click to {isOpen ? 'collapse' : 'expand'}</span>
      </div>
      {isOpen && (
        <div style={{ border: '1px solid var(--dr-border)', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '8px 0' }}>
          {articles.map((a) => (
            <div key={a.scored.id} className="flex items-center gap-3" style={{ padding: '8px 16px' }}>
              <ScoreBadge score={a.scored.relevance_score} size="sm" />
              <div className="flex-1 min-w-0">
                <span className="block truncate font-medium" style={{ fontSize: 12.5, color: 'var(--dr-text)' }}>{a.article.title}</span>
                <span className="italic" style={{ fontSize: 11, color: '#9CA3AF' }}>
                  {a.scored.is_duplicate ? `Cross-language duplicate (Gate 2)` : a.scored.drop_reason ?? 'Dismissed by user'}
                </span>
              </div>
              <SourceBadge source={a.article.source} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
