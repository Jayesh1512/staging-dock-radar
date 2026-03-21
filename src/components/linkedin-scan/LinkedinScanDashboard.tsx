'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type ScanEntry = {
  id: number;
  slug: string;
  posts_scraped: number;
  dock_matches: number;
  dji_count: number;
  dock_count: number;
  diab_count: number;
  batch: string | null;
  run_id: string;
  scanned_at: string;
};

type BatchSummary = {
  batch: string;
  companies: number;
  totalPosts: number;
  withSignal: number;
  totalDockMatches: number;
  signalRate: number;
};

const BATCH_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  BFP: { bg: '#EDE9FE', text: '#6D28D9', border: '#C4B5FD' },
  B1: { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD' },
  B2: { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
  B3: { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D' },
  B4: { bg: '#FCE7F3', text: '#9D174D', border: '#F9A8D4' },
  B5: { bg: '#E0E7FF', text: '#3730A3', border: '#A5B4FC' },
  B6: { bg: '#CCFBF1', text: '#134E4A', border: '#5EEAD4' },
  B7: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
};

function batchStyle(batch: string) {
  return BATCH_COLORS[batch] ?? { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB' };
}

export function LinkedinScanDashboard() {
  const [entries, setEntries] = useState<ScanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<string>('dock_matches');
  const [sortAsc, setSortAsc] = useState(false);

  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/linkedin/scan-log');
      const data = await res.json();
      setEntries(data.rows ?? []);
      setLastRefresh(new Date());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 30s while enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // Batch summaries
  const batchSummaries = useMemo(() => {
    const map = new Map<string, BatchSummary>();
    for (const e of entries) {
      const b = e.batch || 'Unknown';
      if (!map.has(b)) map.set(b, { batch: b, companies: 0, totalPosts: 0, withSignal: 0, totalDockMatches: 0, signalRate: 0 });
      const s = map.get(b)!;
      s.companies++;
      s.totalPosts += e.posts_scraped;
      s.totalDockMatches += e.dock_matches ?? 0;
      if ((e.dock_matches ?? 0) > 0) s.withSignal++;
    }
    for (const s of map.values()) {
      s.signalRate = s.companies > 0 ? Math.round((s.withSignal / s.companies) * 100) : 0;
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.batch === 'BFP') return -1;
      if (b.batch === 'BFP') return 1;
      return a.batch.localeCompare(b.batch);
    });
  }, [entries]);

  // Overall stats
  const totalCompanies = entries.length;
  const totalPosts = entries.reduce((s, e) => s + e.posts_scraped, 0);
  const totalSignals = entries.filter((e) => (e.dock_matches ?? 0) > 0).length;
  const totalDockMatches = entries.reduce((s, e) => s + (e.dock_matches ?? 0), 0);
  const uniqueBatches = new Set(entries.map((e) => e.batch || 'Unknown'));

  // Progress tracking
  const EXPECTED_TOTAL = 144; // BFP(23) + B1-B7(121)
  const progressPct = Math.min(100, Math.round((totalCompanies / EXPECTED_TOTAL) * 100));
  const sortedByTime = useMemo(() => [...entries].sort((a, b) => new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime()), [entries]);
  const lastScan = sortedByTime[0];
  const lastScanAgo = lastScan ? Math.round((Date.now() - new Date(lastScan.scanned_at).getTime()) / 60000) : null;
  const isRunning = lastScanAgo !== null && lastScanAgo < 5;
  const recentScans = sortedByTime.slice(0, 5);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    let result = entries;
    if (batchFilter) result = result.filter((e) => (e.batch || 'Unknown') === batchFilter);
    if (filter.trim()) {
      const q = filter.toLowerCase();
      result = result.filter((e) => e.slug.toLowerCase().includes(q));
    }
    return [...result].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortCol];
      const bv = (b as Record<string, unknown>)[sortCol];
      if (typeof av === 'number' && typeof bv === 'number') return sortAsc ? av - bv : bv - av;
      return sortAsc ? String(av ?? '').localeCompare(String(bv ?? '')) : String(bv ?? '').localeCompare(String(av ?? ''));
    });
  }, [entries, filter, batchFilter, sortCol, sortAsc]);

  // Signal companies (for highlight)
  const signalCompanies = useMemo(
    () => entries.filter((e) => (e.dock_matches ?? 0) > 0).sort((a, b) => (b.dock_matches ?? 0) - (a.dock_matches ?? 0)),
    [entries],
  );

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#6B7280', fontSize: 14 }}>
        Loading scan results...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#6B7280', fontSize: 14 }}>
        No scan results yet. Run the auto-scanner to populate data.
        <br />
        <code style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8, display: 'inline-block' }}>
          node scripts/auto-scan-linkedin.mjs
        </code>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '20px 16px 28px' }}>

      {/* ── Live Status Bar ── */}
      <div style={{
        background: isRunning ? '#EFF6FF' : '#F9FAFB',
        border: `1px solid ${isRunning ? '#BFDBFE' : '#E5E7EB'}`,
        borderRadius: 10,
        padding: '12px 18px',
        marginBottom: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          {/* Status indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
              background: isRunning ? '#16A34A' : '#9CA3AF',
              boxShadow: isRunning ? '0 0 6px #16A34A' : 'none',
              animation: isRunning ? 'pulse 2s infinite' : 'none',
            }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: isRunning ? '#166534' : '#6B7280' }}>
              {isRunning ? 'Scanning...' : 'Idle'}
            </span>
          </div>

          {/* Progress bar */}
          <div style={{ flex: 1, maxWidth: 200, height: 6, background: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${progressPct}%`, height: '100%', background: isRunning ? '#2563EB' : '#6B7280', borderRadius: 3, transition: 'width 0.5s' }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>
            {totalCompanies} / {EXPECTED_TOTAL} ({progressPct}%)
          </span>

          {/* Last scan info */}
          {lastScan && (
            <span style={{ fontSize: 11, color: '#6B7280', whiteSpace: 'nowrap' }}>
              Last: <strong>{lastScan.slug}</strong> {lastScanAgo !== null && `(${lastScanAgo < 1 ? 'just now' : `${lastScanAgo}m ago`})`}
            </span>
          )}
        </div>

        {/* Auto-refresh toggle + manual refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 11, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} style={{ accentColor: '#2563EB' }} />
            Auto-refresh
          </label>
          <button onClick={fetchData} style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 5, border: '1px solid #D1D5DB', background: '#fff', color: '#374151', cursor: 'pointer' }}>
            Refresh
          </button>
          <span style={{ fontSize: 9, color: '#9CA3AF' }}>{lastRefresh.toLocaleTimeString()}</span>
        </div>
      </div>

      {/* ── Recent Activity Feed ── */}
      {recentScans.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 16px', marginBottom: 14, fontSize: 11 }}>
          <div style={{ fontWeight: 700, color: '#6B7280', marginBottom: 6, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent Scans</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {recentScans.map((e) => (
              <span key={e.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 5, fontSize: 11,
                background: (e.dock_matches ?? 0) > 0 ? '#F0FDF4' : '#F9FAFB',
                border: `1px solid ${(e.dock_matches ?? 0) > 0 ? '#BBF7D0' : '#E5E7EB'}`,
              }}>
                {e.batch && <span style={{ fontSize: 9, fontWeight: 700, color: e.batch === 'BFP' ? '#6D28D9' : '#0369A1' }}>{e.batch}</span>}
                <span style={{ fontWeight: 500 }}>{e.slug}</span>
                <span style={{ color: '#9CA3AF' }}>{e.posts_scraped}p</span>
                {(e.dock_matches ?? 0) > 0 && <span style={{ fontWeight: 700, color: '#166534' }}>{e.dock_matches}d</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Header Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Companies Scanned', value: totalCompanies, color: '#2563EB' },
          { label: 'Total Posts', value: totalPosts.toLocaleString(), color: '#0891B2' },
          { label: 'DJI Dock Signals', value: totalSignals, color: totalSignals > 0 ? '#16A34A' : '#DC2626' },
          { label: 'Total Dock Mentions', value: totalDockMatches, color: '#7C3AED' },
        ].map((stat) => (
          <div key={stat.label} style={{ background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, marginBottom: 4 }}>{stat.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* ── Signal Highlight ── */}
      {signalCompanies.length > 0 && (
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#166534', marginBottom: 8 }}>
            DJI Dock Signals Detected ({signalCompanies.length} companies)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {signalCompanies.map((e) => (
              <a
                key={e.id}
                href={`https://www.linkedin.com/company/${e.slug}/posts/`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  background: '#fff',
                  border: '1px solid #86EFAC',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#166534',
                  textDecoration: 'none',
                }}
              >
                <span style={{ ...batchStyle(e.batch || ''), padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700 }}>
                  {e.batch || '?'}
                </span>
                {e.slug}
                <span style={{ background: '#DCFCE7', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 800 }}>
                  {e.dock_matches}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ── Batch Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(uniqueBatches.size, 4)}, 1fr)`, gap: 10, marginBottom: 16 }}>
        {batchSummaries.map((s) => {
          const style = batchStyle(s.batch);
          const isActive = batchFilter === s.batch;
          return (
            <button
              key={s.batch}
              onClick={() => setBatchFilter(isActive ? null : s.batch)}
              style={{
                background: '#fff',
                border: isActive ? `2px solid ${style.text}` : `1px solid ${style.border}`,
                borderRadius: 10,
                padding: '12px 14px',
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: isActive ? `0 0 0 3px ${style.bg}` : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ background: style.bg, color: style.text, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 800 }}>
                  {s.batch}
                </span>
                {s.batch === 'BFP' && <span style={{ fontSize: 9, color: '#6B7280' }}>Benchmark</span>}
              </div>
              <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.6 }}>
                <span style={{ fontWeight: 700, color: '#111827' }}>{s.companies}</span> companies &middot;{' '}
                <span style={{ fontWeight: 700, color: '#111827' }}>{s.totalPosts}</span> posts
              </div>
              <div style={{ fontSize: 11, marginTop: 2 }}>
                <span style={{ fontWeight: 700, color: s.withSignal > 0 ? '#16A34A' : '#9CA3AF' }}>
                  {s.withSignal}
                </span>
                <span style={{ color: '#6B7280' }}> signals ({s.signalRate}%)</span>
                {s.totalDockMatches > 0 && (
                  <span style={{ color: '#16A34A', fontWeight: 700 }}> &middot; {s.totalDockMatches} matches</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Search + Results Table ── */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search company..."
            style={{ flex: 1, border: '1px solid #D1D5DB', borderRadius: 6, padding: '6px 10px', fontSize: 12.5 }}
          />
          <span style={{ fontSize: 11, color: '#6B7280', whiteSpace: 'nowrap' }}>
            {filteredEntries.length} of {entries.length} results
            {batchFilter && (
              <button onClick={() => setBatchFilter(null)} style={{ marginLeft: 6, color: '#2563EB', cursor: 'pointer', background: 'none', border: 'none', fontSize: 11, fontWeight: 600 }}>
                Clear filter
              </button>
            )}
          </span>
          <button
            onClick={fetchData}
            style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#374151', cursor: 'pointer' }}
          >
            Refresh
          </button>
        </div>

        <div style={{ maxHeight: 500, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F9FAFB', position: 'sticky', top: 0, zIndex: 1 }}>
                {([
                  ['#', '', 'center', 36],
                  ['Batch', 'batch', 'left', 55],
                  ['Company', 'slug', 'left', undefined],
                  ['Posts', 'posts_scraped', 'center', 50],
                  ['DJI', 'dji_count', 'center', 40],
                  ['DJI Dock', 'dock_matches', 'center', 65],
                  ['Dock', 'dock_count', 'center', 42],
                  ['DIaB', 'diab_count', 'center', 42],
                  ['Signal', '', 'center', 55],
                  ['Scanned', 'scanned_at', 'left', 130],
                ] as [string, string, string, number | undefined][]).map(([label, col, align, w]) => (
                  <th
                    key={label}
                    onClick={col ? () => { if (sortCol === col) setSortAsc(!sortAsc); else { setSortCol(col); setSortAsc(false); } } : undefined}
                    style={{
                      textAlign: align as 'left' | 'center',
                      padding: '7px 8px',
                      borderBottom: '1px solid #E5E7EB',
                      color: sortCol === col ? '#111827' : '#6B7280',
                      fontWeight: sortCol === col ? 800 : 600,
                      cursor: col ? 'pointer' : 'default',
                      userSelect: 'none',
                      width: w,
                      fontSize: 11,
                    }}
                  >
                    {label}{sortCol === col ? (sortAsc ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry, i) => {
                const bs = batchStyle(entry.batch || '');
                const hasSignal = (entry.dock_matches ?? 0) > 0;
                return (
                  <tr key={entry.id} style={{ background: hasSignal ? '#F0FDF4' : i % 2 ? '#F9FAFB' : '#fff' }}>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #EEF2FF', textAlign: 'center', fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>{i + 1}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #EEF2FF' }}>
                      <span style={{ display: 'inline-block', padding: '2px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700, background: bs.bg, color: bs.text }}>{entry.batch || '—'}</span>
                    </td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #EEF2FF', fontWeight: 500 }}>
                      <a href={`https://www.linkedin.com/company/${entry.slug}/posts/`} target="_blank" rel="noopener noreferrer" style={{ color: '#0369A1', textDecoration: 'none', fontSize: 11.5 }}>{entry.slug}</a>
                    </td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #EEF2FF', textAlign: 'center', color: entry.posts_scraped === 0 ? '#D1D5DB' : '#111827', fontWeight: 600 }}>{entry.posts_scraped}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #EEF2FF', textAlign: 'center', color: (entry.dji_count ?? 0) > 0 ? '#1D4ED8' : '#D1D5DB', fontWeight: 600 }}>{entry.dji_count ?? 0}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #EEF2FF', textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 700, background: hasSignal ? '#DCFCE7' : '#F3F4F6', color: hasSignal ? '#166534' : '#D1D5DB' }}>{entry.dock_matches ?? 0}</span>
                    </td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #EEF2FF', textAlign: 'center', color: (entry.dock_count ?? 0) > 0 ? '#0891B2' : '#D1D5DB', fontWeight: 600 }}>{entry.dock_count ?? 0}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #EEF2FF', textAlign: 'center', color: (entry.diab_count ?? 0) > 0 ? '#7C3AED' : '#D1D5DB', fontWeight: 600 }}>{entry.diab_count ?? 0}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #EEF2FF', textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 3, fontSize: 10, fontWeight: 700, background: hasSignal ? '#DCFCE7' : '#FEE2E2', color: hasSignal ? '#166534' : '#991B1B' }}>{hasSignal ? 'YES' : 'NO'}</span>
                    </td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #EEF2FF', fontSize: 10, color: '#9CA3AF' }}>{new Date(entry.scanned_at).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
