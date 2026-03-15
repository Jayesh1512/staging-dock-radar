import type { ArticleWithScore } from '@/types';

interface QueuePanelProps {
  articles: ArticleWithScore[];
  onAction: (articleId: string, action: 'slack' | 'bookmarked' | 'dismiss' | 'reviewed') => void;
}

export function QueuePanel({ articles, onAction: _onAction }: QueuePanelProps) {
  const newArticles = articles.filter((a) => a.scored.status === 'new');
  const reviewedArticles = articles.filter((a) => a.scored.status === 'reviewed');

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border-default bg-white p-6">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-base font-semibold text-text-primary">Signal Queue</h2>
          <span className="text-sm text-text-muted">({newArticles.length} new articles to review)</span>
        </div>
        {newArticles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            <span className="text-3xl mb-2">✓</span>
            <p className="text-sm">All caught up — no new signals to review</p>
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            Queue panel — batch-grouped articles, article drawers, action buttons will be built here.
          </p>
        )}
        <p className="mt-4 text-xs text-text-disabled">
          {reviewedArticles.length} reviewed articles
        </p>
      </div>
    </div>
  );
}
