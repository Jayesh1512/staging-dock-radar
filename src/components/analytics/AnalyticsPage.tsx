"use client";
import React, { useEffect, useState, useCallback } from 'react';
import type { AnalyticsData, AnalyticsCountryRow, DrilldownArticle } from '@/app/api/analytics/route';
import { SocialLeaderboard } from './SocialLeaderboard';

// ── Signal palette (condensed 5) ──────────────────────────────────────────
const SIGNAL_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  DEPLOYMENT:  { bg: '#DCFCE7', text: '#166534', bar: '#22C55E' },
  PROCUREMENT: { bg: '#DBEAFE', text: '#1E40AF', bar: '#3B82F6' },
  PARTNERSHIP: { bg: '#FFF7ED', text: '#C2410C', bar: '#F97316' },
  GROWTH:      { bg: '#FEF9C3', text: '#A16207', bar: '#EAB308' },
  REGULATORY:  { bg: '#FEE2E2', text: '#991B1B', bar: '#EF4444' },
  OTHER:       { bg: '#F3F4F6', text: '#4B5563', bar: '#9CA3AF' },
};

function SignalPill({ type }: { type: string }) {
  const c = SIGNAL_COLORS[type] ?? SIGNAL_COLORS.OTHER;
  return (
    <span className="inline-flex items-center gap-1 font-semibold" style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.text }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.bar, flexShrink: 0 }} />
      {type}
    </span>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number | React.ReactNode; sub?: string; accent?: boolean }) {
  return (
    <div style={{ background: accent ? '#F0F7FF' : '#fff', border: `1px solid ${accent ? '#BBDEFB' : 'var(--dr-border)'}`, borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--dr-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: accent ? 'var(--dr-blue)' : 'var(--dr-text)', lineHeight: 1.1, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--dr-text-muted)', marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

function CountryBar({ row, max, onClick }: { row: AnalyticsCountryRow; max: number; onClick: () => void }) {
  const c = SIGNAL_COLORS[row.topSignal] ?? SIGNAL_COLORS.OTHER;
  const pct = max > 0 ? (row.total / max) * 100 : 0;
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer', padding: '4px 6px', borderRadius: 6, margin: '0 -6px' }}
      onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--dr-text)' }}>{row.name}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--dr-text)' }}>{row.total}</span>
      </div>
      <div style={{ height: 8, background: '#F3F4F6', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: c.bar, borderRadius: 4, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

// ── Drill-down slide-in panel ─────────────────────────────────────────────
function DrilldownPanel({
  country,
  onClose,
}: {
  country: string;
  onClose: () => void;
}) {
  const [articles, setArticles] = useState<DrilldownArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/analytics?country=${encodeURIComponent(country)}`)
      .then(r => r.json())
      .then((d: { articles?: DrilldownArticle[]; error?: string }) => {
        if (d.error) { setError(d.error); return; }
        setArticles(d.articles ?? []);
      })
      .catch(() => setError('Failed to load articles'))
      .finally(() => setLoading(false));
  }, [country]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 200 }}
      />
      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
        background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        zIndex: 201, display: 'flex', flexDirection: 'column', overflowY: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--dr-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--dr-text)' }}>{country}</div>
              <div style={{ fontSize: 12, color: 'var(--dr-text-muted)', marginTop: 2 }}>
                {loading ? 'Loading…' : `${articles.length} signal${articles.length !== 1 ? 's' : ''} · click any title to open article`}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ fontSize: 18, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dr-text-muted)', padding: '0 4px' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 0' }}>
          {error && (
            <div style={{ margin: '12px 24px', padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B' }}>
              ✕ {error}
            </div>
          )}
          {loading && (
            <div style={{ padding: '40px 24px', textAlign: 'center', fontSize: 13, color: 'var(--dr-text-muted)' }}>
              Loading signals…
            </div>
          )}
          {!loading && !error && articles.length === 0 && (
            <div style={{ padding: '40px 24px', textAlign: 'center', fontSize: 13, color: 'var(--dr-text-muted)' }}>
              No articles found
            </div>
          )}
          {articles.map((a, i) => {
            const displayUrl = a.resolved_url && !a.resolved_url.includes('news.google.com') ? a.resolved_url : a.url;
            const pub = [a.publisher, a.published_at ? new Date(a.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null].filter(Boolean).join(' · ');
            return (
              <div
                key={a.id}
                style={{
                  padding: '14px 24px',
                  borderBottom: i < articles.length - 1 ? '1px solid #F3F4F6' : 'none',
                }}
              >
                {/* Title row */}
                <a
                  href={displayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--dr-text)', textDecoration: 'none', lineHeight: 1.35, display: 'block' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--dr-blue)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--dr-text)')}
                >
                  {a.title}
                </a>
                {/* Meta row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
                  <SignalPill type={a.signal_type} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--dr-blue)', background: 'var(--dr-blue-light)', padding: '2px 6px', borderRadius: 6 }}>
                    {a.relevance_score}
                  </span>
                  {a.flytbase_mentioned && (
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: '#1D4ED8', background: '#EFF6FF', padding: '2px 6px', borderRadius: 8 }}>
                      ✓ FlytBase
                    </span>
                  )}
                  {pub && (
                    <span style={{ fontSize: 11, color: 'var(--dr-text-muted)' }}>{pub}</span>
                  )}
                </div>
                {/* Summary */}
                {a.summary && (
                  <div style={{ fontSize: 12, color: 'var(--dr-text-muted)', marginTop: 7, lineHeight: 1.5 }}>
                    {a.summary}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
type AnalyticsView = 'signals' | 'leaderboard';

export function AnalyticsPage({ onClose }: { onClose: () => void }) {
  const [activeView, setActiveView] = useState<AnalyticsView>('leaderboard');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/analytics')
      .then(r => r.json())
      .then((d: AnalyticsData & { error?: string }) => {
        if (d.error) { setError(d.error); return; }
        setData(d);
      })
      .catch(() => setError('Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  const handleCountryClick = useCallback((name: string) => {
    setSelectedCountry(name);
  }, []);

  const maxCountryTotal = data ? (data.countries[0]?.total ?? 1) : 1;

  return (
    <div style={{ maxWidth: 'var(--dr-max-w)', margin: '0 auto', padding: '24px 32px 64px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Page header + sub-tabs */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--dr-text)' }}>Radar Analytics</div>
          <div style={{ display: 'flex', gap: 0, marginTop: 10, borderBottom: '1px solid var(--dr-border)' }}>
            {([
              { key: 'leaderboard' as const, label: 'Social Leaderboard' },
              { key: 'signals' as const, label: 'Signal Overview' },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveView(tab.key)}
                style={{
                  fontSize: 13, fontWeight: activeView === tab.key ? 600 : 500,
                  padding: '8px 16px', cursor: 'pointer',
                  background: 'none', border: 'none',
                  borderBottom: activeView === tab.key ? '2px solid var(--dr-blue)' : '2px solid transparent',
                  color: activeView === tab.key ? 'var(--dr-blue)' : 'var(--dr-text-muted)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ fontSize: 12, fontWeight: 500, color: 'var(--dr-text-muted)', background: 'none', border: '1px solid var(--dr-border)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}
        >
          ← Back to queue
        </button>
      </div>

      {/* Social Leaderboard view */}
      {activeView === 'leaderboard' && <SocialLeaderboard />}

      {/* Signal Overview: Loading / error */}
      {activeView === 'signals' && loading && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--dr-text-muted)', fontSize: 13 }}>
          Loading analytics…
        </div>
      )}
      {activeView === 'signals' && error && (
        <div style={{ padding: '16px 20px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B' }}>
          ✕ {error}
        </div>
      )}

      {activeView === 'signals' && data && (
        <>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            <StatCard label="Total Signals" value={data.stats.total} sub="Queue-eligible articles" accent />
            <StatCard label="Countries Covered" value={data.stats.countriesCount} sub="Unique countries with signals" />
            <StatCard
              label="Top Signal Type"
              value={<span style={{ fontSize: 20, color: SIGNAL_COLORS[data.stats.topSignalType]?.text ?? 'var(--dr-text)' }}>{data.stats.topSignalType}</span>}
              sub={`${data.stats.topSignalCount} signals`}
            />
            <StatCard label="FlytBase Mentioned" value={data.stats.flytbaseCount} sub="Direct brand mentions" />
          </div>

          {/* Two-column layout: chart + table */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16, alignItems: 'start' }}>

            {/* Left: bar chart */}
            <div style={{ background: '#fff', border: '1px solid var(--dr-border)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dr-text)', marginBottom: 3 }}>Top Countries by Signal Count</div>
              <div style={{ fontSize: 11.5, color: 'var(--dr-text-muted)', marginBottom: 18 }}>
                Top {data.countries.length} · bar colour = top signal type · click to drill down
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.countries.map(row => (
                  <CountryBar key={row.name} row={row} max={maxCountryTotal} onClick={() => handleCountryClick(row.name)} />
                ))}
              </div>
              {/* Legend */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--dr-border)' }}>
                {Object.entries(SIGNAL_COLORS).filter(([k]) => k !== 'OTHER').map(([sig, c]) => (
                  <div key={sig} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--dr-text-muted)' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: c.bar, flexShrink: 0 }} />
                    {sig}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: table */}
            <div style={{ background: '#fff', border: '1px solid var(--dr-border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--dr-border)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dr-text)' }}>Country Signal Breakdown</div>
                <div style={{ fontSize: 11.5, color: 'var(--dr-text-muted)', marginTop: 2 }}>All countries with ≥ 1 signal · sorted by total · click row to see articles</div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['#', 'Country', 'Total', 'Top Signal', 'FlytBase'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 600, textAlign: 'left', color: 'var(--dr-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, background: '#F9FAFB', borderBottom: '1px solid var(--dr-border)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.countries.map((row, i) => (
                    <tr
                      key={row.name}
                      onClick={() => handleCountryClick(row.name)}
                      style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--dr-text-muted)' }}>{i + 1}</td>
                      <td style={{ padding: '10px 16px', fontSize: 12.5, fontWeight: 600, color: 'var(--dr-text)' }}>{row.name}</td>
                      <td style={{ padding: '10px 16px', fontSize: 14, fontWeight: 700, color: 'var(--dr-text)' }}>{row.total}</td>
                      <td style={{ padding: '10px 16px' }}><SignalPill type={row.topSignal} /></td>
                      <td style={{ padding: '10px 16px' }}>
                        {row.flytbase > 0
                          ? <span style={{ fontSize: 10.5, fontWeight: 600, color: '#1D4ED8', background: '#EFF6FF', padding: '2px 6px', borderRadius: 8 }}>✓ {row.flytbase}</span>
                          : <span style={{ fontSize: 12, color: 'var(--dr-text-disabled)' }}>—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        </>
      )}

      {/* Drill-down panel (signals view only) */}
      {activeView === 'signals' && selectedCountry && (
        <DrilldownPanel
          country={selectedCountry}
          onClose={() => setSelectedCountry(null)}
        />
      )}
    </div>
  );
}
