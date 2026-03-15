"use client";

interface ArticleActionsProps {
  isSlacked: boolean;
  isBookmarked: boolean;
  onSlack: () => void;
  onBookmark: () => void;
  onOpen: () => void;
  onMarkReviewed: () => void;
  onDismiss: () => void;
}

export function ArticleActions({ isSlacked, isBookmarked, onSlack, onBookmark, onOpen, onMarkReviewed, onDismiss }: ArticleActionsProps) {
  const btnBase = { fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 600, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 } as const;

  return (
    <div className="flex items-center flex-wrap gap-2" style={{ padding: '12px 14px', borderTop: '1px solid var(--dr-border)' }}>
      <div className="flex items-center gap-1.5">
        <button onClick={onSlack} style={{ ...btnBase, background: isSlacked ? '#16A34A' : 'var(--dr-blue)', color: '#fff', padding: '7px 16px', border: 'none' }}>
          {isSlacked ? '✓ Slacked' : '→ Slack Internally'}
        </button>
        <button onClick={onBookmark} style={{ ...btnBase, background: '#fff', color: isBookmarked ? 'var(--dr-gold)' : 'var(--dr-text-muted)', padding: '7px 14px', border: '1px solid var(--dr-border)' }}>
          {isBookmarked ? '★ Bookmarked' : '⭐ Bookmark'}
        </button>
        <button onClick={onOpen} style={{ ...btnBase, background: '#fff', color: 'var(--dr-text-muted)', padding: '7px 14px', border: '1px solid var(--dr-border)' }}>
          ↗ Open Article
        </button>
      </div>
      <span className="flex-1 text-center italic" style={{ fontSize: 10.5, color: '#9CA3AF' }}>
        Slack &amp; Bookmark keep article in queue
      </span>
      <div className="flex items-center gap-1.5 ml-auto">
        <button onClick={onMarkReviewed} style={{ ...btnBase, background: '#fff', color: '#16A34A', padding: '7px 14px', border: '1.5px solid #86EFAC' }}>
          ✓ Mark as Reviewed
        </button>
        <button onClick={onDismiss} style={{ ...btnBase, background: '#fff', color: '#EF4444', padding: '7px 14px', border: '1px solid #FECACA' }}>
          ✕ Dismiss
        </button>
      </div>
    </div>
  );
}
