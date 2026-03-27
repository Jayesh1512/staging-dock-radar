"use client";

import React, { useState } from 'react';
import { Navbar } from '@/components/shared/Navbar';

const COUNTRIES = [
  { code: 'FR', label: 'France' },
  { code: 'DE', label: 'Germany' },
  { code: 'UK', label: 'United Kingdom' },
  { code: 'AU', label: 'Australia' },
  { code: 'US', label: 'United States' },
  { code: 'IN', label: 'India' },
  { code: 'AE', label: 'UAE' },
  { code: 'SA', label: 'Saudi Arabia' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'IT', label: 'Italy' },
  { code: 'ES', label: 'Spain' },
  { code: 'SG', label: 'Singapore' },
  { code: 'JP', label: 'Japan' },
  { code: 'KR', label: 'South Korea' },
  { code: 'BR', label: 'Brazil' },
];

type ApiResult = {
  companyName: string;
  companyCountryInput: string;
  normalizedCompanyName: string;
  canonicalCountryName: string;
  serperQuery: string;
  serperCountryCode: string;
  topResult: { title: string; link: string; snippet: string; position: number } | null;
  crawledTop: { ok: boolean; url: string; charCount: number; timeMs: number } | null;
  crawledRoot: { ok: boolean; url: string; charCount: number; timeMs: number } | null;
  djiDockRegex: {
    top: { hit: boolean; count: number; match: string | null; snippet: string | null };
    root: { hit: boolean; count: number; match: string | null; snippet: string | null };
    anyHit: boolean;
  };
  linkedin: { found: string | null; source: 'top' | 'root' | null };
  storedToDiscoveredCompany: boolean;
  discoveredCompany?: {
    normalized_name: string;
    display_name: string;
    website: string | null;
    countries: string[];
    signal_types: string[];
    mention_count: number;
    linkedin: string | null;
  };
};

