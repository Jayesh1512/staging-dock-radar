"use client";

interface ArticleActionsProps {
  isSlacked: boolean;
  isBookmarked: boolean;
  isSending: boolean;
  onSlack: () => void;
  onBookmark: () => void;
  onOpen: () => void;
  onMarkReviewed: () => void;
  onDismiss: () => void;
}

export function ArticleActions({ isSlacked, isBookmarked, isSending, onSlack, onBookmark, onOpen, onMarkReviewed, onDismiss }: ArticleActionsProps) {
  const base = {
    fontSize: 12.5, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
  } as const;

  return (
    <div
      className="flex items-center flex-wrap gap-2"
      style={{
        padding: '12px 20px',
        borderTop: '1px solid var(--dr-border)',
        background: '#F0F4FF',
        marginTop: 16,
      }}
    >
      {/* Left group */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onSlack}
          disabled={isSending || isSlacked}
          style={{
            ...base,
            background: isSlacked ? '#16A34A' : 'var(--dr-blue)',
            color: '#fff', border: 'none',
            opacity: isSending ? 0.7 : 1,
            cursor: isSending || isSlacked ? 'not-allowed' : 'pointer',
          }}
        >
          {isSending ? 'Sending...' : isSlacked ? '✓ Slacked' : '→ Slack Internally'}
        </button>
        <button
          onClick={onBookmark}
          style={{
            ...base,
            background: '#fff',
            color: isBookmarked ? 'var(--dr-gold)' : 'var(--dr-text-muted)',
            border: `1px solid ${isBookmarked ? '#FCD34D' : 'var(--dr-border)'}`,
          }}
        >
          {isBookmarked ? '★ Bookmarked' : '⭐ Bookmark'}
        </button>
        <button
          onClick={onOpen}
          style={{ ...base, background: '#fff', color: 'var(--dr-text-muted)', border: '1px solid var(--dr-border)' }}
        >
          ↗ Open
        </button>
      </div>

      <span className="flex-1 text-center italic" style={{ fontSize: 10.5, color: 'var(--dr-text-disabled)' }}>
        Slack &amp; Bookmark keep article in queue
      </span>

      {/* Right group */}
      <div className="flex items-center gap-1.5 ml-auto">
        <button
          onClick={onMarkReviewed}
          style={{ ...base, background: '#fff', color: '#16A34A', border: '1.5px solid #86EFAC' }}
        >
          ✓ Mark as Reviewed
        </button>
        <button
          onClick={onDismiss}
          style={{ ...base, background: '#fff', color: '#EF4444', border: '1px solid #FECACA' }}
        >
          ✕ Dismiss
        </button>
      </div>
    </div>
  );
}
