"use client";
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { ArticleWithScore, ArticleAction } from '@/lib/types';
import { ArticleDetail } from './ArticleDetail';
import { SlackCompose } from './SlackCompose';
import { ArticleActions } from './ArticleActions';
import { SourceBadge } from '@/components/shared/SourceBadge';
import { ENTITY_TYPE_COLORS } from '@/lib/constants';
import { generateSlackMessage, formatDateIST } from '@/lib/utils';

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
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const isSlacked = actions.includes('slack');
  const isBookmarked = actions.includes('bookmarked');

  async function handleSlackClick() {
    if (isSending || isSlacked) return;
    setIsSending(true);
    setSendError(null);
    try {
      const res = await fetch('/api/slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: slackMessage }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to send');
      onSlack(); // marks article as slacked in state
      toast.success('Sent to #dock-radar');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send to Slack');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div
      className="drawer-slide-down"
      style={{
        borderTop: '2px solid var(--dr-blue)',
        borderLeft: '3px solid var(--dr-blue)',
        background: '#FAFCFF',
        boxShadow: '0 4px 20px rgba(44, 123, 242, 0.09)',
      }}
    >
      {/* Drawer header strip */}
      <div
        className="flex items-center gap-2"
        style={{
          padding: '8px 20px',
          background: 'var(--dr-blue)',
          borderBottom: '1px solid #2370DC',
        }}
      >
        <span className="font-semibold" style={{ fontSize: 11.5, color: '#fff', letterSpacing: 0.2 }}>
          Article Detail
        </span>
        <span style={{ fontSize: 11, color: '#BFDBFE' }}>
          ·&nbsp; {article.scored.signal_type}&nbsp;·&nbsp;Score {article.scored.relevance_score}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#93C5FD', fontStyle: 'italic' }}>
          {article.article.publisher}
        </span>
      </div>

      {/* Main body */}
      <div style={{ padding: '20px 20px 0' }}>
        <div className="grid gap-6" style={{ gridTemplateColumns: '2fr 1fr' }}>
          {/* Left column */}
          <ArticleDetail article={article} />

          {/* Right column */}
          <div>
            <SectionLabel>Organizations</SectionLabel>
            <div className="flex flex-wrap gap-1.5" style={{ marginBottom: 20 }}>
              {article.scored.entities.length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--dr-text-muted)', fontStyle: 'italic' }}>None detected</span>
              )}
              {article.scored.entities.map((entity) => {
                const colors = ENTITY_TYPE_COLORS[entity.type] ?? { bg: '#F3F4F6', text: '#374151' };
                return (
                  <span
                    key={entity.name}
                    className="inline-flex items-center gap-1.5 font-semibold"
                    style={{
                      fontSize: 11.5, padding: '4px 10px', borderRadius: 20,
                      background: colors.bg, color: colors.text,
                    }}
                  >
                    {entity.name}
                    <span style={{ fontSize: 9.5, opacity: 0.65, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                      {entity.type}
                    </span>
                  </span>
                );
              })}
            </div>

            <SectionLabel>Source</SectionLabel>
            <div
              style={{
                background: '#fff', border: '1px solid var(--dr-border)',
                borderRadius: 8, padding: '10px 12px',
              }}
            >
              <div style={{ marginBottom: 8 }}>
                <SourceBadge source={article.article.source} />
              </div>
              <div className="font-semibold" style={{ fontSize: 13, color: 'var(--dr-text)' }}>
                {article.article.publisher}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--dr-text-muted)', marginTop: 2 }}>
                Published{' '}
                {formatDateIST(article.article.published_at)}
              </div>
              <a
                href={article.article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium"
                style={{ fontSize: 11.5, color: 'var(--dr-blue)', marginTop: 8, textDecoration: 'none' }}
              >
                ↗ Open original article
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Slack compose */}
      <div style={{ padding: '16px 20px 0' }}>
        <SlackCompose message={slackMessage} onChange={setSlackMessage} />
        {sendError && (
          <div style={{ marginTop: 8, padding: '7px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, fontSize: 12, color: '#991B1B' }}>
            ✕ {sendError}
          </div>
        )}
      </div>

      {/* Action bar */}
      <ArticleActions
        isSlacked={isSlacked}
        isBookmarked={isBookmarked}
        isSending={isSending}
        onSlack={handleSlackClick}
        onBookmark={onBookmark}
        onOpen={() => window.open(article.article.url, '_blank')}
        onMarkReviewed={onMarkReviewed}
        onDismiss={onDismiss}
      />
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
