"use client";
import type { Run } from '@/lib/types';
import { formatDateTimeIST } from '@/lib/utils';

interface BatchDividerProps {
  run: Run;
  signalCount: number;
  allSelected: boolean;
  onSelectAll: () => void;
  onBulkDismiss: () => void;
  onMarkAllReviewed: () => void;
}

export function BatchDivider({ run, signalCount, allSelected, onSelectAll, onBulkDismiss, onMarkAllReviewed }: BatchDividerProps) {
  const [dateStr, timeStr] = formatDateTimeIST(run.created_at).split(', ');

  return (
    <div className="flex items-center" style={{ margin: '24px 0 12px' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--dr-border)' }} />
      <div className="flex items-center gap-2.5 flex-shrink-0" style={{ padding: '0 16px' }}>
        <span className="font-bold" style={{ fontSize: 12, color: 'var(--dr-text-secondary)' }}>{run.keywords.join(', ')}</span>
        <span style={{ color: 'var(--dr-border)', fontSize: 12 }}>•</span>
        <span style={{ fontSize: 11.5, color: 'var(--dr-text-muted)' }}>{dateStr}, {timeStr}</span>
        <span style={{ color: 'var(--dr-border)', fontSize: 12 }}>•</span>
        <span style={{ fontSize: 11.5, color: 'var(--dr-text-muted)' }}>{signalCount} signals</span>
      </div>
      <div className="flex items-center gap-1.5 ml-2">
        <button
          onClick={onSelectAll}
          title={allSelected ? 'Deselect all' : 'Select all articles in this batch'}
          className="flex items-center gap-1.5 cursor-pointer"
          style={{ padding: '4px 10px', border: '1px solid var(--dr-border)', borderRadius: 6, background: '#fff', fontSize: 11.5, fontWeight: 600, color: 'var(--dr-text-muted)' }}
        >
          {allSelected ? '☑' : '☐'} Select All
        </button>
        <button
          onClick={onMarkAllReviewed}
          title="Mark all articles in this batch as reviewed"
          className="flex items-center gap-1.5 cursor-pointer"
          style={{ padding: '4px 10px', border: '1.5px solid #86EFAC', borderRadius: 6, background: '#F0FDF4', fontSize: 11.5, fontWeight: 600, color: '#16A34A' }}
        >
          ✓ Mark All Reviewed
        </button>
        <button
          onClick={onBulkDismiss}
          title="Dismiss all selected articles in this batch"
          className="flex items-center gap-1.5 cursor-pointer"
          style={{ padding: '4px 10px', border: '1px solid #FECACA', borderRadius: 6, background: '#FFF5F5', fontSize: 11.5, fontWeight: 600, color: '#EF4444' }}
        >
          ⊗ Bulk Dismiss
        </button>
      </div>
      <div style={{ flex: 1, height: 1, background: 'var(--dr-border)' }} />
    </div>
  );
}
