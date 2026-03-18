"use client";
import { DATE_PRESETS, DATE_PRESET_LABELS } from '@/lib/constants';

interface DateFilterProps {
  days: number;
  onChange: (days: number) => void;
  /** Show the LinkedIn-only "All" option (skips date cutoff entirely) */
  showAll?: boolean;
}

export function DateFilter({ days, onChange, showAll }: DateFilterProps) {
  const isAll = days === 0;
  return (
    <div>
      <label className="block" style={{ fontSize: 12, fontWeight: 600, color: 'var(--dr-text-muted)', marginBottom: 6 }}>Date Range</label>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="number"
          value={isAll ? '' : days}
          placeholder={isAll ? '∞' : undefined}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={isAll}
          className="text-center font-semibold focus:outline-2 focus:outline-[var(--dr-blue)]"
          style={{ width: 52, padding: '6px 10px', border: '1px solid var(--dr-border)', borderRadius: 6, fontSize: 13, color: 'var(--dr-text)', opacity: isAll ? 0.4 : 1 }}
        />
        <span style={{ fontSize: 13, color: 'var(--dr-text-muted)', opacity: isAll ? 0.4 : 1 }}>days</span>
        <div className="flex gap-1 flex-wrap">
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => onChange(preset)}
              className="cursor-pointer transition-all"
              style={{
                padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: `1px solid ${days === preset ? '#BFDBFE' : 'var(--dr-border)'}`,
                background: days === preset ? 'var(--dr-blue-light)' : '#fff',
                color: days === preset ? 'var(--dr-blue)' : 'var(--dr-text-muted)',
              }}
            >
              {DATE_PRESET_LABELS[preset] ?? preset}
            </button>
          ))}
          {showAll && (
            <button
              onClick={() => onChange(isAll ? 7 : 0)}
              className="cursor-pointer transition-all"
              style={{
                padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: `1px solid ${isAll ? '#BBF7D0' : 'var(--dr-border)'}`,
                background: isAll ? '#DCFCE7' : '#fff',
                color: isAll ? '#16A34A' : 'var(--dr-text-muted)',
              }}
              title="LinkedIn only — no date cutoff, relies on LinkedIn relevance ranking"
            >
              All
            </button>
          )}
        </div>
      </div>
      {isAll && showAll && (
        <div style={{ fontSize: 11, color: '#16A34A', marginTop: 4, fontStyle: 'italic' }}>
          LinkedIn: no date cutoff — relevance-ranked results only
        </div>
      )}
    </div>
  );
}
