"use client";
import type { ArticleWithScore } from '@/lib/types';
import { ScoreBadge } from '@/components/shared/ScoreBadge';
import { SignalBadge } from '@/components/shared/SignalBadge';
import { formatTimeAgo } from '@/lib/utils';
import { SOURCE_BADGE_COLORS } from '@/lib/constants';

const SOURCE_SHORT: Record<string, string> = {
  google_news: 'GN',
  newsapi: 'NA',
  linkedin: 'LI',
  facebook: 'FB',
};

interface QueueRowProps {
  article: ArticleWithScore;
  isExpanded: boolean;
  isSelected: boolean;
  isKnownPartner?: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onMarkReviewed: () => void;
  onDismiss: () => void;
}

export function QueueRow({ article, isExpanded, isSelected, isKnownPartner = false, onToggleExpand, onToggleSelect, onMarkReviewed, onDismiss }: QueueRowProps) {
  const { article: art, scored } = article;
  return (
    <div
      className="grid items-center"
      style={{
        gridTemplateColumns: '28px 20px 1fr 120px 68px 148px 80px 56px',
        gap: 12, padding: '11px 16px',
        borderBottom: '1px solid #F3F4F6',
        background: isExpanded ? '#EBF2FE' : '#fff',
        transition: 'background 0.15s ease',
        cursor: 'pointer',
      }}
      onClick={onToggleExpand}
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
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
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
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <div
            className="truncate font-semibold"
            style={{ fontSize: 13, color: isExpanded ? 'var(--dr-blue)' : 'var(--dr-text)', transition: 'color 0.15s' }}
          >
            {art.title}
          </div>
          {art.published_at && Date.now() - new Date(art.published_at).getTime() < 86_400_000 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#ECFDF5', color: '#059669', border: '1px solid #6EE7B7', whiteSpace: 'nowrap', flexShrink: 0 }}>
              ⚡ Fresh
            </span>
          )}
        </div>
        <div className="flex items-center gap-1" style={{ fontSize: 11, color: 'var(--dr-text-disabled)', marginTop: 1 }}>
          <span
            style={{
              background: SOURCE_BADGE_COLORS[art.source]?.bg ?? '#F3F4F6',
              color: SOURCE_BADGE_COLORS[art.source]?.text ?? '#6B7280',
              fontSize: 9.5, fontWeight: 700, padding: '1px 4px', borderRadius: 3, flexShrink: 0,
            }}
          >
            {SOURCE_SHORT[art.source] ?? art.source}
          </span>
          <span className="truncate">{art.publisher}&nbsp;·&nbsp;{art.published_at ? formatTimeAgo(art.published_at) : '—'}</span>
        </div>
      </div>

      {/* Company — waterfall: company field → si → operator → partner → buyer */}
      {(() => {
        const displayCompany = scored.company
          || scored.entities?.find(e => e.type === 'si')?.name
          || scored.entities?.find(e => e.type === 'operator')?.name
          || scored.entities?.find(e => e.type === 'partner')?.name
          || scored.entities?.find(e => e.type === 'buyer')?.name
          || null;
        return (
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="truncate font-medium" style={{ fontSize: 12.5, color: displayCompany ? 'var(--dr-text-secondary)' : 'var(--dr-text-muted)' }}>
              {displayCompany ?? '—'}
            </div>
            {isKnownPartner && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC', whiteSpace: 'nowrap', flexShrink: 0 }}>
                Partner
              </span>
            )}
          </div>
        );
      })()}

      {/* Country */}
      <div className="truncate" style={{ fontSize: 12.5, color: 'var(--dr-text-muted)' }}>
        {scored.country ?? '—'}
      </div>

      {/* Signal + Score */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <SignalBadge signal={scored.signal_type} />
        <ScoreBadge score={scored.relevance_score} size="sm" />
      </div>

      {/* FlytBase mentioned flag */}
      <div>
        {scored.flytbase_mentioned ? (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', whiteSpace: 'nowrap' }}>
            FlytBase
          </span>
        ) : (
          <span style={{ fontSize: 10, color: 'var(--dr-text-disabled)' }}>—</span>
        )}
      </div>

      {/* Inline quick-actions */}
      <div className="flex items-center gap-1 justify-end">
        <button
          type="button"
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
          type="button"
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
