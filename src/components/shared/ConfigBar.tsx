import type { ConfigItem } from '@/types';

interface ConfigBarProps {
  items: ConfigItem[];
}

export function ConfigBar({ items }: ConfigBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border-default bg-surface px-5 py-3">
      {items.map((item, i) => (
        <div key={item.label} className="flex items-center gap-2">
          {i > 0 && <span className="text-border-default">|</span>}
          <span className="text-[12px] font-medium uppercase tracking-wide text-text-muted">
            {item.label}
          </span>
          {item.editable && item.type === 'number' ? (
            <input
              type="number"
              value={item.value as number}
              onChange={(e) => item.onChange?.(Number(e.target.value))}
              className="h-7 w-16 rounded border border-border-default bg-white px-2 text-[13px] font-semibold text-text-primary"
            />
          ) : item.editable && item.type === 'select' && item.options ? (
            <select
              value={item.value as string}
              onChange={(e) => item.onChange?.(e.target.value)}
              className="h-7 rounded border border-border-default bg-white px-2 text-[13px] font-medium text-text-primary"
            >
              {item.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="rounded bg-white px-2 py-0.5 text-[13px] font-semibold text-text-primary border border-border-default">
              {String(item.value)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
