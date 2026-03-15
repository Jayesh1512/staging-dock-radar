"use client";
import type { ConfigItem } from "@/lib/types";

interface ConfigBarProps {
  items: ConfigItem[];
}

export function ConfigBar({ items }: ConfigBarProps) {
  return (
    <div
      className="flex items-center overflow-x-auto flex-nowrap"
      style={{
        background: 'var(--dr-surface)',
        border: '1px solid var(--dr-border)',
        borderRadius: 10,
        height: 52,
        padding: '0 20px',
        marginBottom: 20,
      }}
    >
      {items.map((item, i) => (
        <div key={item.label} className="flex items-center gap-2 flex-shrink-0 relative" style={{ padding: '0 20px', ...(i === 0 ? { paddingLeft: 0 } : {}) }}>
          {i > 0 && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2" style={{ width: 1, height: 24, background: 'var(--dr-border)' }} />
          )}
          <span className="whitespace-nowrap uppercase" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--dr-text-muted)', letterSpacing: 0.4 }}>
            {item.label}
          </span>
          {item.editable && item.type === 'number' ? (
            <input
              type="number"
              value={item.value as number}
              onChange={(e) => item.onChange?.(Number(e.target.value))}
              className="text-center focus:outline-2 focus:outline-[var(--dr-blue)]"
              style={{
                width: 56, padding: '4px 8px',
                border: '1px solid var(--dr-border)', borderRadius: 6,
                fontSize: 13, fontWeight: 600, color: 'var(--dr-text)',
                fontFamily: 'Inter, sans-serif', background: '#fff',
              }}
            />
          ) : item.editable && item.type === 'select' && item.options ? (
            <select
              value={item.value as string}
              onChange={(e) => item.onChange?.(e.target.value)}
              className="cursor-pointer"
              style={{
                padding: '4px 8px',
                border: '1px solid var(--dr-border)', borderRadius: 6,
                fontSize: 13, fontWeight: 500, color: 'var(--dr-text)',
                fontFamily: 'Inter, sans-serif', background: '#fff',
                maxWidth: 260,
              }}
            >
              {item.options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <span
              className="whitespace-nowrap"
              style={{
                background: '#F3F4F6', color: 'var(--dr-text-muted)',
                fontSize: 12.5, fontWeight: 600,
                padding: '3px 10px', borderRadius: 6,
                border: '1px solid var(--dr-border)',
              }}
            >
              {String(item.value)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
