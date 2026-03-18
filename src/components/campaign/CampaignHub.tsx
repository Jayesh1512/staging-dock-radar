"use client";

import { useState } from 'react';
import { CAMPAIGNS, type CampaignConfig } from '@/lib/constants';
import { CampaignPanel } from './CampaignPanel';

const STATUS_STYLE: Record<CampaignConfig['status'], { bg: string; text: string; dot: string; label: string }> = {
  completed: { bg: '#DCFCE7', text: '#166534', dot: '#16A34A', label: 'Completed' },
  active:    { bg: '#DBEAFE', text: '#2563EB', dot: '#2563EB', label: 'Active' },
  planned:   { bg: '#F3F4F6', text: '#6B7280', dot: '#9CA3AF', label: 'Planned' },
};

export function CampaignHub() {
  const [selectedId, setSelectedId] = useState<string>(
    // Default to first non-completed, or the first campaign if all done
    CAMPAIGNS.find(c => c.status !== 'completed')?.id ?? CAMPAIGNS[0].id,
  );

  const selected = CAMPAIGNS.find(c => c.id === selectedId) ?? CAMPAIGNS[0];

  return (
    <div className="flex flex-col gap-4">

      {/* ── Campaign Cards Overview ─────────────────────────────────────── */}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${CAMPAIGNS.length}, 1fr)` }}>
        {CAMPAIGNS.map(c => {
          const st = STATUS_STYLE[c.status];
          const isActive = c.id === selectedId;
          return (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className="text-left cursor-pointer"
              style={{
                background: '#fff',
                border: isActive ? `2px solid var(--dr-blue)` : '1px solid var(--dr-border)',
                borderRadius: 10,
                padding: '14px 16px',
                transition: 'box-shadow 0.15s',
                boxShadow: isActive ? '0 0 0 3px rgba(37,99,235,0.08)' : undefined,
              }}
            >
              {/* Status dot + label */}
              <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.dot, flexShrink: 0, display: 'inline-block' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: st.text, background: st.bg, borderRadius: 4, padding: '1px 6px' }}>
                  {st.label}
                </span>
              </div>

              {/* Campaign label */}
              <div className="font-bold" style={{ fontSize: 14, color: 'var(--dr-text-primary)', marginBottom: 2 }}>
                {c.label}
              </div>

              {/* Tagline */}
              <div style={{ fontSize: 11, color: 'var(--dr-text-muted)', marginBottom: 10 }}>
                {c.tagline}
              </div>

              {/* Intent */}
              <div style={{ fontSize: 11, color: 'var(--dr-text-secondary)', lineHeight: 1.5, marginBottom: 10 }}>
                {c.intent}
              </div>

              {/* Keywords */}
              <div className="flex flex-wrap gap-1">
                {c.keywords.map(kw => (
                  <span
                    key={kw}
                    style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 4,
                      background: isActive ? '#EFF6FF' : '#F3F4F6',
                      color: isActive ? '#2563EB' : '#374151',
                      border: isActive ? '1px solid #BFDBFE' : '1px solid #E5E7EB',
                    }}
                  >
                    {kw}
                  </span>
                ))}
              </div>

              {/* Footer */}
              <div style={{ marginTop: 10, fontSize: 10, color: 'var(--dr-text-disabled)' }}>
                52 buckets · 16 regions · 26 weeks
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Tab Strip ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1" style={{ borderBottom: '1px solid var(--dr-border)', paddingBottom: 0 }}>
        {CAMPAIGNS.map(c => {
          const st = STATUS_STYLE[c.status];
          const isActive = c.id === selectedId;
          return (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className="cursor-pointer flex items-center gap-1.5"
              style={{
                fontSize: 12, fontWeight: isActive ? 700 : 500,
                padding: '7px 14px',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--dr-blue)' : '2px solid transparent',
                background: 'none',
                color: isActive ? 'var(--dr-blue)' : 'var(--dr-text-muted)',
                marginBottom: -1,
                cursor: 'pointer',
                transition: 'color 0.1s',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot, flexShrink: 0, display: 'inline-block' }} />
              {c.label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--dr-text-disabled)', paddingRight: 4 }}>
          {CAMPAIGNS.filter(c => c.status === 'completed').length}/{CAMPAIGNS.length} campaigns complete
        </span>
      </div>

      {/* ── Active Campaign Panel ────────────────────────────────────────── */}
      {/* key={selected.id} ensures CampaignPanel fully remounts on campaign switch,
          giving each campaign its own fresh state and DB restore */}
      <CampaignPanel key={selected.id} config={selected} />

    </div>
  );
}
