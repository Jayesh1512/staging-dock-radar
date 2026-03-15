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
  onMarkReviewed: () => void;
  onDismiss: () => void;
}

export function QueueRow({ article, isExpanded, isSelected, onToggleExpand, onToggleSelect, onMarkReviewed, onDismiss }: QueueRowProps) {
  const { article: art, scored } = article;
  return (
    <div
      className="grid items-center"
      style={{
        gridTemplateColumns: '28px 20px 1fr 120px 68px 148px 56px',
        gap: 12, padding: '11px 16px',
        borderBottom: '1px solid #F3F4F6',
        background: isExpanded ? '#EBF2FE' : '#fff',
        transition: 'background 0.15s ease',
        cursor: 'default',
      }}
      onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = '#F5F8FF'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = isExpanded ? '#EBF2FE' : '#fff'; }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        onClick={(e) => e.stopPropagation()}
        className="cursor-pointer accent-[var(--dr-blue)]"
        style={{ width: 15, height: 15 }}
      />

      {/* Expand arrow — rotates on expand */}
      <button
        onClick={onToggleExpand}
        className="cursor-pointer"
        style={{
          background: 'none', border: 'none', padding: 0,
          color: isExpanded ? 'var(--dr-blue)' : 'var(--dr-text-muted)',
          fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.18s ease, color 0.15s ease',
        }}
      >
        ▶
      </button>

      {/* Title + publisher */}
      <div className="min-w-0" onClick={onToggleExpand} style={{ cursor: 'pointer' }}>
        <div
          className="truncate font-semibold"
          style={{ fontSize: 13, color: isExpanded ? 'var(--dr-blue)' : 'var(--dr-text)', transition: 'color 0.15s' }}
        >
          {art.title}
        </div>
        <div className="truncate" style={{ fontSize: 11, color: 'var(--dr-text-disabled)', marginTop: 1 }}>
          {art.publisher}&nbsp;·&nbsp;{art.published_at ? formatTimeAgo(art.published_at) : '—'}
        </div>
      </div>

      {/* Company */}
      <div className="truncate font-medium" style={{ fontSize: 12.5, color: scored.company ? 'var(--dr-text-secondary)' : 'var(--dr-text-muted)' }}>
        {scored.company ?? '—'}
      </div>

      {/* Country */}
      <div className="truncate" style={{ fontSize: 12.5, color: 'var(--dr-text-muted)' }}>
        {scored.country ?? '—'}
      </div>

      {/* Signal + Score */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <SignalBadge signal={scored.signal_type} />
        <ScoreBadge score={scored.relevance_score} size="sm" />
      </div>

      {/* Inline quick-actions */}
      <div className="flex items-center gap-1 justify-end">
        <button
          onClick={(e) => { e.stopPropagation(); onMarkReviewed(); }}
          title="Mark as Reviewed"
          className="cursor-pointer transition-colors hover:bg-green-50"
          style={{
            background: 'none', border: '1px solid #86EFAC', borderRadius: 5,
            padding: '4px 7px', color: '#16A34A', fontSize: 12, lineHeight: 1,
            display: 'flex', alignItems: 'center',
          }}
        >
          ✓
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          title="Dismiss"
          className="cursor-pointer transition-colors hover:bg-red-50"
          style={{
            background: 'none', border: '1px solid #FECACA', borderRadius: 5,
            padding: '4px 7px', color: '#EF4444', fontSize: 12, lineHeight: 1,
            display: 'flex', alignItems: 'center',
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
