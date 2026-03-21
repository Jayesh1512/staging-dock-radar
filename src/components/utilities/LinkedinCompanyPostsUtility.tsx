'use client';

import { useMemo, useState } from 'react';
import type { Article } from '@/lib/types';

type Status = 'idle' | 'collecting' | 'done' | 'error';

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

type DataSource = 'manual' | 'dji_resellers';

type DjiResellerRow = {
  name: string;
  companySlug: string;
  linkedinUrl: string | null;
};

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countKeywordOccurrences(articles: Article[], filterKeyword: string): { occurrences: number; matchedArticles: number } {
  const keyword = filterKeyword.trim();
  if (!keyword) return { occurrences: 0, matchedArticles: 0 };
  const regex = new RegExp(escapeRegExp(keyword), 'gi');

  let occurrences = 0;
  let matchedArticles = 0;
  for (const article of articles) {
    const text = [article.title, article.snippet, article.publisher, article.url].filter(Boolean).join(' ');
    if (!text) continue;
    const matches = text.match(regex);
    const count = matches?.length ?? 0;
    if (count > 0) {
      occurrences += count;
      matchedArticles += 1;
    }
  }

  return { occurrences, matchedArticles };
}

function articleContainsKeyword(article: Article, filterKeyword: string): boolean {
  const keyword = filterKeyword.trim();
  if (!keyword) return true;
  const regex = new RegExp(escapeRegExp(keyword), 'i');
  const text = [article.title, article.snippet, article.publisher, article.url].filter(Boolean).join(' ');
  return regex.test(text);
}

