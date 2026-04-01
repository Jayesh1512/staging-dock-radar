'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';

/* ─── Types (matches /api/partners/multi-source response) ─── */

interface VerificationEntry {
  method: string;
  hits: number;
  url: string | null;
  relevance: string;
  at: string;
  keywords_matched: string[];
  post_date: string | null;
  note: string | null;
}

interface MultiSourceCompany {
  rank: number;
  normalized_name: string;
  display_name: string;
  website: string | null;
  linkedin: string | null;
  country_code: string;
  source_count: number;
  source_types: string[];
  dock_verified: boolean | null;
  dock_models: string | null;
  role: string | null;
  evidence_urls: string[];
  evidence_count: number;
  verifications: VerificationEntry[];
  matches_priority: boolean;
  import_batch: string | null;
  source_refs: Record<string, unknown> | null;
  is_fb_partner: boolean;
}

interface ApiResponse {
  country: string;
  filter: 'verified' | 'all';
  total: number;
  stats: {
    verified: number;
    not_verified: number;
    unchecked: number;
    multi_source: number;
    with_evidence: number;
    with_website: number;
    with_linkedin: number;
    priority_matches: number;
  };
  source_breakdown: Record<string, number>;
  companies: MultiSourceCompany[];
}

/* ─── Source badge config ─── */

const SOURCE_TYPES = [
  { key: 'dji_dealer',           label: 'DJI',    fullLabel: 'DJI Dealer',        bg: '#FEE2E2', color: '#991B1B' },
  { key: 'fr_sirene',            label: 'Reg',    fullLabel: 'SIRENE (FR)',        bg: '#DBEAFE', color: '#1E40AF' },
  { key: 'nl_aviation_registry', label: 'Reg',    fullLabel: 'Aviation Reg (NL)',  bg: '#DBEAFE', color: '#1E40AF' },
  { key: 'comet',                label: 'Comet',  fullLabel: 'Comet',             bg: '#F3E8FF', color: '#6B21A8' },
  { key: 'google_search',        label: 'Google', fullLabel: 'Google Search',     bg: '#E0E7FF', color: '#3730A3' },
  { key: 'chatgpt',              label: 'GPT',    fullLabel: 'ChatGPT',           bg: '#FCE7F3', color: '#9D174D' },
  { key: 'claude',               label: 'Claude', fullLabel: 'Claude',            bg: '#ECFDF5', color: '#065F46' },
];

const SOURCE_BADGE_MAP: Record<string, (typeof SOURCE_TYPES)[0]> = {};
for (const s of SOURCE_TYPES) SOURCE_BADGE_MAP[s.key] = s;

const SOURCE_BORDER_COLORS: Record<string, string> = {
  dji_dealer: '#991B1B',
  fr_sirene: '#1E40AF',
  nl_aviation_registry: '#1E40AF',
  comet: '#6B21A8',
  google_search: '#3730A3',
  chatgpt: '#9D174D',
  claude: '#065F46',
};

/**
 * Shorten dock models for table display:
 * "DJI Dock 1, DJI Dock 2, DJI Dock 3" → "Dock 1, 2, 3"
 * "DJI Dock 2, DJI Dock 3" → "Dock 2, 3"
 * "DJI Dock" → "Dock"
 * "DJI Dock, DJI Dock 2, Dock 3" → "Dock 1, 2, 3"
 */
function shortenDockModels(raw: string): string {
  // Extract model numbers present
  const nums = new Set<string>();
  if (/dock\s*3/i.test(raw)) nums.add('3');
  if (/dock\s*2/i.test(raw)) nums.add('2');
  if (/dock\s*1/i.test(raw)) nums.add('1');
  // "DJI Dock" without a number = generic (Dock 1 era)
  if (/dji\s+dock(?!\s*[123])/i.test(raw) && !nums.has('1')) nums.add('1');

  if (nums.size === 0) return 'Dock';
  const sorted = Array.from(nums).sort();
  return 'Dock ' + sorted.join(', ');
}

const COUNTRIES = [
  { code: 'FR', label: 'France' },
  { code: 'NL', label: 'Netherlands' },
];

const PAGE_SIZE = 50;

/* ─── Component ─── */

