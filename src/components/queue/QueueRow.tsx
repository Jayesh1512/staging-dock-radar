"use client";
import type { ArticleWithScore } from '@/lib/types';
import { ScoreBadge } from '@/components/shared/ScoreBadge';
import { SignalBadge } from '@/components/shared/SignalBadge';
import { formatTimeAgo } from '@/lib/utils';

interface QueueRowProps {
  article: ArticleWithScore;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
}

export function QueueRow({ article, isExpanded, isSelected, onToggleExpand, onToggleSelect }: QueueRowProps) {
  const { article: art, scored } = article;
  return (
    <div
      className="grid items-center transition-colors"
      style={{
        gridTemplateColumns: '28px 24px 1fr 130px 80px 180px',
        gap: 12, padding: '12px 16px',
        borderBottom: '1px solid #F3F4F6',
        background: isExpanded ? 'var(--dr-surface)' : '#fff',
      }}
      onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = '#FAFAFA'; }}
      onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = '#fff'; }}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        onClick={(e) => e.stopPropagation()}
        className="cursor-pointer accent-[var(--dr-blue)]"
        style={{ width: 16, height: 16, borderRadius: 4 }}
      />
      <button onClick={onToggleExpand} className="cursor-pointer" style={{ background: 'none', border: 'none', color: 'var(--dr-text-muted)', fontSize: 12, padding: 0, display: 'flex', alignItems: 'center' }}>
        {isExpanded ? '▼' : '▶'}
      </button>
      <div className="min-w-0">
        <div className="truncate font-semibold" style={{ fontSize: 13, color: 'var(--dr-text)' }}>{art.title}</div>
        <div className="truncate" style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>
          {art.publisher} &nbsp;·&nbsp; {art.published_at ? formatTimeAgo(art.published_at) : '—'}
        </div>
      </div>
      <div className="font-medium" style={{ fontSize: 12.5, color: scored.company ? 'var(--dr-text-secondary)' : 'var(--dr-text-muted)' }}>
        {scored.company ?? '—'}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--dr-text-muted)' }}>{scored.country ?? '—'}</div>
      <div className="flex items-center gap-1.5">
        <SignalBadge signal={scored.signal_type} />
        <ScoreBadge score={scored.relevance_score} size="sm" />
      </div>
    </div>
  );
}
