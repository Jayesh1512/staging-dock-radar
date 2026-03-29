"use client";

import React, { useMemo, useRef, useState } from 'react';
import { Navbar } from '@/components/shared/Navbar';

/** Minimal CSV → row objects (comma-separated, quoted fields). */
function parseCsvToRows(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
      } else if (c === ',' && !q) {
        out.push(cur);
        cur = '';
      } else cur += c;
    }
    out.push(cur);
    return out;
  };

  const header = parseLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = parseLine(lines[r]);
    const row: Record<string, string> = {};
    header.forEach((h, i) => {
      row[h] = (cells[i] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

function formatFileSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Headers from first row; warns if expected columns for the API are missing. */
function csvColumnHints(headers: string[]): { ok: boolean; warnings: string[] } {
  const norm = headers.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const warnings: string[] = [];
  const hasCompany = norm.some((h) =>
    ['company_name', 'company', 'name', 'organisation', 'organization'].includes(h),
  );
  const hasCountry = norm.some((h) => ['country_code', 'country'].includes(h));
  if (!hasCompany) warnings.push('Add a company column (e.g. company_name or name).');
  if (!hasCountry) warnings.push('Add a country column (country_code or country, ISO-2).');
  return { ok: warnings.length === 0, warnings };
}

type ScanRow = {
  registry_id: string;
  company_name: string;
  country_code: string;
  website_before: string | null;
  linkedin_before: string | null;
  website_after: string | null;
  linkedin_after: string | null;
  website_source?: 'csv' | 'serper' | 'apollo';
  linkedin_source?:
    | 'csv'
    | 'serper'
    | 'apollo'
    | 'apollo_org_enrich'
    | 'website_scan';
  dji_dock_hit: boolean;
  stored_to_discovered_company: boolean;
  serper_top_link: string | null;
  qa_internet: {
    domain: string;
    dock_found: boolean;
    total_hits: number;
    keywords_matched: string[];
    dock_models_line: string | null;
    error: string | null;
  } | null;
  stored_to_multi_sources: boolean;
  multi_sources_error?: string | null;
  error?: string;
  analysis: {
    topResult: { title: string; link: string; snippet: string; position: number } | null;
    crawledTop: { ok: boolean; url: string; charCount: number; timeMs: number } | null;
    crawledRoot: { ok: boolean; url: string; charCount: number; timeMs: number } | null;
    djiDockRegex: {
      top: { hit: boolean; count: number; match: string | null; snippet: string | null };
      root: { hit: boolean; count: number; match: string | null; snippet: string | null };
      anyHit: boolean;
    };
    linkedin: { found: string | null; source: 'top' | 'root' | null };
    websiteCandidate: string | null;
  } | null;
};

type ApiResult = {
  source?: 'registry' | 'csv';
  total_scanned: number;
  scan_limit?: number;
  truncated_by_limit?: boolean;
  csv_rows_raw?: number;
  csv_rows_valid?: number;
  delay_ms?: number;
  hit_count: number;
  stored_count: number;
  linkedin_found_count: number;
  qa_filter_applied?: boolean;
  qa_internet_dock_found?: number;
  multi_sources_stored?: number;
  options?: {
    enrich: boolean;
    run_qa_internet: boolean;
    persist_discovered: boolean;
    import_batch: string;
    /** Server merges Apollo domain/LinkedIn when APOLLO_API_KEY is set (after Serper crawl). */
    apollo_merge?: boolean;
  };
  results: ScanRow[];
};

export default function DjiDockHunterPage() {
  const [scanLimit, setScanLimit] = useState(50);
  const [delayMs, setDelayMs] = useState(200);
  const [hitsOnly, setHitsOnly] = useState(false);
  const [enrich, setEnrich] = useState(true);
  const [runQaInternet, setRunQaInternet] = useState(true);
  const [persistDiscovered, setPersistDiscovered] = useState(true);
  const [csvRows, setCsvRows] = useState<Record<string, string>[] | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvFileSizeBytes, setCsvFileSizeBytes] = useState<number | null>(null);
  const [csvDragActive, setCsvDragActive] = useState(false);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResult | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const csvHeaders = useMemo(() => {
    if (!csvRows?.length) return [];
    return Object.keys(csvRows[0]);
  }, [csvRows]);

  const csvHints = useMemo(() => csvColumnHints(csvHeaders), [csvHeaders]);

  function ingestCsvText(text: string, name: string, sizeBytes: number | null) {
    const rows = parseCsvToRows(text);
    setCsvFileName(name);
    setCsvFileSizeBytes(sizeBytes);
    setCsvRows(rows.length ? rows : null);
    if (!rows.length) {
      setError('That file has no data rows. Use a header row plus at least one data row.');
    } else {
      setError(null);
      setHitsOnly(false);
    }
  }

  function clearCsvUpload() {
    setCsvRows(null);
    setCsvFileName(null);
    setCsvFileSizeBytes(null);
    setError(null);
    if (csvFileInputRef.current) csvFileInputRef.current.value = '';
  }

  function onCsvFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      clearCsvUpload();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      ingestCsvText(text, file.name, file.size);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function onCsvDrop(e: React.DragEvent) {
    e.preventDefault();
    setCsvDragActive(false);
    if (loading) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.csv') && file.type !== 'text/csv' && file.type !== 'application/vnd.ms-excel') {
      setError('Please drop a .csv file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      ingestCsvText(text, file.name, file.size);
    };
    reader.readAsText(file);
  }

  async function runHunter() {
    setLoading(true);
    setError(null);
    setData(null);
    setExpandedId(null);
    try {
      if (!csvRows?.length) throw new Error('Upload a CSV with header + rows (company name + country columns).');
      const res = await fetch('/api/dji/dock-hunter/scan-registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv_rows: csvRows,
          limit: scanLimit,
          delay_ms: delayMs > 0 ? delayMs : 0,
          enrich,
          run_qa_internet: runQaInternet,
          persist_discovered: persistDiscovered,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setData(json as ApiResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const displayRows = useMemo(() => {
    if (!data) return [];
    return hitsOnly ? data.results.filter((r) => r.dji_dock_hit) : data.results;
  }, [data, hitsOnly]);

  const postRunStats = useMemo(() => {
    if (!data?.results?.length) {
      return { websiteAfter: 0, linkedinAfter: 0, hiddenByHitsOnly: 0 };
    }
    const r = data.results;
    const websiteAfter = r.filter((x) => Boolean(x.website_after)).length;
    const linkedinAfter = r.filter((x) => Boolean(x.linkedin_after)).length;
    const hiddenByHitsOnly = hitsOnly ? r.filter((x) => !x.dji_dock_hit).length : 0;
    return { websiteAfter, linkedinAfter, hiddenByHitsOnly };
  }, [data, hitsOnly]);

  return (
    <div className="min-h-screen" style={{ background: '#F3F4F6' }}>
      <Navbar />
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 32px 64px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px', color: '#111827' }}>DJI DOCK HUNTER</h1>
        <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 16px', maxWidth: 820 }}>
          Upload a CSV of companies. (1) <strong>Enrich</strong>: Serper + site crawl; if <code style={{ fontSize: 11 }}>APOLLO_API_KEY</code> is set, Apollo refines website/LinkedIn (same idea as the CSV company pipeline). Optional columns in CSV override Apollo/Serper.
          (2) <strong>Internet QA</strong>: <code style={{ fontSize: 11 }}>site:domain &quot;DJI Dock&quot;</code> plus optional LinkedIn search →{' '}
          <code style={{ fontSize: 12 }}>multi_sources_companies_import</code>.
          (3) Optional: regex DJI Dock hits → <code style={{ fontSize: 12 }}>discovered_companies</code>. Country is taken from each row (ISO-2).{' '}
          <strong>Hits only</strong> filters the results table to rows where the company&apos;s crawled site matched the DJI Dock regex — it does not mean &quot;only show enriched rows&quot;; turn it off to see website/LinkedIn for every row.
        </p>

        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 4 }}>CSV file</div>
                  <p style={{ fontSize: 12, color: '#6B7280', margin: 0, maxWidth: 640, lineHeight: 1.45 }}>
                    Required columns: <strong>company</strong> (e.g. <code style={sCodeInline}>company_name</code>) and{' '}
                    <strong>country</strong> (<code style={sCodeInline}>country_code</code> or <code style={sCodeInline}>country</code>, ISO-2).
                    Optional: <code style={sCodeInline}>website</code>, <code style={sCodeInline}>linkedin</code>.
                  </p>
                </div>
                {csvRows?.length ? (
                  <button
                    type="button"
                    onClick={clearCsvUpload}
                    disabled={loading}
                    style={sBtnGhost}
                  >
                    Remove file
                  </button>
                ) : null}
              </div>

              <input
                ref={csvFileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={onCsvFileChange}
                disabled={loading}
                style={{ display: 'none' }}
                aria-hidden
              />

              <div
                role="button"
                tabIndex={0}
                aria-label="Upload or drop a CSV file"
                onClick={() => !loading && csvFileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    csvFileInputRef.current?.click();
                  }
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!loading) setCsvDragActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setCsvDragActive(false);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={onCsvDrop}
                style={{
                  ...sDropZone,
                  ...(csvDragActive ? sDropZoneDrag : {}),
                  ...(csvRows?.length ? sDropZoneReady : {}),
                  ...(loading ? { opacity: 0.65, pointerEvents: 'none' as const } : {}),
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div
                    style={{
                      ...sDropIconWrap,
                      width: 52,
                      height: 52,
                      borderRadius: 12,
                      background: csvRows?.length ? '#D1FAE5' : '#F3F4F6',
                      color: csvRows?.length ? '#047857' : '#6B7280',
                      fontSize: 13,
                      fontWeight: 800,
                      letterSpacing: 0.5,
                    }}
                    aria-hidden
                  >
                    CSV
                  </div>
                  <div style={{ flex: '1 1 220px' }}>
                    {csvRows?.length && csvFileName ? (
                      <>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', wordBreak: 'break-word' }}>{csvFileName}</div>
                        <div style={{ fontSize: 12, color: '#059669', marginTop: 4, fontWeight: 600 }}>
                          {csvRows.length} data row{csvRows.length === 1 ? '' : 's'}
                          {csvFileSizeBytes != null ? ` · ${formatFileSize(csvFileSizeBytes)}` : ''}
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>
                          {csvDragActive ? 'Drop the file here' : 'Drag & drop a CSV here'}
                        </div>
                        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                          or <span style={{ color: '#2563EB', fontWeight: 600 }}>click to browse</span> · comma-separated, quoted fields supported
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {csvHeaders.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 6, letterSpacing: 0.3 }}>Detected columns</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {csvHeaders.map((h) => (
                      <span key={h} style={sColChip}>{h}</span>
                    ))}
                  </div>
                  {!csvHints.ok && (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 10px' }}>
                      <strong>Heads up:</strong> {csvHints.warnings.join(' ')} Rows may be skipped server-side.
                    </div>
                  )}
                </div>
              )}
            </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', paddingTop: 16, borderTop: '1px solid #E5E7EB' }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#6B7280', marginBottom: 4 }}>Max rows</label>
              <input
                type="number"
                min={1}
                max={500}
                value={scanLimit}
                onChange={(e) => setScanLimit(Math.min(500, Math.max(1, Number(e.target.value) || 50)))}
                disabled={loading}
                style={{ ...sInput, width: 88 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#6B7280', marginBottom: 4 }}>Delay (ms)</label>
              <input
                type="number"
                min={0}
                max={10000}
                step={50}
                value={delayMs}
                onChange={(e) => setDelayMs(Math.min(10000, Math.max(0, Number(e.target.value) || 0)))}
                disabled={loading}
                style={{ ...sInput, width: 88 }}
                title="Pause between companies to reduce Serper rate limits"
              />
            </div>
            <label
              title="When checked, the table lists only rows where the crawled homepage matched “DJI Dock” (regex). Uncheck to see all rows, including enrichment without that regex hit."
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', cursor: 'pointer', userSelect: 'none', marginBottom: 2 }}
            >
              <input type="checkbox" checked={hitsOnly} onChange={(e) => setHitsOnly(e.target.checked)} disabled={loading} />
              Hits only (regex crawl)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151', cursor: 'pointer', userSelect: 'none', marginBottom: 2 }}>
              <input type="checkbox" checked={enrich} onChange={(e) => setEnrich(e.target.checked)} disabled={loading} />
              Enrich (Serper + site)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151', cursor: 'pointer', userSelect: 'none', marginBottom: 2 }}>
              <input type="checkbox" checked={runQaInternet} onChange={(e) => setRunQaInternet(e.target.checked)} disabled={loading} />
              Internet QA → multi_sources
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151', cursor: 'pointer', userSelect: 'none', marginBottom: 2 }}>
              <input type="checkbox" checked={persistDiscovered} onChange={(e) => setPersistDiscovered(e.target.checked)} disabled={loading} />
              Store regex hits → discovered
            </label>
            <button
              onClick={runHunter}
              disabled={loading || !csvRows?.length}
              style={{
                ...sRunBtn,
                ...(loading || !csvRows?.length ? { opacity: 0.55, cursor: 'not-allowed' } : {}),
              }}
            >
              {loading ? 'Running…' : 'Run Hunter'}
            </button>
          </div>
        </div>

        {error && <div style={sError}>{error}</div>}

        {data && (
          <>
            {data.truncated_by_limit && (
              <div style={{ ...sError, background: '#EFF6FF', borderColor: '#BFDBFE', color: '#1E40AF' }}>
                Processing capped at {data.scan_limit ?? scanLimit} rows; CSV had {data.csv_rows_valid ?? '—'} valid row(s) ({data.csv_rows_raw ?? '—'} raw lines). Increase Max rows to process more.
              </div>
            )}
            {hitsOnly && postRunStats.hiddenByHitsOnly > 0 && (
              <div style={{ ...sError, background: '#FFFBEB', borderColor: '#FDE68A', color: '#92400E', marginBottom: 12 }}>
                {postRunStats.hiddenByHitsOnly} row{postRunStats.hiddenByHitsOnly === 1 ? '' : 's'} hidden: <strong>Hits only (regex crawl)</strong> is on and no row matched DJI Dock on the crawled site. Uncheck it to see every row — including website and LinkedIn from enrich when Serper/crawl found them.
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <Kpi label="Scanned" value={data.total_scanned} />
              <Kpi label="Website URL (after enrich)" value={postRunStats.websiteAfter} />
              <Kpi label="LinkedIn URL (after enrich)" value={postRunStats.linkedinAfter} />
              <Kpi label="Regex DJI Dock (crawl)" value={data.hit_count} />
              <Kpi label="→ discovered_companies" value={data.stored_count} />
              <Kpi label="Internet QA: DJI Dock found" value={data.qa_internet_dock_found ?? 0} />
              <Kpi label="→ multi_sources_companies_import" value={data.multi_sources_stored ?? 0} />
            </div>
            {data.options && (
              <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 10 }}>
                Batch: <code>{data.options.import_batch}</code>
                {' · '}
                enrich={String(data.options.enrich)} · qa_internet={String(data.options.run_qa_internet)} · persist_discovered={String(data.options.persist_discovered)}
                {' · '}
                apollo_merge={String(data.options.apollo_merge ?? false)}
              </div>
            )}

            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                    <th style={sTh}></th>
                    <th style={sTh}>Company</th>
                    <th style={sTh}>Country</th>
                    <th style={sTh}>Added to DB</th>
                    <th style={sTh}>Regex crawl</th>
                    <th style={sTh}>discovered</th>
                    <th style={sTh}>QA web</th>
                    <th style={sTh}>multi_src</th>
                    <th style={sTh}>Website</th>
                    <th style={sTh}>LinkedIn</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ ...sTd, color: '#6B7280', fontStyle: 'italic' }}>
                        {hitsOnly && (data.results?.length ?? 0) > 0 ? (
                          <>
                            Table is filtered: {data.results.length} row{data.results.length === 1 ? '' : 's'} ran but none had a regex DJI Dock hit on crawl.{' '}
                            <strong>Uncheck &quot;Hits only (regex crawl)&quot;</strong> above to list all rows (website/LinkedIn columns show enrich results).
                          </>
                        ) : (
                          'No rows in this batch.'
                        )}
                      </td>
                    </tr>
                  ) : displayRows.map((row) => {
                    const addedToDb = row.stored_to_discovered_company || row.stored_to_multi_sources;
                    return (
                    <React.Fragment key={row.registry_id}>
                      <tr
                        onClick={() => setExpandedId((id) => (id === row.registry_id ? null : row.registry_id))}
                        style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }}
                      >
                        <td style={sTd}>{expandedId === row.registry_id ? '▼' : '▶'}</td>
                        <td style={sTd}>{row.company_name}</td>
                        <td style={sTd}>{row.country_code}</td>
                        <td style={sTd}>{addedToDb ? 'Yes' : 'No'}</td>
                        <td style={sTd}>{row.dji_dock_hit ? 'Yes' : 'No'}</td>
                        <td style={sTd}>{row.stored_to_discovered_company ? 'Yes' : 'No'}</td>
                        <td style={sTd}>{row.qa_internet?.dock_found ? 'Yes' : (row.qa_internet ? 'No' : '—')}</td>
                        <td style={sTd}>{row.stored_to_multi_sources ? 'Yes' : (row.multi_sources_error ? 'Err' : '—')}</td>
                        <td style={sTd}>
                          {row.website_after ? (
                            <a href={row.website_after} target="_blank" rel="noreferrer" style={sLink}>
                              Website ↗
                              {row.website_source ? ` (${row.website_source})` : ''}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td style={sTd}>
                          {row.linkedin_after ? (
                            <a href={row.linkedin_after} target="_blank" rel="noreferrer" style={sLink}>
                              LinkedIn ↗
                              {row.linkedin_source ? ` (${row.linkedin_source})` : ''}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                      {expandedId === row.registry_id && (
                        <tr>
                          <td colSpan={10} style={{ background: '#FAFAFA', padding: '12px 16px', borderBottom: '1px solid #E5E7EB' }}>
                            {row.error ? (
                              <div style={{ color: '#991B1B', fontSize: 12 }}>Error: {row.error}</div>
                            ) : (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                {row.analysis && (
                                  <>
                                    <div>
                                      <div style={sDetailTitle}>Serper + Crawls</div>
                                      <div style={sDetailLine}><strong>Top result:</strong> {row.analysis.topResult?.title ?? '—'}</div>
                                      <div style={sDetailLine}><strong>Top URL:</strong> {row.analysis.crawledTop?.url ?? '—'}</div>
                                      <div style={sDetailLine}><strong>Root URL:</strong> {row.analysis.crawledRoot?.url ?? '—'}</div>
                                      <div style={sDetailLine}><strong>Website candidate:</strong> {row.analysis.websiteCandidate ?? '—'}</div>
                                      <div style={sDetailLine}><strong>Final Website:</strong> {row.website_after ? (
                                        <a href={row.website_after} target="_blank" rel="noreferrer" style={sLink}>
                                          {row.website_after}
                                        </a>
                                      ) : '—'} {row.website_source ? <span style={{ color: '#6B7280', fontSize: 11 }}>({row.website_source})</span> : null}</div>
                                    </div>
                                    <div>
                                      <div style={sDetailTitle}>Regex DJI Dock + LinkedIn (enrich)</div>
                                      <div style={sDetailLine}>
                                        <strong>Top matches:</strong> {row.analysis.djiDockRegex.top.count} ({row.analysis.djiDockRegex.top.hit ? 'hit' : 'no'})
                                      </div>
                                      <div style={sDetailLine}>
                                        <strong>Root matches:</strong> {row.analysis.djiDockRegex.root.count} ({row.analysis.djiDockRegex.root.hit ? 'hit' : 'no'})
                                      </div>
                                      <div style={sDetailLine}>
                                        <strong>LinkedIn found:</strong> {row.analysis.linkedin.found
                                          ? <a href={row.analysis.linkedin.found} target="_blank" rel="noreferrer" style={sLink}>{row.analysis.linkedin.found}</a>
                                          : '—'}
                                      </div>
                                      <div style={sDetailLine}><strong>LinkedIn source:</strong> {row.analysis.linkedin.source ?? '—'}</div>
                                      <div style={sDetailLine}><strong>Final LinkedIn:</strong> {row.linkedin_after ? (
                                        <a href={row.linkedin_after} target="_blank" rel="noreferrer" style={sLink}>
                                          {row.linkedin_after}
                                        </a>
                                      ) : '—'} {row.linkedin_source ? <span style={{ color: '#6B7280', fontSize: 11 }}>({row.linkedin_source})</span> : null}</div>
                                    </div>
                                    <div style={{ gridColumn: '1 / span 2' }}>
                                      <div style={sDetailTitle}>Snippet</div>
                                      <pre style={sPre}>
                                        {row.analysis.djiDockRegex.top.snippet
                                          ?? row.analysis.djiDockRegex.root.snippet
                                          ?? 'No snippet available.'}
                                      </pre>
                                    </div>
                                  </>
                                )}
                                {row.qa_internet && (
                                  <div style={{ gridColumn: '1 / span 2' }}>
                                    <div style={sDetailTitle}>Internet QA → multi_sources</div>
                                    <div style={sDetailLine}><strong>Domain:</strong> {row.qa_internet.domain || '—'}</div>
                                    <div style={sDetailLine}><strong>Indexed hits (web + LI):</strong> {row.qa_internet.total_hits}</div>
                                    <div style={sDetailLine}><strong>Keywords:</strong> {row.qa_internet.keywords_matched?.join(', ') || '—'}</div>
                                    <div style={sDetailLine}><strong>Models line:</strong> {row.qa_internet.dock_models_line ?? '—'}</div>
                                    {row.qa_internet.error && (
                                      <div style={{ color: '#92400E', fontSize: 12 }}>QA note: {row.qa_internet.error}</div>
                                    )}
                                  </div>
                                )}
                                {row.multi_sources_error && (
                                  <div style={{ gridColumn: '1 / span 2', color: '#991B1B', fontSize: 12 }}>
                                    multi_sources_companies_import: {row.multi_sources_error}
                                  </div>
                                )}
                                {!row.analysis && !row.qa_internet && !row.multi_sources_error && (
                                  <div style={{ fontSize: 12, color: '#6B7280' }}>No enrich or QA payload.</div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 14px', minWidth: 180 }}>
      <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#111827', marginTop: 2 }}>{value}</div>
    </div>
  );
}

const sInput: React.CSSProperties = {
  padding: '7px 10px',
  border: '1px solid #D1D5DB',
  borderRadius: 8,
  fontSize: 13,
  minWidth: 130,
  background: '#fff',
};

const sRunBtn: React.CSSProperties = {
  padding: '8px 16px',
  border: 'none',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
  color: '#fff',
  background: '#2563EB',
  cursor: 'pointer',
  height: 36,
};

const sError: React.CSSProperties = {
  background: '#FEF2F2',
  border: '1px solid #FECACA',
  color: '#991B1B',
  borderRadius: 10,
  padding: '10px 12px',
  marginBottom: 12,
  fontSize: 13,
};

const sTh: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 11,
  fontWeight: 700,
  color: '#6B7280',
  letterSpacing: 0.3,
};

const sTd: React.CSSProperties = {
  padding: '10px 12px',
  color: '#374151',
  fontSize: 13,
};

const sLink: React.CSSProperties = {
  color: '#2563EB',
  textDecoration: 'none',
  fontWeight: 600,
};

const sDetailTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: '#111827',
  marginBottom: 8,
};

const sDetailLine: React.CSSProperties = {
  fontSize: 12,
  color: '#374151',
  marginBottom: 6,
};

const sPre: React.CSSProperties = {
  margin: 0,
  background: '#fff',
  border: '1px solid #E5E7EB',
  borderRadius: 8,
  padding: 10,
  fontSize: 11,
  color: '#374151',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 220,
  overflow: 'auto',
};

const sCodeInline: React.CSSProperties = {
  fontSize: 11,
  background: '#F3F4F6',
  padding: '1px 5px',
  borderRadius: 4,
  color: '#1F2937',
};

const sDropZone: React.CSSProperties = {
  border: '2px dashed #D1D5DB',
  borderRadius: 12,
  padding: '20px 18px',
  background: '#FAFAFA',
  cursor: 'pointer',
  transition: 'border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease',
  outline: 'none',
};

const sDropZoneDrag: React.CSSProperties = {
  borderColor: '#3B82F6',
  background: '#EFF6FF',
  boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.15)',
};

const sDropZoneReady: React.CSSProperties = {
  borderColor: '#34D399',
  borderStyle: 'solid',
  background: '#F0FDF4',
  cursor: 'pointer',
};

const sDropIconWrap: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const sColChip: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  padding: '4px 8px',
  background: '#F3F4F6',
  border: '1px solid #E5E7EB',
  borderRadius: 6,
  color: '#374151',
};

const sBtnGhost: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  color: '#6B7280',
  background: '#fff',
  border: '1px solid #D1D5DB',
  borderRadius: 8,
  cursor: 'pointer',
};