export default function MultiSourceIntelligenceV2() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeCountries, setActiveCountries] = useState<Set<string>>(new Set(['FR']));
  const [includeUnverified, setIncludeUnverified] = useState(false);
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set());
  const [fbPartnerFilter, setFbPartnerFilter] = useState<'all' | 'existing' | 'new'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(0);
  const [countryDropOpen, setCountryDropOpen] = useState(false);
  const [sourceDropOpen, setSourceDropOpen] = useState(false);
  const countryDropRef = React.useRef<HTMLDivElement>(null);
  const sourceDropRef = React.useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (countryDropRef.current && !countryDropRef.current.contains(e.target as Node)) setCountryDropOpen(false);
      if (sourceDropRef.current && !sourceDropRef.current.contains(e.target as Node)) setSourceDropOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Merge data from multiple countries
  const [mergedData, setMergedData] = useState<{ companies: MultiSourceCompany[]; source_breakdown: Record<string, number>; totalVerified: number; totalAll: number } | null>(null);

  const toggleRow = useCallback((key: string) => {
    setExpandedRows((p) => ({ ...p, [key]: !p[key] }));
  }, []);

  const toggleSource = useCallback((sourceKey: string) => {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(sourceKey)) next.delete(sourceKey);
      else next.add(sourceKey);
      return next;
    });
  }, []);

  const toggleCountry = useCallback((code: string) => {
    setActiveCountries((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        if (next.size > 1) next.delete(code); // Keep at least one
      } else {
        next.add(code);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setExpandedRows({});
    setPage(0);
    const verifiedParam = includeUnverified ? 'all' : 'true';
    const countries = Array.from(activeCountries);

    Promise.all(
      countries.map((cc) =>
        fetch(`/api/partners/multi-source?country=${cc}&verified=${verifiedParam}`)
          .then((r) => r.json()) as Promise<ApiResponse>,
      ),
    )
      .then((responses) => {
        const allCompanies: MultiSourceCompany[] = [];
        const mergedBreakdown: Record<string, number> = {};
        let totalVerified = 0;
        let totalAll = 0;

        for (const resp of responses) {
          allCompanies.push(...resp.companies);
          for (const [k, v] of Object.entries(resp.source_breakdown)) {
            mergedBreakdown[k] = (mergedBreakdown[k] ?? 0) + v;
          }
          totalVerified += resp.stats.verified;
          totalAll += resp.total;
        }

        // Sort: priority first, then source count, then name
        allCompanies.sort((a, b) => {
          if (a.matches_priority !== b.matches_priority) return a.matches_priority ? -1 : 1;
          if (a.source_count !== b.source_count) return b.source_count - a.source_count;
          return (a.display_name ?? '').localeCompare(b.display_name ?? '');
        });
        allCompanies.forEach((c, i) => { c.rank = i + 1; });

        setMergedData({ companies: allCompanies, source_breakdown: mergedBreakdown, totalVerified, totalAll });
        setData(responses[0] ?? null); // Keep first for fallback
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [activeCountries, includeUnverified]);

  /* ── Client-side filtering ── */

  const filtered = useMemo(() => {
    if (!mergedData) return [];
    let list = mergedData.companies;

    if (priorityOnly) {
      list = list.filter((c) => c.matches_priority);
    }
    if (activeSources.size > 0) {
      list = list.filter((c) => c.source_types.some((st) => activeSources.has(st)));
    }
    if (fbPartnerFilter === 'existing') {
      list = list.filter((c) => c.is_fb_partner);
    } else if (fbPartnerFilter === 'new') {
      list = list.filter((c) => !c.is_fb_partner);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.display_name.toLowerCase().includes(q) ||
          c.normalized_name.includes(q) ||
          (c.website ?? '').toLowerCase().includes(q) ||
          (c.linkedin ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [mergedData, priorityOnly, activeSources, fbPartnerFilter, searchQuery]);

  const pagedFiltered = useMemo(() => {
    const start = page * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  /* ── Search suggestions ── */

  const searchSuggestions = useMemo(() => {
    if (!mergedData || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase().trim();
    return mergedData.companies
      .filter((c) => c.display_name.toLowerCase().includes(q) || c.normalized_name.includes(q))
      .slice(0, 6);
  }, [mergedData, searchQuery]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>Loading multi-source intelligence...</div>;
  }
  if (error) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#DC2626' }}>Error: {error}</div>;
  }
  if (!mergedData) return null;

  return (
    <div>
      {/* ── Stats bar ── */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 10, fontSize: 11, color: '#6B7280' }}>
        <span><strong style={{ color: '#111827', fontSize: 13 }}>{filtered.length}</strong> shown</span>
        <span>&middot;</span>
        <span><strong style={{ color: '#111827', fontSize: 13 }}>{mergedData.companies.length}</strong> total</span>
        <span>&middot;</span>
        <span><strong style={{ color: '#111827', fontSize: 13 }}>{filtered.filter((c) => c.source_count >= 2).length}</strong> multi-source</span>
        <span>&middot;</span>
        <span><strong style={{ color: '#059669', fontSize: 13 }}>{filtered.filter((c) => c.evidence_count > 0).length}</strong> with evidence</span>
        <span>&middot;</span>
        <span><strong style={{ color: '#111827', fontSize: 13 }}>{filtered.filter((c) => c.website).length}</strong> with website</span>
        {includeUnverified && (
          <>
            <span>&middot;</span>
            <span><strong style={{ color: '#DC2626', fontSize: 13 }}>{mergedData.companies.filter(c => c.dock_verified === false).length}</strong> not verified</span>
          </>
        )}
      </div>

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        {/* Priority toggle */}
        <button
          onClick={() => { setPriorityOnly((p) => !p); setPage(0); }}
          title="Priority: 2+ sources AND evidence link"
          style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            background: priorityOnly ? '#1D4ED8' : '#fff',
            color: priorityOnly ? '#fff' : '#374151',
            border: priorityOnly ? '1px solid #1D4ED8' : '1px solid #D1D5DB',
          }}
        >
          {priorityOnly ? '\u2713 ' : ''}Priority
        </button>

        {/* Verified toggle — green when active (default), red when showing all */}
        <button
          onClick={() => setIncludeUnverified((p) => !p)}
          style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            background: includeUnverified ? '#DC2626' : '#059669',
            color: '#fff',
            border: includeUnverified ? '1px solid #DC2626' : '1px solid #059669',
          }}
        >
          {includeUnverified ? 'Showing all' : '\u2713 Verified only'}
        </button>

        {/* Country multi-select dropdown */}
        <div style={{ position: 'relative' }} ref={countryDropRef}>
          <button
            onClick={() => setCountryDropOpen((p) => !p)}
            style={{ ...sFilterSelect, cursor: 'pointer', minWidth: 80 }}
          >
            {activeCountries.size === COUNTRIES.length ? 'All countries' : Array.from(activeCountries).join(', ')} {'\u25BE'}
          </button>
          {countryDropOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 140, padding: 4 }}>
              {COUNTRIES.map((cc) => (
                <label key={cc.code} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={activeCountries.has(cc.code)}
                    onChange={() => { toggleCountry(cc.code); setPage(0); }}
                  />
                  {cc.code} — {cc.label}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Source multi-select dropdown */}
        <div style={{ position: 'relative' }} ref={sourceDropRef}>
          <button
            onClick={() => setSourceDropOpen((p) => !p)}
            style={{ ...sFilterSelect, cursor: 'pointer', minWidth: 100 }}
          >
            {activeSources.size === 0 ? 'All sources' : `${activeSources.size} source${activeSources.size > 1 ? 's' : ''}`} {'\u25BE'}
          </button>
          {sourceDropOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 200, padding: 4 }}>
              <button
                onClick={() => {
                  const available = SOURCE_TYPES.filter(st => (mergedData.source_breakdown[st.key] ?? 0) > 0).map(st => st.key);
                  setActiveSources(activeSources.size === available.length ? new Set() : new Set(available));
                  setPage(0);
                }}
                style={{ display: 'block', width: '100%', padding: '4px 8px', fontSize: 10, background: '#EFF6FF', color: '#1D4ED8', border: 'none', cursor: 'pointer', borderRadius: 4, marginBottom: 2, fontWeight: 600 }}
              >
                {activeSources.size === SOURCE_TYPES.filter(st => (mergedData.source_breakdown[st.key] ?? 0) > 0).length ? 'Deselect all' : 'Select all'}
              </button>
              {SOURCE_TYPES.filter((st) => (mergedData.source_breakdown[st.key] ?? 0) > 0).map((st) => (
                <label key={st.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={activeSources.has(st.key)}
                    onChange={() => { toggleSource(st.key); setPage(0); }}
                  />
                  <span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 600, background: st.bg, color: st.color }}>{st.label}</span>
                  {st.fullLabel}
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: '#9CA3AF' }}>{mergedData.source_breakdown[st.key]}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* FB Partner filter */}
        <select
          value={fbPartnerFilter}
          onChange={(e) => { setFbPartnerFilter(e.target.value as 'all' | 'existing' | 'new'); setPage(0); }}
          style={sFilterSelect}
        >
          <option value="all">All partners</option>
          <option value="existing">FB Partner</option>
          <option value="new">New (not FB)</option>
        </select>

        {/* Search */}
        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            placeholder="Search company..."
            style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, border: '1px solid #D1D5DB', width: 180 }}
          />
          {searchQuery.length >= 2 && searchSuggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, width: 300, background: '#fff',
              border: '1px solid #D1D5DB', borderRadius: '0 0 6px 6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: 200, overflowY: 'auto',
            }}>
              {searchSuggestions.map((c) => (
                <div
                  key={c.normalized_name + c.country_code}
                  onClick={() => setSearchQuery(c.display_name)}
                  style={{ padding: '6px 12px', fontSize: 11, cursor: 'pointer', borderBottom: '1px solid #F3F4F6' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#EFF6FF'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
                >
                  <span style={{ fontWeight: 600 }}>{c.display_name}</span>
                  <span style={{ fontSize: 10, color: '#6B7280' }}>
                    {' '}&mdash; {c.country_code} &middot; {c.source_count} src
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Priority definition */}
      <div style={{ fontSize: 9, color: '#9CA3AF', marginBottom: 10 }}>
        Priority: 2+ sources AND evidence link
      </div>

      {/* ── Table ── */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>
            {filtered.length > PAGE_SIZE
              ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length} companies`
              : `${filtered.length} of ${mergedData.companies.length} companies`}
          </span>
          <span style={{ fontSize: 10, color: '#9CA3AF' }}>Click row to expand details</span>
        </div>
        <div style={{ maxHeight: 'calc(100vh - 380px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                <th style={{ ...sTH, width: 24 }}></th>
                <th style={sTH}>Company</th>
                <th style={{ ...sTH, width: 32 }}>CC</th>
                <th style={{ ...sTH, width: 30 }}>FB</th>
                <th style={{ ...sTH, width: 80 }}>Sources</th>
                <th style={{ ...sTH, width: 70 }}>Dock</th>
                <th style={sTH}>Website</th>
                <th style={sTH}>LinkedIn</th>
                <th style={{ ...sTH, width: 60 }}>Evidence</th>
                <th style={{ ...sTH, width: 90 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {pagedFiltered.length === 0 && (
                <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>No companies match the current filters</td></tr>
              )}
              {pagedFiltered.map((c) => {
                const isExpanded = expandedRows[c.normalized_name + c.country_code];
                const rowKey = c.normalized_name + c.country_code;
                const verifiedBorder = c.dock_verified === true ? '#059669' : c.dock_verified === false ? '#E5E7EB' : '#FCD34D';
                return (
                  <React.Fragment key={rowKey}>
                    <tr
                      onClick={() => toggleRow(rowKey)}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid #F3F4F6',
                        borderLeft: `3px solid ${verifiedBorder}`,
                        background: isExpanded ? '#EFF6FF' : undefined,
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = '#F9FAFB'; }}
                      onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = ''; }}
                    >
                      <td style={{ ...sTD, paddingLeft: 8, width: 24 }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, color: isExpanded ? '#2C7BF2' : '#4B5563',
                          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.18s ease',
                        }}>{'\u25B6'}</span>
                      </td>
                      <td style={sTD}>
                        <span style={{ fontWeight: 600, fontSize: 11, color: '#111827' }}>{c.display_name}</span>
                        {c.dock_verified === true && <span style={{ display: 'inline-block', marginLeft: 4, padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 600, background: '#DCFCE7', color: '#166534' }}>verified</span>}
                        {c.dock_verified === false && <span style={{ display: 'inline-block', marginLeft: 4, padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 600, background: '#FEF2F2', color: '#991B1B' }}>not verified</span>}
                      </td>
                      <td style={{ ...sTD, fontSize: 10, color: '#6B7280', textAlign: 'center' }}>{c.country_code}</td>
                      <td style={{ ...sTD, textAlign: 'center' }}>
                        {c.is_fb_partner && <span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 700, background: '#DBEAFE', color: '#1E40AF' }}>FB</span>}
                      </td>
                      <td style={sTD}>
                        <span style={{ display: 'inline-block', padding: '1px 4px', borderRadius: 3, fontSize: 9, fontWeight: 700, background: '#EFF6FF', color: '#1D4ED8', minWidth: 14, textAlign: 'center', marginRight: 2 }}>{c.source_count}</span>
                        {c.source_types.map((st) => {
                          const b = SOURCE_BADGE_MAP[st];
                          return b ? <span key={st} style={{ display: 'inline-block', padding: '1px 4px', borderRadius: 3, fontSize: 8, fontWeight: 600, background: b.bg, color: b.color, marginRight: 1 }}>{b.label}</span> : null;
                        })}
                      </td>
                      <td style={{ ...sTD, fontSize: 9, color: '#374151' }}>{c.dock_models ? shortenDockModels(c.dock_models) : <span style={{ color: '#D1D5DB' }}>&mdash;</span>}</td>
                      <td style={sTD}>
                        {c.website
                          ? <a href={c.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: '#2563EB', textDecoration: 'none', fontSize: 10 }}>{c.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}</a>
                          : <span style={{ color: '#D1D5DB' }}>&mdash;</span>}
                      </td>
                      <td style={sTD}>
                        {c.linkedin
                          ? <a href={c.linkedin.startsWith('http') ? c.linkedin : `https://${c.linkedin}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: '#2563EB', textDecoration: 'none', fontSize: 10 }}>{c.linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\/company\//, '').replace(/\/$/, '').slice(0, 20)}</a>
                          : <span style={{ color: '#D1D5DB' }}>&mdash;</span>}
                      </td>
                      <td style={sTD}>
                        {c.evidence_count > 0
                          ? <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 600, background: '#DCFCE7', color: '#166534' }}>{c.evidence_count} link{c.evidence_count > 1 ? 's' : ''}</span>
                          : <span style={{ color: '#D1D5DB' }}>&mdash;</span>}
                      </td>
                      <td style={sTD} onClick={(e) => e.stopPropagation()}>
                        <button style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#059669', color: '#fff', border: 'none', cursor: 'pointer', marginRight: 4 }}>+ Pipe</button>
                        <button style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10, background: '#fff', color: '#DC2626', border: '1px solid #FCA5A5', cursor: 'pointer' }}>Reject</button>
                      </td>
                    </tr>

                    {/* ── Expanded drawer ── */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} style={{ padding: 0, borderBottom: '1px solid #E5E7EB' }}>
                          <div style={{ borderTop: '2px solid #2C7BF2', borderLeft: '3px solid #2C7BF2', background: '#FAFCFF', boxShadow: '0 4px 20px rgba(44,123,242,0.09)' }}>
                            {/* Header — clickable to close */}
                            <div
                              onClick={() => toggleRow(rowKey)}
                              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', background: '#2C7BF2', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                            >
                              <span style={{ fontSize: 11, opacity: 0.7 }}>{'\u25BC'}</span>
                              {c.display_name}
                              <span style={sDrawerTag}>{c.country_code}</span>
                              <span style={sDrawerTag}>{c.source_count} sources</span>
                              <span style={sDrawerTag}>{c.dock_verified ? 'Dock verified' : 'Not verified'}</span>
                              {c.dock_models && <span style={sDrawerTag}>{c.dock_models}</span>}
                              {c.role && <span style={sDrawerTag}>{c.role}</span>}
                              <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.6 }}>click to close</span>
                            </div>

                            <div style={{ padding: '12px 20px' }}>
                              {/* ── Top row: Company info + Actions ── */}
                              <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
                                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, fontSize: 11 }}>
                                  <div>
                                    <DrawerField label="Website" value={c.website} link />
                                    <DrawerField label="LinkedIn" value={c.linkedin} link />
                                  </div>
                                  <div>
                                    <DrawerField label="Dock Models" value={c.dock_models} />
                                    {c.role && <DrawerField label="Role" value={c.role} />}
                                  </div>
                                  <div>
                                    <DrawerField label="Sources" value={c.source_types.join(', ')} />
                                    {c.source_refs && Object.entries(c.source_refs).map(([key, val]) => {
                                      if (typeof val === 'object' && val !== null) {
                                        const ref = val as Record<string, unknown>;
                                        if (ref.registry_id) return <DrawerField key={key} label={`Reg ID (${key})`} value={String(ref.registry_id)} />;
                                      }
                                      return null;
                                    })}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
                                  <button style={{ padding: '6px 16px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: '#059669', color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                    + Add to Pipeline
                                  </button>
                                  <button style={{ padding: '5px 16px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: '#fff', color: '#DC2626', border: '1px solid #FCA5A5', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                    Reject
                                  </button>
                                </div>
                              </div>

                              {/* ── Evidence table ── */}
                              <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 10 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                                  Evidence ({c.verifications.length})
                                </div>
                                {c.verifications.length === 0 ? (
                                  <div style={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' }}>No verification entries.</div>
                                ) : (
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                                    <thead>
                                      <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                                        <th style={{ textAlign: 'left', padding: '3px 6px', fontSize: 9, color: '#6B7280', fontWeight: 600 }}>Source</th>
                                        <th style={{ textAlign: 'left', padding: '3px 6px', fontSize: 9, color: '#6B7280', fontWeight: 600 }}>Evidence URL</th>
                                        <th style={{ textAlign: 'left', padding: '3px 6px', fontSize: 9, color: '#6B7280', fontWeight: 600, width: 40 }}>Hits</th>
                                        <th style={{ textAlign: 'left', padding: '3px 6px', fontSize: 9, color: '#6B7280', fontWeight: 600, width: 70 }}>Date</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {c.verifications.map((v, i) => {
                                        const methodBadge = SOURCE_BADGE_MAP[v.method] ?? { label: v.method, bg: '#F3F4F6', color: '#6B7280' };
                                        return (
                                          <tr key={i} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                            <td style={{ padding: '4px 6px' }}>
                                              <span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 600, background: methodBadge.bg, color: methodBadge.color }}>{methodBadge.label}</span>
                                            </td>
                                            <td style={{ padding: '4px 6px', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                              {v.url
                                                ? <a href={v.url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563EB', textDecoration: 'none' }}>{v.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 70)}</a>
                                                : <span style={{ color: '#9CA3AF' }}>{v.note || 'no URL'}</span>}
                                            </td>
                                            <td style={{ padding: '4px 6px', color: '#374151' }}>{v.hits}</td>
                                            <td style={{ padding: '4px 6px', color: '#9CA3AF', fontSize: 9 }}>{v.at ? new Date(v.at).toLocaleDateString() : ''}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding: '8px 12px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{ ...sPaginationBtn, opacity: page === 0 ? 0.4 : 1, cursor: page === 0 ? 'default' : 'pointer' }}
            >
              {'\u2190'} Prev
            </button>
            <span style={{ fontSize: 11, color: '#6B7280' }}>
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{ ...sPaginationBtn, opacity: page >= totalPages - 1 ? 0.4 : 1, cursor: page >= totalPages - 1 ? 'default' : 'pointer' }}
            >
              Next {'\u2192'}
            </button>
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      <div style={{ padding: '6px 12px', fontSize: 9, color: '#9CA3AF', display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
        {SOURCE_TYPES.filter((st) => (mergedData.source_breakdown[st.key] ?? 0) > 0).map((st) => (
          <span key={st.key}>
            <span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 600, background: st.bg, color: st.color, marginRight: 2 }}>{st.label}</span>
            {st.fullLabel}
          </span>
        ))}
        <span style={{ borderLeft: '1px solid #E5E7EB', paddingLeft: 8 }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderLeft: '3px solid #059669', marginRight: 4 }}></span>verified
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderLeft: '3px solid #E5E7EB', marginRight: 4 }}></span>not verified
        </span>
      </div>
    </div>
  );
}

/* ─── Drawer Field ─── */

function DrawerField({ label, value, link }: { label: string; value: string | null; link?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11, borderBottom: '1px solid #F3F4F6' }}>
      <span style={{ color: '#6B7280' }}>{label}</span>
      <span style={{ color: '#111827', fontWeight: 500, textAlign: 'right', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value
          ? link
            ? <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" style={{ color: '#2563EB', textDecoration: 'none' }}>{value.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</a>
            : value
          : <span style={{ color: '#D1D5DB' }}>&mdash;</span>}
      </span>
    </div>
  );
}

/* ─── Styles ─── */

const sFilterSelect: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 6, fontSize: 11, border: '1px solid #D1D5DB', background: '#fff', color: '#374151',
};

const sTH: React.CSSProperties = {
  padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600,
  color: '#6B7280', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB',
  textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap',
  position: 'sticky', top: 0, zIndex: 10,
};

const sTD: React.CSSProperties = {
  padding: '6px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap',
};

const sDrawerColTitle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase',
  letterSpacing: 0.5, marginBottom: 8, borderBottom: '1px solid #E5E7EB', paddingBottom: 4,
};

const sDrawerTag: React.CSSProperties = {
  padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'rgba(255,255,255,0.2)',
};

const sPaginationBtn: React.CSSProperties = {
  padding: '4px 12px', borderRadius: 4, fontSize: 11, fontWeight: 600,
  background: '#fff', color: '#374151', border: '1px solid #D1D5DB',
};