function extractCompanySlug(article: Article): string | null {
  const candidates = [article.publisher_url, article.url];
  for (const value of candidates) {
    const raw = String(value || '');
    const match = raw.match(/linkedin\.com\/company\/([^/?#]+)/i);
    if (match?.[1]) return decodeURIComponent(match[1]).toLowerCase();
  }
  return null;
}

export function LinkedinCompanyPostsUtility() {
  const [status, setStatus] = useState<Status>('idle');
  const [dataSource, setDataSource] = useState<DataSource>('manual');
  const [companyInput, setCompanyInput] = useState('gresco-uas');
  const [filterKeyword, setFilterKeyword] = useState('');
  const [filterDays, setFilterDays] = useState(0);
  const [maxArticles, setMaxArticles] = useState(40);
  const [batchSize, setBatchSize] = useState(100);
  const [error, setError] = useState('');
  const [runId, setRunId] = useState('');
  const [articles, setArticles] = useState<Article[]>([]);
  const [storedCount, setStoredCount] = useState(0);
  const [scrapedArticlesCount, setScrapedArticlesCount] = useState(0);
  const [keywordOccurrences, setKeywordOccurrences] = useState(0);
  const [keywordMatchedArticles, setKeywordMatchedArticles] = useState(0);
  const [sourceCompanyCount, setSourceCompanyCount] = useState(0);
  const [companyKeywordCounts, setCompanyKeywordCounts] = useState<Array<{ name: string; slug: string; matchedArticles: number }>>([]);

  const companySlugs = useMemo(
    () =>
      companyInput
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    [companyInput],
  );
  const visibleArticles = useMemo(
    () => (filterKeyword.trim() ? articles.filter((article) => articleContainsKeyword(article, filterKeyword)) : articles),
    [articles, filterKeyword],
  );

  async function loadDjiResellerCompanies(batch: number): Promise<DjiResellerRow[]> {
    const uniqueBySlug = new Map<string, DjiResellerRow>();
    let offset = 0;

    // Pull reseller records in batches to avoid loading everything in one DB call.
    while (true) {
      const res = await fetch(`/api/dji/resellers/linkedin-companies?offset=${offset}&batchSize=${batch}`);
      const data = (await res.json()) as {
        rows?: DjiResellerRow[];
        nextOffset?: number | null;
        error?: string;
      };
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Failed loading DJI resellers (HTTP ${res.status})`);
      }

      for (const row of data.rows ?? []) {
        if (!uniqueBySlug.has(row.companySlug)) uniqueBySlug.set(row.companySlug, row);
      }

      if (data.nextOffset == null) break;
      offset = data.nextOffset;
    }

    return Array.from(uniqueBySlug.values());
  }

  function buildCompanyKeywordCounts(
    keywordMatched: Article[],
    slugToName: Map<string, string>,
  ): Array<{ name: string; slug: string; matchedArticles: number }> {
    const counts = new Map<string, number>();
    for (const article of keywordMatched) {
      const slug = extractCompanySlug(article);
      if (!slug) continue;
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([slug, matchedArticles]) => ({
        slug,
        matchedArticles,
        name: slugToName.get(slug) ?? slug,
      }))
      .sort((a, b) => b.matchedArticles - a.matchedArticles || a.name.localeCompare(b.name));
  }

  async function runCollectionAndCount() {
    let slugsToCollect = companySlugs;
    let slugToName = new Map<string, string>();

    if (dataSource === 'manual') {
      if (!companySlugs.length) {
        setError('Enter at least one company slug');
        return;
      }
    } else {
      const companies = await loadDjiResellerCompanies(batchSize);
      slugsToCollect = companies.map((row) => row.companySlug);
      slugToName = new Map(companies.map((row) => [row.companySlug, row.name]));
      if (!slugsToCollect.length) {
        setError('No DJI resellers with valid LinkedIn company ids were found');
        return;
      }
    }

    setError('');
    setRunId('');
    setArticles([]);
    setStoredCount(0);
    setScrapedArticlesCount(0);
    setKeywordOccurrences(0);
    setKeywordMatchedArticles(0);
    setSourceCompanyCount(0);
    setCompanyKeywordCounts([]);
    setStatus('collecting');

    try {
      const collectRes = await fetch('/api/collect-linkedin/company-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companySlugs: slugsToCollect,
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
      setScrapedArticlesCount((collectData.articles ?? []).length);
      setSourceCompanyCount(slugsToCollect.length);
      const keywordStats = countKeywordOccurrences(collectData.articles ?? [], filterKeyword);
      setKeywordOccurrences(keywordStats.occurrences);
      setKeywordMatchedArticles(keywordStats.matchedArticles);
      if (filterKeyword.trim()) {
        const matchedArticlesList = (collectData.articles ?? []).filter((article) => articleContainsKeyword(article, filterKeyword));
        setCompanyKeywordCounts(buildCompanyKeywordCounts(matchedArticlesList, slugToName));
      } else {
        setCompanyKeywordCounts([]);
      }
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to collect company posts');
      setStatus('error');
    }
  }

  function resetForm() {
    setStatus('idle');
    setError('');
    setRunId('');
    setArticles([]);
    setStoredCount(0);
    setScrapedArticlesCount(0);
    setKeywordOccurrences(0);
    setKeywordMatchedArticles(0);
    setSourceCompanyCount(0);
    setCompanyKeywordCounts([]);
  }

  return (
    <div style={{ width: '100%', maxWidth: 980, margin: '0 auto', padding: '20px 16px 28px' }}>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', boxShadow: '0 10px 24px rgba(0,0,0,0.06)' }}>
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
          <button
            onClick={resetForm}
            style={{ fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#374151', cursor: 'pointer' }}
          >
            Reset
          </button>
        </div>

        <div style={{ padding: 18 }}>
              <div style={{ marginBottom: 10, fontSize: 12.5, color: '#475569', lineHeight: 1.5 }}>
                Choose a data source and collect LinkedIn company posts, then count keyword matches.
              </div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 6, color: '#6B7280' }}>
                Data source
              </label>
              <select
                value={dataSource}
                onChange={(e) => setDataSource(e.target.value as DataSource)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  border: '1px solid #D1D5DB',
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 12.5,
                  marginBottom: 10,
                  background: '#fff',
                }}
              >
                <option value="manual">Manual Company Slugs</option>
                <option value="dji_resellers">DJI resellers</option>
              </select>

              {dataSource === 'manual' ? (
                <>
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
                </>
              ) : (
                <>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 6, color: '#6B7280' }}>
                    DJI reseller batch size
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={batchSize}
                    onChange={(e) => setBatchSize(Number(e.target.value || 1))}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      border: '1px solid #D1D5DB',
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 12.5,
                      marginBottom: 10,
                    }}
                  />
                </>
              )}

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
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 6, color: '#6B7280' }}>
                Filter keyword
              </label>
              <input
                type="text"
                value={filterKeyword}
                onChange={(e) => setFilterKeyword(e.target.value)}
                placeholder="drone, logistics, inspection..."
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  border: '1px solid #D1D5DB',
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 12.5,
                  marginBottom: 12,
                }}
              />

              <button
                onClick={runCollectionAndCount}
                disabled={status === 'collecting'}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  background: status === 'collecting' ? '#93C5FD' : '#2563EB',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: status === 'collecting' ? 'wait' : 'pointer',
                  marginBottom: 12,
                }}
              >
                {status === 'collecting' ? '⟳ Collecting LinkedIn company posts...' : 'Collect + Count'}
              </button>

              {error && (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: 12.5, marginBottom: 12 }}>
                  ✕ {error}
                </div>
              )}

              {status === 'done' && (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: 12.5, color: '#334155', marginBottom: 12 }}>
                  <div><strong>Run ID:</strong> {runId}</div>
                  <div><strong>Collected:</strong> {storedCount}</div>
                  <div><strong>Companies processed:</strong> {sourceCompanyCount}</div>
                  {filterKeyword.trim() && (
                    <div>
                      <strong>Keyword occurrences:</strong> {keywordOccurrences} across {scrapedArticlesCount} scraped articles ({keywordMatchedArticles} matched)
                    </div>
                  )}
                </div>
              )}
              {status === 'done' && filterKeyword.trim() && companyKeywordCounts.length > 0 && (
                <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, maxHeight: 240, overflowY: 'auto', marginBottom: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#F9FAFB' }}>
                        <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #E5E7EB', color: '#6B7280' }}>Company</th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #E5E7EB', color: '#6B7280' }}>Matched articles</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companyKeywordCounts.map((row, i) => (
                        <tr key={`${row.slug}-${i}`} style={{ background: i % 2 ? '#F9FAFB' : '#fff' }}>
                          <td style={{ padding: '8px 10px', borderBottom: '1px solid #EEF2FF' }}>{row.name}</td>
                          <td style={{ padding: '8px 10px', borderBottom: '1px solid #EEF2FF' }}>{row.matchedArticles}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {visibleArticles.length > 0 && (
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
                      {visibleArticles.slice(0, 25).map((a, i) => (
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
              {filterKeyword.trim() && articles.length > 0 && visibleArticles.length === 0 && (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: 12.5, color: '#334155' }}>
                  No scraped articles contain keyword "{filterKeyword}".
                </div>
              )}
        </div>
      </div>
    </div>
  );
}
