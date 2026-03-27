'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Article } from '@/lib/types';
import { DEFAULTS } from '@/lib/constants';

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

type CompanyResult = {
  name: string;
  slug: string;
  totalPosts: number;
  matchedPosts: number;
  signal: boolean;
};

type ScanLogEntry = {
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

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build a regex that matches ANY of the pipe-separated terms. */
function buildKeywordRegex(filterKeyword: string, flags: string): RegExp | null {
  const keyword = filterKeyword.trim();
  if (!keyword) return null;
  const parts = keyword.split('|').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const pattern = parts.map(escapeRegExp).join('|');
  return new RegExp(pattern, flags);
}

function countKeywordOccurrences(articles: Article[], filterKeyword: string): { occurrences: number; matchedArticles: number } {
  const regex = buildKeywordRegex(filterKeyword, 'gi');
  if (!regex) return { occurrences: 0, matchedArticles: 0 };

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
  const regex = buildKeywordRegex(filterKeyword, 'i');
  if (!regex) return true;
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

/** Extract a LinkedIn company slug from a full URL or treat as slug directly. */
function parseSlugOrUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  // Full LinkedIn URL → extract slug
  const urlMatch = trimmed.match(/linkedin\.com\/company\/([^/?#]+)/i);
  if (urlMatch?.[1]) return decodeURIComponent(urlMatch[1]).toLowerCase().replace(/\/+$/, '');
  // Strip trailing /posts/ or similar suffixes if someone pasted a partial path
  return trimmed.replace(/\/+$/, '').split('/').pop()?.toLowerCase() || trimmed.toLowerCase();
}

export function LinkedinCompanyPostsUtility() {
  const [status, setStatus] = useState<Status>('idle');
  const [dataSource, setDataSource] = useState<DataSource>('manual');
  const [companyInput, setCompanyInput] = useState('');
  const [filterKeyword, setFilterKeyword] = useState('DJI Dock');
  const [filterDays, setFilterDays] = useState(0);
  const [maxArticles, setMaxArticles] = useState(60);
  const [batchSize, setBatchSize] = useState(100);
  const [headless, setHeadless] = useState(false);
  const [error, setError] = useState('');
  const [runId, setRunId] = useState('');
  const [articles, setArticles] = useState<Article[]>([]);
  const [storedCount, setStoredCount] = useState(0);
  const [scrapedArticlesCount, setScrapedArticlesCount] = useState(0);
  const [keywordOccurrences, setKeywordOccurrences] = useState(0);
  const [keywordMatchedArticles, setKeywordMatchedArticles] = useState(0);
  const [sourceCompanyCount, setSourceCompanyCount] = useState(0);
  const [companyResults, setCompanyResults] = useState<CompanyResult[]>([]);

  // ── AI Scoring ──
  const [scoringStatus, setScoringStatus] = useState<'idle' | 'scoring' | 'done' | 'error'>('idle');
  const [scoringProgress, setScoringProgress] = useState(0);
  const [scoringTotal, setScoringTotal] = useState(0);
  const [scoringResult, setScoringResult] = useState<{ scored: number; queued: number; alreadyQueued: number; runId: string } | null>(null);
  const [scoringError, setScoringError] = useState('');

  async function runAiScoring() {
    const matched = visibleArticles;
    if (matched.length === 0) return;

    setScoringStatus('scoring');
    setScoringProgress(0);
    setScoringTotal(matched.length);
    setScoringError('');
    setScoringResult(null);

    try {
      // Create a synthetic run ID for grouping in Step 3
      const bridgeRunId = `run_bridge_li_${new Date().toISOString().replace(/[:.TZ-]/g, '').slice(0, 15)}`;

      // Score in batches of 40 (same as main pipeline)
      const BATCH_SIZE = 40;
      let totalScored = 0;
      let totalQueued = 0;
      let totalAlreadyQueued = 0;

      for (let i = 0; i < matched.length; i += BATCH_SIZE) {
        const batch = matched.slice(i, i + BATCH_SIZE);

        const res = await fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            articles: batch,
            minScore: DEFAULTS.minScore,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Scoring failed (HTTP ${res.status})`);
        }

        const data = await res.json();
        const results = data.results ?? [];

        for (const r of results) {
          if (r.scored.relevance_score >= 50 && !r.scored.drop_reason && !r.scored.is_duplicate) {
            if (r.article.ever_queued) {
              totalAlreadyQueued++;
            } else {
              totalQueued++;
            }
          }
          totalScored++;
        }

        setScoringProgress(Math.min(i + batch.length, matched.length));
      }

      setScoringResult({ scored: totalScored, queued: totalQueued, alreadyQueued: totalAlreadyQueued, runId: bridgeRunId });
      setScoringStatus('done');
    } catch (e) {
      setScoringError(e instanceof Error ? e.message : 'AI scoring failed');
      setScoringStatus('error');
    }
  }

  // ── Scan History ──
  const [scanLog, setScanLog] = useState<ScanLogEntry[]>([]);
  const [scanLogSearch, setScanLogSearch] = useState('');
  const [scanLogLoading, setScanLogLoading] = useState(false);
  const [sortCol, setSortCol] = useState<string>('dock_matches');
  const [sortAsc, setSortAsc] = useState(false);

  const fetchScanLog = useCallback(async () => {
    setScanLogLoading(true);
    try {
      const res = await fetch('/api/linkedin/scan-log');
      const data = await res.json();
      setScanLog(data.rows ?? []);
    } catch { /* ignore */ }
    setScanLogLoading(false);
  }, []);

  useEffect(() => { fetchScanLog(); }, [fetchScanLog]);

  const filteredScanLog = useMemo(() => {
    let result = scanLog;
    if (scanLogSearch.trim()) {
      const q = scanLogSearch.toLowerCase();
      result = result.filter((e) => e.slug.toLowerCase().includes(q) || e.batch?.toLowerCase().includes(q) || e.run_id?.toLowerCase().includes(q));
    }
    return [...result].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortCol];
      const bv = (b as Record<string, unknown>)[sortCol];
      if (typeof av === 'number' && typeof bv === 'number') return sortAsc ? av - bv : bv - av;
      return sortAsc ? String(av ?? '').localeCompare(String(bv ?? '')) : String(bv ?? '').localeCompare(String(av ?? ''));
    });
  }, [scanLog, scanLogSearch, sortCol, sortAsc]);

  const companySlugs = useMemo(
    () =>
      companyInput
        .split('\n')
        .map(parseSlugOrUrl)
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

  function buildCompanyResults(
    allArticles: Article[],
    inputSlugs: string[],
    slugToName: Map<string, string>,
    keyword: string,
  ): CompanyResult[] {
    // Count total and matched per slug
    const totalBySlug = new Map<string, number>();
    const matchedBySlug = new Map<string, number>();

    for (const article of allArticles) {
      const slug = extractCompanySlug(article);
      if (!slug) continue;
      totalBySlug.set(slug, (totalBySlug.get(slug) ?? 0) + 1);
      if (keyword.trim() && articleContainsKeyword(article, keyword)) {
        matchedBySlug.set(slug, (matchedBySlug.get(slug) ?? 0) + 1);
      }
    }

    // Build results for ALL input slugs (including 0-match ones)
    const allSlugs = new Set([...inputSlugs, ...totalBySlug.keys()]);
    const results: CompanyResult[] = Array.from(allSlugs).map((slug) => {
      const total = totalBySlug.get(slug) ?? 0;
      const matched = matchedBySlug.get(slug) ?? 0;
      return {
        slug,
        name: slugToName.get(slug) ?? slug,
        totalPosts: total,
        matchedPosts: matched,
        signal: matched > 0,
      };
    });

    // Sort: signal first, then by matched count desc, then alphabetically
    return results.sort((a, b) => {
      if (a.signal !== b.signal) return a.signal ? -1 : 1;
      if (a.matchedPosts !== b.matchedPosts) return b.matchedPosts - a.matchedPosts;
      return a.name.localeCompare(b.name);
    });
  }

  async function runCollectionAndCount() {
    let slugsToCollect = companySlugs;
    let slugToName = new Map<string, string>();

    if (dataSource === 'manual') {
      if (!companySlugs.length) {
        setError('Enter at least one company slug or LinkedIn URL');
        return;
      }
      // For manual mode, build slug-to-name map from the slugs themselves
      slugToName = new Map(companySlugs.map((s) => [s, s]));
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
    setCompanyResults([]);
    setStatus('collecting');

    try {
      const collectRes = await fetch('/api/collect-linkedin/company-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companySlugs: slugsToCollect,
          filterDays,
          maxArticles,
          headless,
        }),
      });
      const collectData = (await collectRes.json()) as CollectResponse;
      if (!collectRes.ok || collectData.error) {
        setError(collectData.error ?? `Collection failed (HTTP ${collectRes.status})`);
        setStatus('error');
        return;
      }

      const fetchedArticles = collectData.articles ?? [];
      setRunId(collectData.runId);
      setArticles(fetchedArticles);
      setStoredCount(collectData.stats?.stored ?? 0);
      setScrapedArticlesCount(fetchedArticles.length);
      setSourceCompanyCount(slugsToCollect.length);

      const keywordStats = countKeywordOccurrences(fetchedArticles, filterKeyword);
      setKeywordOccurrences(keywordStats.occurrences);
      setKeywordMatchedArticles(keywordStats.matchedArticles);

      setCompanyResults(buildCompanyResults(fetchedArticles, slugsToCollect, slugToName, filterKeyword));
      setStatus('done');
      fetchScanLog();
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
    setCompanyResults([]);
    setScoringStatus('idle');
    setScoringProgress(0);
    setScoringTotal(0);
    setScoringResult(null);
    setScoringError('');
  }

  const signalCount = companyResults.filter((r) => r.signal).length;

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
          <span style={{ fontWeight: 800, fontSize: 14, color: '#111827' }}>LinkedIn Company Posts Utility</span>
          <button
            onClick={resetForm}
            style={{ fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#374151', cursor: 'pointer' }}
          >
            Reset
          </button>
        </div>

        <div style={{ padding: 18 }}>
              <div style={{ marginBottom: 10, fontSize: 12.5, color: '#475569', lineHeight: 1.5 }}>
                Paste LinkedIn company URLs or slugs, scrape posts, and detect DJI Dock signals via keyword match (no LLM).
              </div>
              <details style={{ marginBottom: 12, fontSize: 11.5, color: '#6B7280', lineHeight: 1.6, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '0 12px' }}>
                <summary style={{ cursor: 'pointer', padding: '8px 0', fontWeight: 700, color: '#475569' }}>How to use</summary>
                <ul style={{ margin: '0 0 10px', paddingLeft: 18 }}>
                  <li>Paste <strong>3-5 company URLs</strong> per run to stay within LinkedIn rate limits.</li>
                  <li>For bulk campaigns (20+ companies), run from terminal: <code style={{ fontSize: 10, background: '#E2E8F0', padding: '1px 4px', borderRadius: 3 }}>node scripts/auto-scan-linkedin.mjs</code></li>
                  <li>Use pipe <code style={{ fontSize: 10, background: '#E2E8F0', padding: '1px 4px', borderRadius: 3 }}>|</code> for multiple keywords: <code style={{ fontSize: 10, background: '#E2E8F0', padding: '1px 4px', borderRadius: 3 }}>DJI Dock|Dock 3</code></li>
                  <li>After scanning, click <strong>AI Score and Push to Active Queue</strong> to send matched posts to the Step 3 scoring pipeline.</li>
                </ul>
              </details>
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
                <option value="manual">Manual Company Slugs / URLs</option>
                <option value="dji_resellers">DJI resellers</option>
              </select>

              {dataSource === 'manual' ? (
                <>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 6, color: '#6B7280' }}>
                    Company slugs or LinkedIn URLs (one per line)
                  </label>
                  <textarea
                    value={companyInput}
                    onChange={(e) => setCompanyInput(e.target.value)}
                    placeholder={'gresco-uas\nhttps://www.linkedin.com/company/heliguy\ndronenerds'}
                    style={{
                      width: '100%',
                      minHeight: 110,
                      boxSizing: 'border-box',
                      border: '1px solid #D1D5DB',
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 12.5,
                      marginBottom: 10,
                      fontFamily: 'monospace',
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

              <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
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
                <label style={{ fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!headless}
                    onChange={(e) => setHeadless(!e.target.checked)}
                    style={{ accentColor: '#2563EB' }}
                  />
                  Show browser
                </label>
              </div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 6, color: '#6B7280' }}>
                Keyword filter (pipe-separated)
              </label>
              <input
                type="text"
                value={filterKeyword}
                onChange={(e) => setFilterKeyword(e.target.value)}
                placeholder="DJI Dock"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  border: '1px solid #D1D5DB',
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 12.5,
                  marginBottom: 12,
                  fontFamily: 'monospace',
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
                {status === 'collecting' ? 'Collecting LinkedIn company posts...' : 'Collect + Count'}
              </button>

              {error && (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: 12.5, marginBottom: 12 }}>
                  {error}
                </div>
              )}

              {/* ── Summary Panel ── */}
              {status === 'done' && (
                <div style={{ padding: '12px 14px', borderRadius: 8, background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: 12.5, color: '#334155', marginBottom: 12 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', marginBottom: 8 }}>
                    <span><strong>Run ID:</strong> {runId}</span>
                    <span><strong>Companies:</strong> {sourceCompanyCount}</span>
                    <span><strong>Posts scraped:</strong> {scrapedArticlesCount}</span>
                    <span><strong>Stored:</strong> {storedCount}</span>
                  </div>
                  {filterKeyword.trim() && (
                    <div style={{ padding: '8px 10px', borderRadius: 6, background: signalCount > 0 ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${signalCount > 0 ? '#BBF7D0' : '#FECACA'}` }}>
                      <strong>Signal:</strong> {signalCount} of {sourceCompanyCount} companies mention keywords &middot;{' '}
                      <strong>{keywordMatchedArticles}</strong> matching posts &middot;{' '}
                      <strong>{keywordOccurrences}</strong> total occurrences
                    </div>
                  )}
                </div>
              )}

              {/* ── Per-Company Results Table ── */}
              {status === 'done' && companyResults.length > 0 && (
                <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, maxHeight: 320, overflowY: 'auto', marginBottom: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#F9FAFB', position: 'sticky', top: 0 }}>
                        <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #E5E7EB', color: '#6B7280' }}>Company</th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #E5E7EB', color: '#6B7280' }}>LinkedIn</th>
                        <th style={{ textAlign: 'center', padding: '8px 10px', borderBottom: '1px solid #E5E7EB', color: '#6B7280' }}>Posts</th>
                        {filterKeyword.trim() && (
                          <>
                            <th style={{ textAlign: 'center', padding: '8px 10px', borderBottom: '1px solid #E5E7EB', color: '#6B7280' }}>Matched</th>
                            <th style={{ textAlign: 'center', padding: '8px 10px', borderBottom: '1px solid #E5E7EB', color: '#6B7280' }}>Signal</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {companyResults.map((row, i) => (
                        <tr key={`${row.slug}-${i}`} style={{ background: i % 2 ? '#F9FAFB' : '#fff' }}>
                          <td style={{ padding: '8px 10px', borderBottom: '1px solid #EEF2FF', fontWeight: 500 }}>{row.name}</td>
                          <td style={{ padding: '8px 10px', borderBottom: '1px solid #EEF2FF' }}>
                            <a
                              href={`https://www.linkedin.com/company/${row.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#0369A1', textDecoration: 'none', fontSize: 11 }}
                            >
                              {row.slug}
                            </a>
                          </td>
                          <td style={{ padding: '8px 10px', borderBottom: '1px solid #EEF2FF', textAlign: 'center' }}>{row.totalPosts}</td>
                          {filterKeyword.trim() && (
                            <>
                              <td style={{ padding: '8px 10px', borderBottom: '1px solid #EEF2FF', textAlign: 'center', fontWeight: row.matchedPosts > 0 ? 700 : 400 }}>
                                {row.matchedPosts}
                              </td>
                              <td style={{ padding: '8px 10px', borderBottom: '1px solid #EEF2FF', textAlign: 'center' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  background: row.signal ? '#DCFCE7' : '#FEE2E2',
                                  color: row.signal ? '#166534' : '#991B1B',
                                }}>
                                  {row.signal ? 'YES' : 'NO'}
                                </span>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── AI Score Button ── */}
              {status === 'done' && (
                <div style={{ marginBottom: 12 }}>
                  <button
                    onClick={runAiScoring}
                    disabled={visibleArticles.length === 0 || scoringStatus === 'scoring'}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: visibleArticles.length === 0
                        ? '#E5E7EB'
                        : scoringStatus === 'scoring'
                          ? '#93C5FD'
                          : '#7C3AED',
                      color: visibleArticles.length === 0 ? '#9CA3AF' : '#fff',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: visibleArticles.length === 0 ? 'not-allowed' : scoringStatus === 'scoring' ? 'wait' : 'pointer',
                    }}
                  >
                    {scoringStatus === 'scoring'
                      ? `Scoring ${scoringProgress} of ${scoringTotal} articles...`
                      : `AI Score and Push to Active Queue (${visibleArticles.length} matched posts)`}
                  </button>

                  {scoringStatus === 'done' && scoringResult && (
                    <div style={{ marginTop: 8, padding: '10px 14px', borderRadius: 8, background: '#F0FDF4', border: '1px solid #BBF7D0', fontSize: 12.5 }}>
                      <div style={{ fontWeight: 700, color: '#166534', marginBottom: 4 }}>
                        AI Scoring Complete
                      </div>
                      <div style={{ color: '#334155', lineHeight: 1.6 }}>
                        <strong>{scoringResult.scored}</strong> articles scored &middot;{' '}
                        <strong style={{ color: '#166534' }}>{scoringResult.queued}</strong> pushed to active queue
                        {scoringResult.alreadyQueued > 0 && (
                          <> &middot; <strong>{scoringResult.alreadyQueued}</strong> already in queue</>
                        )}
                      </div>
                      <a
                        href="/"
                        style={{ display: 'inline-block', marginTop: 6, fontSize: 12, fontWeight: 700, color: '#7C3AED', textDecoration: 'none' }}
                      >
                        Go to Step 3 Queue to review &rarr;
                      </a>
                    </div>
                  )}

                  {scoringStatus === 'error' && scoringError && (
                    <div style={{ marginTop: 8, padding: '10px 14px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 12.5, color: '#991B1B' }}>
                      {scoringError}
                    </div>
                  )}
                </div>
              )}

              {/* ── Matched Articles Preview ── */}
              {visibleArticles.length > 0 && (
                <>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: '#6B7280', marginBottom: 6 }}>
                    {filterKeyword.trim() ? `Matched posts (${visibleArticles.length})` : `All posts (${visibleArticles.length})`}
                  </div>
                  <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, maxHeight: 260, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#F9FAFB', position: 'sticky', top: 0 }}>
                          {['Company', 'Post Preview', 'Link'].map((col) => (
                            <th key={col} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #E5E7EB', color: '#6B7280' }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleArticles.slice(0, 50).map((a, i) => (
                          <tr key={`${a.id}-${i}`} style={{ background: i % 2 ? '#F9FAFB' : '#fff' }}>
                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #EEF2FF', maxWidth: 140, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {a.publisher ?? 'LinkedIn'}
                            </td>
                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #EEF2FF', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {a.title}
                            </td>
                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #EEF2FF' }}>
                              <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: '#0369A1', textDecoration: 'none' }}>
                                Open
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {filterKeyword.trim() && articles.length > 0 && visibleArticles.length === 0 && (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: 12.5, color: '#334155' }}>
                  No scraped articles contain keyword &quot;{filterKeyword}&quot;.
                </div>
              )}
        </div>
      </div>

      {/* ── Scan History ── */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', boxShadow: '0 10px 24px rgba(0,0,0,0.06)', marginTop: 16 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 800, fontSize: 14, color: '#111827' }}>
            Scan History ({scanLog.length} scans, {new Set(scanLog.map((e) => e.slug)).size} unique companies)
          </span>
          <button
            onClick={fetchScanLog}
            disabled={scanLogLoading}
            style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#374151', cursor: 'pointer' }}
          >
            {scanLogLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <div style={{ padding: '12px 18px' }}>
          <input
            type="text"
            value={scanLogSearch}
            onChange={(e) => setScanLogSearch(e.target.value)}
            placeholder="Search by company slug or run ID..."
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #D1D5DB', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, marginBottom: 10 }}
          />
          {filteredScanLog.length > 0 ? (
            <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, maxHeight: 400, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', position: 'sticky', top: 0, zIndex: 1 }}>
                    {([
                      ['#', '', 'center', 36],
                      ['Batch', 'batch', 'left', 55],
                      ['Company', 'slug', 'left', undefined],
                      ['Posts', 'posts_scraped', 'center', 50],
                      ['DJI', 'dji_count', 'center', 40],
                      ['DJI Dock', 'dock_matches', 'center', 62],
                      ['Dock', 'dock_count', 'center', 42],
                      ['DIaB', 'diab_count', 'center', 42],
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
                  {filteredScanLog.map((entry, i) => {
                    const hasSignal = (entry.dock_matches ?? 0) > 0;
                    const bb = entry.batch === 'FP';
                    return (
                      <tr key={entry.id} style={{ background: hasSignal ? '#F0FDF4' : i % 2 ? '#F9FAFB' : '#fff' }}>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #EEF2FF', textAlign: 'center', fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #EEF2FF' }}>
                          <span style={{ display: 'inline-block', padding: '2px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700, background: bb ? '#EDE9FE' : '#F0F9FF', color: bb ? '#6D28D9' : '#0369A1' }}>
                            {entry.batch || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #EEF2FF', fontWeight: 500 }}>
                          <a href={`https://www.linkedin.com/company/${entry.slug}/posts/`} target="_blank" rel="noopener noreferrer" style={{ color: '#0369A1', textDecoration: 'none', fontSize: 11.5 }}>{entry.slug}</a>
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #EEF2FF', textAlign: 'center', color: entry.posts_scraped === 0 ? '#D1D5DB' : '#111827', fontWeight: 600 }}>{entry.posts_scraped}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #EEF2FF', textAlign: 'center', color: (entry.dji_count ?? 0) > 0 ? '#1D4ED8' : '#D1D5DB', fontWeight: 600 }}>{entry.dji_count ?? 0}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #EEF2FF', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 700, background: hasSignal ? '#DCFCE7' : '#F3F4F6', color: hasSignal ? '#166534' : '#D1D5DB' }}>
                            {entry.dock_matches ?? 0}
                          </span>
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #EEF2FF', textAlign: 'center', color: (entry.dock_count ?? 0) > 0 ? '#0891B2' : '#D1D5DB', fontWeight: 600 }}>{entry.dock_count ?? 0}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #EEF2FF', textAlign: 'center', color: (entry.diab_count ?? 0) > 0 ? '#7C3AED' : '#D1D5DB', fontWeight: 600 }}>{entry.diab_count ?? 0}</td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #EEF2FF', fontSize: 10, color: '#9CA3AF' }}>{new Date(entry.scanned_at).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: 12.5, color: '#6B7280' }}>
              {scanLog.length === 0 ? 'No scans recorded yet. Run a scan above to start logging.' : 'No results match your search.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
