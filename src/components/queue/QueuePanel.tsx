"use client";
import { useState, useCallback } from 'react';
import type { ArticleWithScore, Run, ArticleAction } from '@/lib/types';
import { BatchDivider } from './BatchDivider';
import { QueueRow } from './QueueRow';
import { ArticleDrawer } from './ArticleDrawer';
import { ReviewedInbox } from './ReviewedInbox';
import { toast } from 'sonner';

interface QueuePanelProps {
  articles: ArticleWithScore[];
  runs: Run[];
  runArticleMap: Record<string, string[]>;
  getActions: (articleId: string) => ArticleAction[];
  onSlack: (articleId: string) => void;
  onBookmark: (articleId: string) => void;
  onMarkReviewed: (articleId: string) => void;
  onDismiss: (articleId: string) => void;
  onBulkDismiss: (articleIds: string[]) => void;
}

export function QueuePanel({ articles, runs, runArticleMap, getActions, onSlack, onBookmark, onMarkReviewed, onDismiss, onBulkDismiss }: QueuePanelProps) {
  const [activeTab, setActiveTab] = useState<'active' | 'reviewed'>('active');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Record<string, Set<string>>>({});

  const queueArticles = articles.filter(a => a.scored.status === 'new');
  const reviewedArticles = articles.filter(a => a.scored.status === 'reviewed');

  const toggleSelect = useCallback((runId: string, articleId: string) => {
    setSelectedIds(prev => {
      const current = new Set(prev[runId] ?? []);
      if (current.has(articleId)) current.delete(articleId); else current.add(articleId);
      return { ...prev, [runId]: current };
    });
  }, []);

  const toggleSelectAll = useCallback((runId: string, articleIds: string[]) => {
    setSelectedIds(prev => {
      const current = prev[runId] ?? new Set();
      const allSelected = articleIds.every(id => current.has(id));
      return { ...prev, [runId]: allSelected ? new Set() : new Set(articleIds) };
    });
  }, []);

  const handleBulkDismiss = useCallback((runId: string) => {
    const ids = [...(selectedIds[runId] ?? [])];
    if (ids.length === 0) return;
    onBulkDismiss(ids);
    toast.success(`${ids.length} articles dismissed`);
    setSelectedIds(prev => ({ ...prev, [runId]: new Set() }));
  }, [selectedIds, onBulkDismiss]);

  // Sort runs newest first
  const sortedRuns = [...runs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Safety net: track which article IDs have already been rendered under a run header.
  // An article should appear under exactly one run (its first matching run, newest first).
  // The ever_queued flag + runArticleMap fixes prevent duplicates upstream, but this
  // guards against any edge-case where the same ID slips into multiple run maps.
  const renderedArticleIds = new Set<string>();

  return (
    <div className="bg-white" style={{ border: '1px solid var(--dr-border)', borderRadius: 'var(--dr-radius-card)', overflow: 'hidden' }}>
      <div style={{ padding: 20 }}>
        {/* Sub-view tabs */}
        <div className="flex gap-0.5" style={{ borderBottom: '1px solid var(--dr-border)', marginBottom: 16 }}>
          {(['active', 'reviewed'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="cursor-pointer"
              style={{
                padding: '8px 16px', fontSize: 13,
                fontWeight: activeTab === tab ? 600 : 500,
                color: activeTab === tab ? 'var(--dr-blue)' : 'var(--dr-text-muted)',
                borderBottom: activeTab === tab ? '2px solid var(--dr-blue)' : '2px solid transparent',
                background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                marginBottom: -1,
              }}
            >
              {tab === 'active' ? 'Active Queue' : 'Reviewed'}
            </button>
          ))}
        </div>

        {activeTab === 'active' && (
          <>
            <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
              <div className="flex items-center gap-2">
                <span className="font-bold" style={{ fontSize: 15, color: 'var(--dr-text)' }}>Signal Queue</span>
                <span style={{ fontSize: 13, color: 'var(--dr-text-muted)' }}>({queueArticles.length} new articles to review)</span>
              </div>
              <span className="italic" style={{ fontSize: 11.5, color: 'var(--dr-text-muted)' }}>Per-batch Select All &amp; Bulk Dismiss below</span>
            </div>

            {queueArticles.length === 0 ? (
              <div className="flex flex-col items-center justify-center" style={{ padding: '48px 0', color: 'var(--dr-text-muted)' }}>
                <span style={{ fontSize: 32, marginBottom: 8 }}>✓</span>
                <p style={{ fontSize: 14 }}>All caught up — no new signals to review</p>
              </div>
            ) : (
              sortedRuns.map((run) => {
                const runArticleIds = runArticleMap[run.id] ?? [];
                const batchArticles = queueArticles
                  .filter(a => runArticleIds.includes(a.article.id) && !renderedArticleIds.has(a.article.id))
                  .sort((a, b) => b.scored.relevance_score - a.scored.relevance_score);
                batchArticles.forEach(a => renderedArticleIds.add(a.article.id));

                if (batchArticles.length === 0) return null;

                const batchSelectedIds = selectedIds[run.id] ?? new Set();
                const allSelected = batchArticles.length > 0 && batchArticles.every(a => batchSelectedIds.has(a.article.id));

                return (
                  <div key={run.id}>
                    <BatchDivider
                      run={run}
                      signalCount={batchArticles.length}
                      allSelected={allSelected}
                      onSelectAll={() => toggleSelectAll(run.id, batchArticles.map(a => a.article.id))}
                      onBulkDismiss={() => handleBulkDismiss(run.id)}
                      onMarkAllReviewed={() => {
                        batchArticles.forEach(a => onMarkReviewed(a.article.id));
                        toast.success(`${batchArticles.length} articles marked as reviewed`);
                      }}
                    />
                    <div style={{ border: '1px solid var(--dr-border)', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
                      {batchArticles.map((a) => (
                        <div key={a.article.id}>
                          <QueueRow
                            article={a}
                            isExpanded={expandedId === a.article.id}
                            isSelected={batchSelectedIds.has(a.article.id)}
                            onToggleExpand={() => setExpandedId(expandedId === a.article.id ? null : a.article.id)}
                            onToggleSelect={() => toggleSelect(run.id, a.article.id)}
                            onMarkReviewed={() => { onMarkReviewed(a.article.id); setExpandedId(null); }}
                            onDismiss={() => { onDismiss(a.article.id); setExpandedId(null); }}
                          />
                          {expandedId === a.article.id && (
                            <ArticleDrawer
                              article={a}
                              actions={getActions(a.article.id)}
                              onSlack={() => { onSlack(a.article.id); }}
                              onBookmark={() => onBookmark(a.article.id)}
                              onMarkReviewed={() => { onMarkReviewed(a.article.id); setExpandedId(null); }}
                              onDismiss={() => { onDismiss(a.article.id); setExpandedId(null); }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {activeTab === 'reviewed' && (
          <ReviewedInbox articles={reviewedArticles} getActions={getActions} />
        )}
      </div>
    </div>
  );
}
