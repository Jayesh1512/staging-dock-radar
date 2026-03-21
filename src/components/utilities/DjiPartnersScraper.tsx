'use client';

import { useMemo, useState } from 'react';
import type { DjiVendorKind, DjiVendor } from '@/lib/dji/whereToBuyScraper';

const ALL_KINDS: DjiVendorKind[] = [
  'retail_store',
  'authorized_dealer',
  'enterprise_dealer',
  'agriculture_dealer',
  'professional_dealer',
  'delivery_dealer',
];

export function DjiPartnersScraper({ mode = 'button' }: { mode?: 'button' | 'menuItem' }) {
  const [open, setOpen] = useState(false);
  const [scrapeMode, setScrapeMode] = useState<'sample' | 'all'>('all');
  const [force, setForce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vendors, setVendors] = useState<DjiVendor[] | null>(null);
  const [summary, setSummary] = useState<Record<DjiVendorKind, number> | null>(null);
  const [cached, setCached] = useState(false);

  const preview = useMemo(() => (vendors ? vendors.slice(0, 25) : []), [vendors]);

  const buttonStyle =
    mode === 'menuItem'
      ? {
        width: '100%',
        textAlign: 'left' as const,
        fontSize: 12,
        fontWeight: 700,
        padding: '8px 12px',
        borderRadius: 8,
        border: '1px solid #E5E7EB',
        background: '#fff',
        color: '#374151',
        cursor: 'pointer',
        letterSpacing: 0.1,
      }
      : {
        fontSize: 12,
        fontWeight: 600,
        padding: '5px 14px',
        borderRadius: 7,
        border: '1px solid #E5E7EB',
        background: '#F9FAFB',
        color: '#374151',
        cursor: 'pointer',
      };

  async function runScrape() {
    setLoading(true);
    setError(null);
    setVendors(null);
    setSummary(null);
    setCached(false);
    try {
      const res = await fetch('/api/dji/where-to-buy/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: scrapeMode,
          includeKinds: ALL_KINDS,
          force,
        }),
      });
      const data = (await res.json()) as
        | { error: string }
        | { cached: boolean; snapshot: { summary: Record<DjiVendorKind, number>; vendors: DjiVendor[] } };

      if ('error' in data) {
        setError(data.error);
        return;
      }

      setCached(data.cached);
      setSummary(data.snapshot.summary);
      setVendors(data.snapshot.vendors);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to scrape DJI partners');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setOpen(false);
    setLoading(false);
    setError(null);
    setVendors(null);
    setSummary(null);
    setCached(false);
    setForce(false);
    setScrapeMode('all');
  }

  return (
    <>
      <button
        style={buttonStyle}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        🛰️ DJI Partners
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) reset();
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              width: 820,
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
            }}
          >
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid #E5E7EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
              }}
            >
              <span style={{ fontWeight: 800, fontSize: 14, color: '#111827' }}>🛰️ DJI Partners Scraper</span>
              <button
                onClick={reset}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 18,
                  color: '#9CA3AF',
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
              <div
                style={{
                  marginBottom: 12,
                  padding: '10px 14px',
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 8,
                }}
              >
                <div style={{ fontSize: 11.5, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                  What this does
                </div>
                <div style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.5 }}>
                  Scrapes partner/vendor listings from DJI&apos;s <span style={{ fontWeight: 700 }}>Where to Buy</span> endpoints
                  (retail stores, authorized dealers, enterprise dealers, agriculture/professional/delivery dealers) and returns a JSON snapshot.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700 }}>
                  <input
                    type="radio"
                    name="scrapeMode"
                    checked={scrapeMode === 'sample'}
                    onChange={() => setScrapeMode('sample')}
                  />
                  Sample (fast)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700 }}>
                  <input
                    type="radio"
                    name="scrapeMode"
                    checked={scrapeMode === 'all'}
                    onChange={() => setScrapeMode('all')}
                  />
                  All (slow)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700 }}>
                  <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                  Force fresh scrape
                </label>
              </div>

              <button
                onClick={runScrape}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  background: loading ? '#93C5FD' : '#3B82F6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: loading ? 'wait' : 'pointer',
                  opacity: loading ? 0.9 : 1,
                  marginBottom: 12,
                }}
              >
                {loading ? '⟳ Scraping DJI partners...' : `Run ${scrapeMode === 'sample' ? 'Sample' : 'All'} Scrape`}
              </button>

              {error && (
                <div style={{ padding: 10, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: '#991B1B', fontSize: 12.5, marginBottom: 12 }}>
                  ✕ {error}
                </div>
              )}

              {summary && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 900, color: '#1E293B', marginBottom: 6 }}>
                    Summary {cached ? '(cached)' : ''}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {Object.entries(summary).map(([k, n]) => (
                      <span
                        key={k}
                        style={{
                          fontSize: 11.5,
                          padding: '4px 10px',
                          borderRadius: 999,
                          background: '#F1F5F9',
                          border: '1px solid #E2E8F0',
                          color: '#334155',
                          fontWeight: 800,
                        }}
                      >
                        {k}: {n}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {vendors && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ fontSize: 12.5, color: '#475569', fontWeight: 800 }}>
                      Total vendors: {vendors.length}
                    </div>
                    <button
                      style={{
                        padding: '6px 12px',
                        fontSize: 12.5,
                        fontWeight: 800,
                        borderRadius: 8,
                        background: '#0F172A',
                        color: '#fff',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        const blob = new Blob([JSON.stringify({ vendors, summary }, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `dji-partners-${scrapeMode}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      Download JSON
                    </button>
                  </div>

                  <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 10 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#F9FAFB' }}>
                          {['Kind', 'Name', 'Country', 'Address', 'Phone'].map(col => (
                            <th key={col} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11.5, fontWeight: 900, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((v, i) => (
                          <tr key={`${v.kind}-${v.name}-${i}`} style={{ background: i % 2 ? '#F9FAFB' : '#fff' }}>
                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #EEF2FF', color: '#334155', fontWeight: 800 }}>{v.kind}</td>
                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #EEF2FF', fontWeight: 800, color: '#0F172A' }}>{v.name}</td>
                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #EEF2FF', color: '#334155' }}>{v.country ?? '—'}</td>
                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #EEF2FF', color: '#334155', maxWidth: 320 }}>
                              <span style={{ display: 'inline-block', maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom' }}>
                                {v.address ?? '—'}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #EEF2FF', color: '#334155' }}>{v.phone ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {vendors.length > preview.length && (
                    <div style={{ marginTop: 10, fontSize: 12.5, color: '#64748B', fontWeight: 700 }}>
                      Showing first {preview.length}. Download JSON for the full list.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

