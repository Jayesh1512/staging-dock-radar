"use client";
import { DATE_PRESETS, DATE_PRESET_LABELS } from '@/lib/constants';

interface DateFilterProps {
  days: number;
  onChange: (days: number) => void;
}

export function DateFilter({ days, onChange }: DateFilterProps) {
  return (
    <div>
      <label className="block" style={{ fontSize: 12, fontWeight: 600, color: 'var(--dr-text-muted)', marginBottom: 6 }}>Date Range</label>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="number"
          value={days}
          onChange={(e) => onChange(Number(e.target.value))}
          className="text-center font-semibold focus:outline-2 focus:outline-[var(--dr-blue)]"
          style={{ width: 52, padding: '6px 10px', border: '1px solid var(--dr-border)', borderRadius: 6, fontSize: 13, color: 'var(--dr-text)' }}
        />
        <span style={{ fontSize: 13, color: 'var(--dr-text-muted)' }}>days</span>
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
        </div>
      </div>
    </div>
  );
}
