"use client";
import { useState } from 'react';
import type { ArticleWithScore, ArticleAction } from '@/lib/types';
import { ArticleDetail } from './ArticleDetail';
import { SlackCompose } from './SlackCompose';
import { ArticleActions } from './ArticleActions';
import { SourceBadge } from '@/components/shared/SourceBadge';
import { ENTITY_TYPE_COLORS } from '@/lib/constants';
import { generateSlackMessage } from '@/lib/utils';

interface ArticleDrawerProps {
  article: ArticleWithScore;
  actions: ArticleAction[];
  onSlack: () => void;
  onBookmark: () => void;
  onMarkReviewed: () => void;
  onDismiss: () => void;
}

export function ArticleDrawer({ article, actions, onSlack, onBookmark, onMarkReviewed, onDismiss }: ArticleDrawerProps) {
  const [slackMessage, setSlackMessage] = useState(() => generateSlackMessage(article.article, article.scored));
  const isSlacked = actions.includes('slack');
  const isBookmarked = actions.includes('bookmarked');

  return (
    <div style={{ borderTop: '1px solid var(--dr-border)', background: 'var(--dr-surface)', padding: 20 }}>
      <div className="grid gap-6" style={{ gridTemplateColumns: '2fr 1fr', marginBottom: 20 }}>
        {/* Left column */}
        <ArticleDetail article={article} />

        {/* Right column */}
        <div>
          <div className="uppercase" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--dr-text-muted)', letterSpacing: 0.6, marginBottom: 10 }}>
            Organizations
          </div>
          <div className="flex flex-wrap gap-1">
            {article.scored.entities.map((entity) => {
              const colors = ENTITY_TYPE_COLORS[entity.type] ?? { bg: '#F3F4F6', text: '#4B5563' };
              return (
                <span key={entity.name} className="inline-flex items-center font-semibold" style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, border: '1px solid var(--dr-border)', background: '#fff', color: 'var(--dr-text)' }}>
                  {entity.name}
                  <span className="ml-1" style={{ fontSize: 10, color: colors.text }}>{entity.type}</span>
                </span>
              );
            })}
          </div>

          <div className="uppercase" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--dr-text-muted)', letterSpacing: 0.6, marginBottom: 10, marginTop: 20 }}>
            Source
          </div>
          <SourceBadge source={article.article.source} />
          <div style={{ marginTop: 8 }}>
            <div className="font-semibold" style={{ fontSize: 13, color: 'var(--dr-text)' }}>{article.article.publisher}</div>
            <div style={{ fontSize: 11, color: 'var(--dr-text-muted)' }}>
              Published {article.article.published_at ? new Date(article.article.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
            </div>
          </div>
        </div>
      </div>

      <SlackCompose message={slackMessage} onChange={setSlackMessage} />
      <ArticleActions
        isSlacked={isSlacked}
        isBookmarked={isBookmarked}
        onSlack={onSlack}
        onBookmark={onBookmark}
        onOpen={() => window.open(article.article.url, '_blank')}
        onMarkReviewed={onMarkReviewed}
        onDismiss={onDismiss}
      />
    </div>
  );
}
