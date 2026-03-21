'use client';

import { useMemo, useState } from 'react';
import { scoreChunked } from '@/lib/score-utils';
import type { Article } from '@/lib/types';

type Status = 'idle' | 'collecting' | 'collected' | 'scoring' | 'done' | 'error';

type CollectResponse = {
  articles: Article[];
  runId: string;
  companySlugs: string[];
  stats: {
    totalFetched: number;
    afterDateFilter: number;
    afterDedup: number;
    stored: number;
    dedupRemoved: number;
  };
  error?: string;
};

export function LinkedinCompanyPostsUtility({ mode = 'button' }: { mode?: 'button' | 'menuItem' }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [companyInput, setCompanyInput] = useState('gresco-uas');
  const [filterDays, setFilterDays] = useState(0);
  const [maxArticles, setMaxArticles] = useState(40);
  const [error, setError] = useState('');
  const [runId, setRunId] = useState('');
  const [articles, setArticles] = useState<Article[]>([]);
  const [storedCount, setStoredCount] = useState(0);
  const [scoredAboveThreshold, setScoredAboveThreshold] = useState(0);

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

  const companySlugs = useMemo(
    () =>
      companyInput
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    [companyInput],
  );

  async function runCollectionAndScore() {
    if (!companySlugs.length) {
      setError('Enter at least one company slug');
      return;
    }
    setError('');
    setRunId('');
    setArticles([]);
    setStoredCount(0);
    setScoredAboveThreshold(0);
    setStatus('collecting');

    try {
      const collectRes = await fetch('/api/linkedin/company-posts/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companySlugs,
          filterDays,
          maxArticles,
        }),
      });
      const collectData = (await collectRes.json()) as CollectResponse;
      if (!collectRes.ok || collectData.error) {
        setError(collectData.error ?? `Collection failed (HTTP ${collectRes.status})`);
        setStatus('error');
        return;
      }

      setRunId(collectData.runId);
      setArticles(collectData.articles ?? []);
      setStoredCount(collectData.stats?.stored ?? 0);
      setStatus('collected');

      if (!collectData.articles?.length) {
        setStatus('done');
        return;
      }

      setStatus('scoring');
      const scored = await scoreChunked(collectData.articles);
      const aboveThreshold = scored.filter(
        (r) => r.scored.relevance_score >= 40 && !r.scored.is_duplicate && !r.scored.drop_reason,
      ).length;
      setScoredAboveThreshold(aboveThreshold);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to collect company posts');
      setStatus('error');
    }
  }

  function resetAndClose() {
    setOpen(false);
    setStatus('idle');
    setError('');
    setRunId('');
    setArticles([]);
    setStoredCount(0);
    setScoredAboveThreshold(0);
  }

  return (
    <>
      <button style={buttonStyle} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        🏢 LinkedIn Company Posts
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
            if (e.target === e.currentTarget) resetAndClose();
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              width: 760,
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
              <span style={{ fontWeight: 800, fontSize: 14, color: '#111827' }}>🏢 LinkedIn Company Posts Utility</span>
              <button onClick={resetAndClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>
                ×
              </button>
            </div>

            <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
              <div style={{ marginBottom: 10, fontSize: 12.5, color: '#475569', lineHeight: 1.5 }}>
                Provide LinkedIn company slugs (one per line) from URLs like `https://www.linkedin.com/company/gresco-uas/posts/`.
                This utility collects from a dedicated route, then runs the same scoring pipeline.
              </div>

              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 6, color: '#6B7280' }}>
                Company slugs
              </label>
              <textarea
                value={companyInput}
                onChange={(e) => setCompanyInput(e.target.value)}
                placeholder={'gresco-uas\nanother-company'}
                style={{
                  width: '100%',
                  minHeight: 110,
                  boxSizing: 'border-box',
                  border: '1px solid #D1D5DB',
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 12.5,
                  marginBottom: 10,
                }}
              />

              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                  Filter days
                  <input
                    type="number"
                    min={0}
                    value={filterDays}
                    onChange={(e) => setFilterDays(Number(e.target.value || 0))}
                    style={{ width: 90, padding: '5px 8px', border: '1px solid #D1D5DB', borderRadius: 6 }}
                  />
                </label>
                <label style={{ fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                  Max articles
                  <input
                    type="number"
                    min={1}
                    value={maxArticles}
                    onChange={(e) => setMaxArticles(Number(e.target.value || 1))}
                    style={{ width: 90, padding: '5px 8px', border: '1px solid #D1D5DB', borderRadius: 6 }}
                  />
                </label>
              </div>

              <button
                onClick={runCollectionAndScore}
                disabled={status === 'collecting' || status === 'scoring'}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  background: status === 'collecting' || status === 'scoring' ? '#93C5FD' : '#2563EB',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: status === 'collecting' || status === 'scoring' ? 'wait' : 'pointer',
                  marginBottom: 12,
                }}
              >
                {status === 'collecting'
                  ? '⟳ Collecting LinkedIn company posts...'
                  : status === 'scoring'
                    ? '⟳ Scoring collected posts...'
                    : 'Collect + Score'}
              </button>

              {error && (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: 12.5, marginBottom: 12 }}>
                  ✕ {error}
                </div>
              )}

              {(status === 'collected' || status === 'scoring' || status === 'done') && (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: 12.5, color: '#334155', marginBottom: 12 }}>
                  <div><strong>Run ID:</strong> {runId}</div>
                  <div><strong>Collected:</strong> {storedCount}</div>
                  <div><strong>Scored above threshold:</strong> {scoredAboveThreshold}</div>
                </div>
              )}

              {articles.length > 0 && (
                <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, maxHeight: 260, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#F9FAFB' }}>
                        {['Publisher', 'Title', 'URL'].map((col) => (
                          <th key={col} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #E5E7EB', color: '#6B7280' }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {articles.slice(0, 25).map((a, i) => (
                        <tr key={`${a.id}-${i}`} style={{ background: i % 2 ? '#F9FAFB' : '#fff' }}>
                          <td style={{ padding: '8px 10px', borderBottom: '1px solid #EEF2FF', maxWidth: 160 }}>{a.publisher ?? 'LinkedIn'}</td>
                          <td style={{ padding: '8px 10px', borderBottom: '1px solid #EEF2FF' }}>{a.title}</td>
                          <td style={{ padding: '8px 10px', borderBottom: '1px solid #EEF2FF' }}>
                            <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: '#0369A1', textDecoration: 'none' }}>
                              Open ↗
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