export default function DjiDockCompanyEnricherPage() {
  const [companyName, setCompanyName] = useState('');
  const [companyCountry, setCompanyCountry] = useState('FR');
  const [pages, setPages] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/dji/dock-mentions/enrich-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName,
          company_country: companyCountry,
          pages,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      setResult(json as ApiResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#F3F4F6' }}>
      <Navbar />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px 64px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--dr-text)', margin: '0 0 20px' }}>
          DJI Dock Company Enricher
        </h1>

        <div style={{ background: '#fff', border: '1px solid var(--dr-border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Input</div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 260 }}>
              <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 4 }}>Company name</label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={loading}
                style={{ width: '100%', padding: '6px 10px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13 }}
                placeholder="e.g. DroneForce"
              />
            </div>

            <div style={{ minWidth: 220 }}>
              <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 4 }}>Company country</label>
              <select
                value={companyCountry}
                onChange={(e) => setCompanyCountry(e.target.value)}
                disabled={loading}
                style={{ width: '100%', padding: '6px 10px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13 }}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ minWidth: 140 }}>
              <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 4 }}>Serper pages</label>
              <input
                type="number"
                value={pages}
                min={1}
                max={3}
                onChange={(e) => setPages(Math.max(1, Math.min(3, parseInt(e.target.value || '1', 10) || 1)))}
                disabled={loading}
                style={{ width: '100%', padding: '6px 10px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13 }}
              />
            </div>

            <button
              onClick={run}
              disabled={loading || !companyName.trim()}
              style={{
                padding: '8px 18px',
                background: loading ? '#9CA3AF' : '#2563EB',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: loading || !companyName.trim() ? 'not-allowed' : 'pointer',
                height: 36,
              }}
            >
              {loading ? 'Running…' : 'Enrich'}
            </button>
          </div>

          <p style={{ fontSize: 11, color: 'var(--dr-text-muted)', margin: '12px 0 0', fontStyle: 'italic' }}>
            Regex-only matching (no LLM): we crawl the top Serper result and check for <code>DJI Dock</code> in the extracted page text.
          </p>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 14px', marginBottom: 16, color: '#991B1B' }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
            <div style={{ background: '#fff', border: '1px solid var(--dr-border)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#111827', marginBottom: 8 }}>Run Summary</div>
              <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6 }}>
                <div><strong>Company:</strong> {result.companyName} · {result.companyCountryInput} (normalized: <code>{result.normalizedCompanyName}</code>)</div>
                <div><strong>Serper query:</strong> {result.serperQuery} · country code: <code>{result.serperCountryCode}</code></div>
              </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid var(--dr-border)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#111827', marginBottom: 12 }}>Top Result + Regex Check</div>

              {result.topResult ? (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: '#374151', fontWeight: 700, marginBottom: 6 }}>Top Serper result</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#2563EB', marginBottom: 4 }}>
                    <a href={result.topResult.link} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: '#2563EB' }}>
                      {result.topResult.title || '(no title)'}
                    </a>
                  </div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>
                    Position #{result.topResult.position} · Link: <code style={{ wordBreak: 'break-all' }}>{result.topResult.link}</code>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' }}>No Serper results.</div>
              )}

              {result.crawledTop ? (
                <div style={{ fontSize: 12, color: '#374151', marginBottom: 12 }}>
                  Top URL crawl: <code>{result.crawledTop.ok ? 'OK' : 'FAILED'}</code> · chars: <strong>{result.crawledTop.charCount}</strong> · time: <strong>{result.crawledTop.timeMs}ms</strong>
                  <div style={{ fontSize: 11, color: '#6B7280', marginTop: 6, wordBreak: 'break-all' }}>
                    URL: <code>{result.crawledTop.url}</code>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>No crawl performed.</div>
              )}

              {result.crawledRoot && (
                <div style={{ fontSize: 12, color: '#374151', marginBottom: 12 }}>
                  Root homepage crawl: <code>{result.crawledRoot.ok ? 'OK' : 'FAILED'}</code> · chars: <strong>{result.crawledRoot.charCount}</strong> · time: <strong>{result.crawledRoot.timeMs}ms</strong>
                  <div style={{ fontSize: 11, color: '#6B7280', marginTop: 6, wordBreak: 'break-all' }}>
                    URL: <code>{result.crawledRoot.url}</code>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {result.djiDockRegex.anyHit ? (
                  <span style={{ padding: '5px 10px', borderRadius: 999, background: '#DCFCE7', color: '#15803D', fontWeight: 800, fontSize: 13 }}>
                    ✓ DJI DOCK mentioned
                  </span>
                ) : (
                  <span style={{ padding: '5px 10px', borderRadius: 999, background: '#F3F4F6', color: '#6B7280', fontWeight: 800, fontSize: 13 }}>
                    ○ No DJI DOCK mention
                  </span>
                )}

                <span style={{ fontSize: 12, color: '#374151' }}>
                  Top: <code>{result.djiDockRegex.top.hit ? `hit (${result.djiDockRegex.top.count})` : `no (${result.djiDockRegex.top.count})`}</code>
                  {' · '}
                  Root: <code>{result.djiDockRegex.root.hit ? `hit (${result.djiDockRegex.root.count})` : `no (${result.djiDockRegex.root.count})`}</code>
                </span>

                {(result.djiDockRegex.top.match || result.djiDockRegex.root.match) ? (
                  <span style={{ fontSize: 12, color: '#374151' }}>
                    Match: <code>{result.djiDockRegex.top.match ?? result.djiDockRegex.root.match}</code>
                  </span>
                ) : null}
              </div>

              {result.linkedin.found && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#374151' }}>
                  <strong>LinkedIn found ({result.linkedin.source}):</strong>{' '}
                  <a href={result.linkedin.found} target="_blank" rel="noreferrer" style={{ color: '#2563EB', textDecoration: 'none', fontWeight: 700 }}>
                    {result.linkedin.found}
                  </a>
                </div>
              )}

              {(result.djiDockRegex.top.snippet || result.djiDockRegex.root.snippet) ? (
                <pre
                  style={{
                    marginTop: 12,
                    background: '#FAFAFA',
                    border: '1px solid #E5E7EB',
                    borderRadius: 10,
                    padding: 12,
                    fontSize: 11,
                    color: '#374151',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: 220,
                    overflow: 'auto',
                  }}
                >
                  {result.djiDockRegex.top.snippet ?? result.djiDockRegex.root.snippet}
                </pre>
              ) : (
                <div style={{ marginTop: 12, fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>
                  No snippet extracted (no regex hit or crawl text too short).
                </div>
              )}
            </div>

            <div style={{ background: '#fff', border: '1px solid var(--dr-border)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#111827', marginBottom: 10 }}>DB Write</div>

              {result.storedToDiscoveredCompany ? (
                <div style={{ fontSize: 13, color: '#15803D', fontWeight: 800, marginBottom: 8 }}>Stored in `discovered_companies`.</div>
              ) : (
                <div style={{ fontSize: 13, color: '#6B7280', fontWeight: 800, marginBottom: 8 }}>Not stored (regex didn’t match).</div>
              )}

              {result.discoveredCompany ? (
                <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.7 }}>
                  <div>
                    <strong>Website:</strong>{' '}
                    {result.discoveredCompany.website
                      ? (
                        <a
                          href={result.discoveredCompany.website}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#2563EB', textDecoration: 'none', fontWeight: 700 }}
                        >
                          {result.discoveredCompany.website}
                        </a>
                      )
                      : '—'}
                  </div>
                  <div>
                    <strong>LinkedIn:</strong>{' '}
                    {result.discoveredCompany.linkedin
                      ? (
                        <a
                          href={result.discoveredCompany.linkedin}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#2563EB', textDecoration: 'none', fontWeight: 700 }}
                        >
                          {result.discoveredCompany.linkedin}
                        </a>
                      )
                      : '—'}
                  </div>
                  <div><strong>Countries:</strong> {result.discoveredCompany.countries.join(', ') || '—'}</div>
                  <div><strong>Signal types:</strong> {result.discoveredCompany.signal_types.join(', ') || '—'}</div>
                  <div><strong>Mention count:</strong> {result.discoveredCompany.mention_count}</div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>No discovered company row returned.</div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

