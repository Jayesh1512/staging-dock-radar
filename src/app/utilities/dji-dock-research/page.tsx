"use client";

import { useCallback, useState } from 'react';
import Link from 'next/link';

type GoogleNewsRow = {
  title: string;
  url: string;
  published_at: string | null;
  region: string;
  snippet: string | null;
};

type LinkedInRow = {
  country_code: string;
  region_label: string;
  linkedin_search_url: string;
  ok: boolean;
  error?: string;
  posts_detected: number;
  html_preview: string;
  total_bytes: number;
  truncated: boolean;
};

function googleNewsCountsByRegion(rows: GoogleNewsRow[]): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(r.region, (m.get(r.region) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

type ApiOk = {
  keyword: string;
  googleNews: GoogleNewsRow[];
  linkedin: LinkedInRow[];
  linkedinSkipped: boolean;
  linkedinSkipReason?: string;
};

export default function DjiDockResearchPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiOk | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch('/api/research/dji-dock-raw', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json.error === 'string' ? json.error : `HTTP ${res.status}`);
        return;
      }
      setData(json as ApiOk);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="min-h-screen" style={{ background: '#F3F4F6' }}>
      <div className="mx-auto" style={{ maxWidth: 1100, padding: '24px 32px 64px' }}>
        <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: 20 }}>
          <Link
            href="/"
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--dr-blue)', textDecoration: 'none' }}
          >
            ← Dashboard
          </Link>
          <span style={{ color: 'var(--dr-border)' }}>|</span>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--dr-text)', margin: 0 }}>
            DJI Dock — raw snapshot
          </h1>
        </div>

        <div
          className="bg-white"
          style={{
            border: '1px solid var(--dr-border)',
            borderRadius: 'var(--dr-radius-card)',
            padding: 20,
            marginBottom: 20,
          }}
        >
          <p style={{ fontSize: 13, color: 'var(--dr-text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
            <strong>Phase 1:</strong> Google News RSS for the last day (<code>qdr:d1</code>) across all Dock Radar
            editions, keyword <strong>DJI Dock</strong>, deduped by URL. <strong>Phase 2:</strong> LinkedIn content
            search for the same keyword via{' '}
            <a href="https://www.scraperapi.com/documentation/" target="_blank" rel="noreferrer">
              ScraperAPI
            </a>{' '}
            (<code>api.scraperapi.com</code> + <code>country_code</code> for the same eight regions as Core 8: US, UK,
            France, Australia, Italy, Singapore, UAE, Brazil). Nothing is scored or merged —
            display only. LinkedIn <strong>posts detected</strong> = distinct <code>urn:li:activity</code> IDs in each
            country&apos;s HTML (heuristic; 0 if login wall or empty).
          </p>
          <button
            type="button"
            onClick={run}
            disabled={loading}
            className="cursor-pointer disabled:opacity-50"
            style={{
              background: 'var(--dr-blue)',
              color: '#fff',
              padding: '10px 22px',
              borderRadius: 'var(--dr-radius-btn)',
              border: 'none',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {loading ? 'Running Phase 1 + Phase 2…' : 'Run snapshot'}
          </button>
          <p style={{ fontSize: 11, color: 'var(--dr-text-muted)', margin: '10px 0 0', fontStyle: 'italic' }}>
            Set <code>SCRAPERAPI_KEY</code> in <code>.env.local</code> for LinkedIn. Phase 1 needs no API key.
          </p>
        </div>

        {error && (
          <div
            style={{
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 8,
              padding: '12px 14px',
              marginBottom: 16,
              fontSize: 13,
              color: '#991B1B',
            }}
          >
            {error}
          </div>
        )}

        {data && (
          <div className="flex flex-col gap-6">
            <section
              className="bg-white"
              style={{ border: '1px solid var(--dr-border)', borderRadius: 12, overflow: 'hidden' }}
            >
              <header
                style={{
                  padding: '14px 18px',
                  background: 'var(--dr-surface)',
                  borderBottom: '1px solid var(--dr-border)',
                  fontWeight: 700,
                  fontSize: 15,
                  color: 'var(--dr-text)',
                }}
              >
                Google News <span style={{ fontWeight: 500, color: 'var(--dr-text-muted)' }}>({data.googleNews.length})</span>
              </header>
              {data.googleNews.length > 0 && (
                <div
                  style={{
                    padding: '10px 18px',
                    borderBottom: '1px solid var(--dr-border)',
                    background: '#FAFAFA',
                    fontSize: 12,
                  }}
                >
                  <span style={{ fontWeight: 700, color: 'var(--dr-text-secondary)' }}>By edition (gl): </span>
                  {googleNewsCountsByRegion(data.googleNews).map(([gl, n], i) => (
                    <span key={gl}>
                      {i > 0 ? ' · ' : null}
                      <code>{gl}</code> {n}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ maxHeight: 480, overflow: 'auto' }}>
                {data.googleNews.length === 0 ? (
                  <p style={{ padding: 20, margin: 0, color: 'var(--dr-text-muted)' }}>No articles returned.</p>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {data.googleNews.map((row, i) => (
                      <li
                        key={`${row.url}-${i}`}
                        style={{
                          padding: '12px 18px',
                          borderBottom: '1px solid #F3F4F6',
                          fontSize: 13,
                        }}
                      >
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontWeight: 600, color: 'var(--dr-blue)', textDecoration: 'none' }}
                        >
                          {row.title || '(no title)'}
                        </a>
                        <div style={{ fontSize: 11, color: 'var(--dr-text-muted)', marginTop: 4 }}>
                          {row.published_at ? new Date(row.published_at).toISOString() : '—'} · region{' '}
                          <code>{row.region}</code>
                        </div>
                        {row.snippet && (
                          <p style={{ margin: '8px 0 0', color: 'var(--dr-text-secondary)', lineHeight: 1.45 }}>
                            {row.snippet}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section
              className="bg-white"
              style={{ border: '1px solid var(--dr-border)', borderRadius: 12, overflow: 'hidden' }}
            >
              <header
                style={{
                  padding: '14px 18px',
                  background: 'var(--dr-surface)',
                  borderBottom: '1px solid var(--dr-border)',
                  fontWeight: 700,
                  fontSize: 15,
                  color: 'var(--dr-text)',
                }}
              >
                LinkedIn{' '}
                <span style={{ fontWeight: 500, color: 'var(--dr-text-muted)' }}>
                  {data.linkedinSkipped
                    ? '(ScraperAPI — not run)'
                    : `(ScraperAPI — ${data.linkedin.reduce((s, r) => s + r.posts_detected, 0)} posts detected across ${data.linkedin.length} countries)`}
                </span>
              </header>
              {data.linkedinSkipped ? (
                <p style={{ padding: 20, margin: 0, color: '#B45309', fontSize: 13 }}>
                  Skipped: {data.linkedinSkipReason}
                </p>
              ) : (
                <div style={{ padding: 12 }}>
                  <p style={{ fontSize: 12, color: 'var(--dr-text-muted)', margin: '0 0 12px' }}>
                    Target URL (same for all countries):{' '}
                    <code style={{ fontSize: 11, wordBreak: 'break-all' }}>
                      {data.linkedin[0]?.linkedin_search_url ?? '—'}
                    </code>
                  </p>
                  <div style={{ overflowX: 'auto', marginBottom: 14 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: 'var(--dr-surface)', textAlign: 'left' }}>
                          <th style={{ padding: '8px 10px', border: '1px solid var(--dr-border)' }}>Country</th>
                          <th style={{ padding: '8px 10px', border: '1px solid var(--dr-border)' }}>Scraper code</th>
                          <th style={{ padding: '8px 10px', border: '1px solid var(--dr-border)' }}>Posts detected</th>
                          <th style={{ padding: '8px 10px', border: '1px solid var(--dr-border)' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.linkedin.map((row) => (
                          <tr key={row.country_code}>
                            <td style={{ padding: '8px 10px', border: '1px solid var(--dr-border)', fontWeight: 600 }}>
                              {row.region_label}
                            </td>
                            <td style={{ padding: '8px 10px', border: '1px solid var(--dr-border)' }}>
                              <code>{row.country_code}</code>
                            </td>
                            <td style={{ padding: '8px 10px', border: '1px solid var(--dr-border)', fontWeight: 700 }}>
                              {row.posts_detected}
                            </td>
                            <td style={{ padding: '8px 10px', border: '1px solid var(--dr-border)', fontSize: 12 }}>
                              {row.ok ? 'OK' : 'Failed'}
                              {row.error ? ` — ${row.error}` : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--dr-text-muted)', margin: '0 0 12px', fontStyle: 'italic' }}>
                    Totals across countries are not deduped (the same post can appear in multiple geos).
                  </p>
                  <div className="flex flex-col gap-2">
                    {data.linkedin.map((row) => (
                      <details
                        key={row.country_code}
                        style={{
                          border: '1px solid var(--dr-border)',
                          borderRadius: 8,
                          overflow: 'hidden',
                        }}
                      >
                        <summary
                          className="cursor-pointer"
                          style={{
                            padding: '10px 14px',
                            background: row.ok ? '#F0FDF4' : '#FEF2F2',
                            fontWeight: 600,
                            fontSize: 13,
                            listStyle: 'none',
                          }}
                        >
                          {row.region_label} (<code>{row.country_code}</code>) — {row.posts_detected} post
                          {row.posts_detected === 1 ? '' : 's'}
                          {' · '}
                          {row.ok ? 'OK' : 'Failed'}
                          {row.error ? ` — ${row.error}` : ''}
                          {' · '}
                          {row.total_bytes} bytes
                          {row.truncated ? ' (preview truncated)' : ''}
                        </summary>
                        <pre
                          style={{
                            margin: 0,
                            padding: 12,
                            fontSize: 10,
                            lineHeight: 1.35,
                            maxHeight: 360,
                            overflow: 'auto',
                            background: '#FAFAFA',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {row.html_preview || '(empty)'}
                        </pre>
                      </details>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
