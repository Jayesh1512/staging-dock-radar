'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';

/* ─── Types ─── */

interface SourceSignal {
  source_type: string;
  confidence: string;
  raw_score: number;
  signal_keyword: string | null;
  website: string | null;
  linkedin_url: string | null;
  city: string | null;
  employee_count: number | null;
  snippet: string | null;
  source_meta: Record<string, unknown> | null;
  normalized_domain: string | null;
}

interface GroupedCompany {
  rank: number;
  normalized_name: string;
  display_name: string;
  entity_type: string;
  fence: string | null;
  website: string | null;
  linkedin_url: string | null;
  normalized_domain: string | null;
  city: string | null;
  employee_count: number | null;
  country_code: string;
  source_count: number;
  sources: SourceSignal[];
  source_types: string[];
  best_score: number;
  best_confidence: string;
  composite_confidence: string;
  has_dock3: boolean;
  dock3_note: string | null;
  key_signal: string;
  matches_composite_priority: boolean;
}

interface ApiResponse {
  country: string;
  total_candidates: number;
  total_companies: number;
  stats: {
    multi_source: number;
    dock3_confirmed: number;
    has_website: number;
    high_confidence: number;
    medium_confidence: number;
    low_confidence: number;
    composite_priority_matches: number;
    operators: number;
    resellers: number;
    fence_flagged: number;
  };
  companies: GroupedCompany[];
}

/* ─── Constants ─── */

const SOURCE_TYPES = [
  { key: 'dji_reseller_list', label: 'DJI', bg: '#FEE2E2', color: '#991B1B', fullLabel: 'DJI Reseller' },
  { key: 'govt_registry', label: 'Reg', bg: '#DBEAFE', color: '#1E40AF', fullLabel: 'Govt Registry' },
  { key: 'comet', label: 'Com', bg: '#F3E8FF', color: '#6B21A8', fullLabel: 'Comet' },
  { key: 'google_search', label: 'Ggl', bg: '#E0E7FF', color: '#3730A3', fullLabel: 'Google Search' },
  { key: 'team_intel', label: 'Team', bg: '#ECFDF5', color: '#065F46', fullLabel: 'Team Intel' },
];

const SOURCE_BADGE_MAP: Record<string, typeof SOURCE_TYPES[0]> = {};
for (const s of SOURCE_TYPES) SOURCE_BADGE_MAP[s.key] = s;

const CONF_STYLES: Record<string, { bg: string; color: string }> = {
  high:   { bg: '#DCFCE7', color: '#166534' },
  medium: { bg: '#FEF3C7', color: '#92400E' },
  low:    { bg: '#F3F4F6', color: '#6B7280' },
};

const SOURCE_BORDER_COLORS: Record<string, string> = {
  dji_reseller_list: '#991B1B',
  govt_registry:     '#1E40AF',
  comet:             '#6B21A8',
  google_search:     '#3730A3',
  team_intel:        '#065F46',
};

/* ─── Helpers ─── */

/** Make raw signal strings human-readable */
function formatKeySignal(raw: string, sources: SourceSignal[]): string {
  const parts: string[] = [];

  // Check for DJI dealer
  const djiSource = sources.find(s => s.source_type === 'dji_reseller_list');
  if (djiSource) parts.push('DJI Enterprise Dealer');

  // Check for Dock 3
  const dock3 = sources.find(s => (s.source_meta as Record<string,unknown>)?.dock3_authorized === 'Yes');
  if (dock3) parts.push('Dock 3 Authorized');

  // Check for NAF code
  const regSource = sources.find(s => s.source_type === 'govt_registry');
  if (regSource?.source_meta) {
    const naf = regSource.source_meta.activity_code as string;
    if (naf) {
      const nafLabels: Record<string, string> = {
        '71.12B': 'Engineering', '71.20B': 'Testing/Inspection', '74.90B': 'Professional Services',
        '80.10Z': 'Security', '51.10Z': 'Air Transport', '30.30Z': 'Aircraft Mfg',
        '70.22Z': 'Consulting', '62.01Z': 'Software', '63.11Z': 'Data Processing',
      };
      parts.push(nafLabels[naf] ?? `NAF ${naf}`);
    }
  }

  // Check for BVLOS/Comet signals
  const cometSource = sources.find(s => s.source_type === 'comet' && s.signal_keyword);
  if (cometSource?.signal_keyword && !cometSource.signal_keyword.startsWith('DJI')) {
    parts.push(cometSource.signal_keyword);
  }

  if (parts.length === 0) {
    // Fallback: extract meaningful bits from raw
    if (raw.includes('dock_kw')) parts.push('Dock keyword match');
    else if (raw.includes('provider_kw')) parts.push('Service provider');
    else if (raw.includes('generic_name')) parts.push('Drone company');
    else parts.push(raw.split(' + ')[0] || '—');
  }

  return parts.slice(0, 2).join(' · ');
}

/* ─── Component ─── */

export default function MultiSourceIntelligence() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [country, setCountry] = useState('FR');
  const [compositePriority, setCompositePriority] = useState(true);
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set()); // empty = all
  const [confFilter, setConfFilter] = useState('all');
  const [websiteFilter, setWebsiteFilter] = useState('all');
  const [entityTypeFilter, setEntityTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const toggleRow = useCallback((key: string) => {
    setExpandedRows(p => ({ ...p, [key]: !p[key] }));
  }, []);

  const toggleSource = useCallback((sourceKey: string) => {
    setActiveSources(prev => {
      const next = new Set(prev);
      if (next.has(sourceKey)) next.delete(sourceKey);
      else next.add(sourceKey);
      return next;
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setExpandedRows({});
    fetch(`/api/source-candidates/grouped?country=${country}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [country]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.companies;

    if (compositePriority) {
      list = list.filter(c => c.matches_composite_priority);
    }
    if (activeSources.size > 0) {
      list = list.filter(c => c.source_types.some(st => activeSources.has(st)));
    }
    if (confFilter !== 'all') {
      list = list.filter(c => c.composite_confidence === confFilter);
    }
    if (entityTypeFilter !== 'all') {
      list = list.filter(c => c.entity_type === entityTypeFilter);
    }
    if (websiteFilter === 'yes') {
      list = list.filter(c => c.website);
    } else if (websiteFilter === 'no') {
      list = list.filter(c => !c.website);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(c =>
        c.display_name.toLowerCase().includes(q) ||
        c.normalized_name.includes(q) ||
        (c.normalized_domain ?? '').includes(q)
      );
    }

    return list;
  }, [data, compositePriority, activeSources, confFilter, entityTypeFilter, websiteFilter, searchQuery]);

  // Search suggestions
  const searchSuggestions = useMemo(() => {
    if (!data || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase().trim();
    return data.companies
      .filter(c => c.display_name.toLowerCase().includes(q) || c.normalized_name.includes(q))
      .slice(0, 6);
  }, [data, searchQuery]);

  // Section grouping from filtered results
  const sections = useMemo(() => {
    const multiSource = filtered.filter(c => c.source_count >= 2);
    const highSingle = filtered.filter(c => c.source_count < 2 && c.composite_confidence === 'high');
    const medium = filtered.filter(c => c.composite_confidence === 'medium');
    const low = filtered.filter(c => c.composite_confidence === 'low');

    const result: { label: string; count: number; companies: GroupedCompany[] }[] = [];
    if (multiSource.length > 0) result.push({ label: `MULTI-SOURCE MATCHES (${multiSource.length} — 2+ independent sources)`, count: multiSource.length, companies: multiSource });
    if (highSingle.length > 0) result.push({ label: `HIGH CONFIDENCE (${highSingle.length} — single source)`, count: highSingle.length, companies: highSingle });
    if (medium.length > 0) result.push({ label: `MEDIUM CONFIDENCE (${medium.length})`, count: medium.length, companies: medium });
    if (low.length > 0) result.push({ label: `LOW CONFIDENCE (${low.length})`, count: low.length, companies: low });

    return result;
  }, [filtered]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>Loading multi-source intelligence for {country}...</div>;
  }
  if (error) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#DC2626' }}>Error: {error}</div>;
  }
  if (!data) return null;

  const s = data.stats;

  return (
    <div>
      {/* ── Stats Mini (dynamic from filtered) ── */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 10, fontSize: 11, color: '#6B7280' }}>
        <span><strong style={{ color: '#111827', fontSize: 13 }}>{filtered.length}</strong> shown</span>
        <span>·</span>
        <span><strong style={{ color: '#111827', fontSize: 13 }}>{data.total_companies}</strong> total</span>
        <span>·</span>
        <span><strong style={{ color: '#111827', fontSize: 13 }}>{filtered.filter(c => c.source_count >= 2).length}</strong> multi-source</span>
        <span>·</span>
        <span><strong style={{ color: '#166534', fontSize: 13 }}>{filtered.filter(c => c.entity_type === 'operator').length}</strong> DSP/SI</span>
        <span>·</span>
        <span><strong style={{ color: '#92400E', fontSize: 13 }}>{filtered.filter(c => c.entity_type === 'reseller').length}</strong> Resellers</span>
        <span>·</span>
        <span><strong style={{ color: '#111827', fontSize: 13 }}>{filtered.filter(c => c.has_dock3).length}</strong> Dock 3</span>
        <span>·</span>
        <span><strong style={{ color: '#111827', fontSize: 13 }}>{filtered.filter(c => c.website).length}</strong> with website</span>
      </div>

      {/* ── Filter Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {/* Composite Priority toggle */}
        <button
          onClick={() => setCompositePriority(p => !p)}
          style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            background: compositePriority ? '#1D4ED8' : '#fff',
            color: compositePriority ? '#fff' : '#374151',
            border: compositePriority ? '1px solid #1D4ED8' : '1px solid #D1D5DB',
          }}
        >
          {compositePriority ? '✓ ' : ''}Composite Priority
        </button>

        {/* Country */}
        <select value={country} onChange={e => setCountry(e.target.value)} style={sFilterSelect}>
          <option value="FR">FR</option>
          <option value="NL">NL</option>
        </select>

        {/* Source toggle buttons (multi-select) */}
        {SOURCE_TYPES.filter(st => {
          // Only show sources that exist in the data
          return data.companies.some(c => c.source_types.includes(st.key));
        }).map(st => {
          const isActive = activeSources.has(st.key);
          return (
            <button
              key={st.key}
              onClick={() => toggleSource(st.key)}
              style={{
                padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                background: isActive ? st.bg : '#fff',
                color: isActive ? st.color : '#9CA3AF',
                border: isActive ? `1px solid ${st.color}` : '1px solid #E5E7EB',
                opacity: isActive ? 1 : 0.7,
              }}
            >
              {st.fullLabel}
            </button>
          );
        })}

        {activeSources.size > 0 && (
          <button onClick={() => setActiveSources(new Set())} style={{ padding: '4px 8px', borderRadius: 4, fontSize: 9, background: '#F3F4F6', color: '#6B7280', border: 'none', cursor: 'pointer' }}>
            Clear sources
          </button>
        )}

        {/* Entity Type */}
        <select value={entityTypeFilter} onChange={e => setEntityTypeFilter(e.target.value)} style={sFilterSelect}>
          <option value="all">All Types</option>
          <option value="operator">DSP/SI</option>
          <option value="reseller">Reseller</option>
          <option value="unknown">Unknown</option>
        </select>

        {/* Confidence */}
        <select value={confFilter} onChange={e => setConfFilter(e.target.value)} style={sFilterSelect}>
          <option value="all">All Confidence</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Website */}
        <select value={websiteFilter} onChange={e => setWebsiteFilter(e.target.value)} style={sFilterSelect}>
          <option value="all">All</option>
          <option value="yes">Has Website</option>
          <option value="no">No Website</option>
        </select>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search company..."
            style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, border: '1px solid #D1D5DB', width: 200 }}
          />
          {searchQuery.length >= 2 && searchSuggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, width: 320, background: '#fff',
              border: '1px solid #D1D5DB', borderRadius: '0 0 6px 6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: 200, overflowY: 'auto',
            }}>
              {searchSuggestions.map(c => (
                <div
                  key={c.normalized_name}
                  onClick={() => setSearchQuery(c.display_name)}
                  style={{ padding: '6px 12px', fontSize: 11, cursor: 'pointer', borderBottom: '1px solid #F3F4F6' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#EFF6FF')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                >
                  <span style={{ fontWeight: 600 }}>{c.display_name}</span>
                  <span style={{ fontSize: 10, color: '#6B7280' }}> — {c.source_count} src · {c.composite_confidence} · {c.normalized_domain ?? 'no website'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <span style={{ fontSize: 9, color: '#6B7280', background: '#F3F4F6', padding: '3px 8px', borderRadius: 4, marginLeft: 'auto' }}>
          ℹ Composite Priority: 2+ sources OR high confidence
        </span>
      </div>

      {/* ── Table ── */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>{filtered.length} of {data.total_companies} companies</span>
          <span style={{ fontSize: 10, color: '#9CA3AF' }}>Click ▶ to expand source details</span>
        </div>
        <div style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                <th style={{ ...sTHCompact, width: 28 }}></th>
                <th style={sTHCompact}>Company</th>
                <th style={{ ...sTHCompact, width: 60 }}>Type</th>
                <th style={{ ...sTHCompact, width: 90 }}>Sources</th>
                <th style={{ ...sTHCompact, width: 55 }}>Conf.</th>
                <th style={{ ...sTHCompact, width: 40 }}>Score</th>
                <th style={sTHCompact}>Website</th>
                <th style={{ ...sTHCompact, width: 45 }}>Emp.</th>
                <th style={sTHCompact}>Key Signal</th>
                <th style={{ ...sTHCompact, width: 100 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>No companies match the current filters</td></tr>
              )}
              {sections.map((section) => (
                <React.Fragment key={section.label}>
                  <tr><td colSpan={10} style={{ background: '#F3F4F6', padding: '3px 10px', fontSize: 10, color: '#6B7280', fontWeight: 600 }}>{section.label}</td></tr>

                  {section.companies.map(c => {
                    const isExpanded = expandedRows[c.normalized_name];
                    const confStyle = CONF_STYLES[c.composite_confidence] ?? CONF_STYLES.low;
                    return (
                      <React.Fragment key={c.normalized_name}>
                        <tr
                          onClick={() => toggleRow(c.normalized_name)}
                          style={{
                            cursor: 'pointer',
                            borderBottom: '1px solid #F3F4F6',
                            borderLeft: `3px solid ${confStyle.bg}`,
                            background: isExpanded ? '#EFF6FF' : undefined,
                            transition: 'background 0.1s',
                          }}
                          onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#F9FAFB'; }}
                          onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = ''; }}
                        >
                          <td style={{ ...sTDCompact, paddingLeft: 10, width: 28 }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, color: isExpanded ? '#2C7BF2' : '#4B5563',
                              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                              transition: 'transform 0.18s ease, color 0.15s ease',
                            }}>▶</span>
                          </td>
                          <td style={sTDCompact}>
                            <span style={{ fontWeight: 600, fontSize: 12, color: '#111827' }}>{c.display_name}</span>
                            {c.has_dock3 && <span style={{ display: 'inline-block', marginLeft: 4, padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 600, background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}>Dock 3 ✓</span>}
                            {!c.website && <span style={{ display: 'inline-block', marginLeft: 4, padding: '1px 4px', borderRadius: 3, fontSize: 8, fontWeight: 600, background: '#FEF2F2', color: '#991B1B' }}>no web</span>}
                            <br />
                            <span style={{ fontSize: 10, color: '#6B7280' }}>{c.normalized_domain ?? ''}</span>
                          </td>
                          <td style={sTDCompact}>
                            {c.entity_type === 'operator' && <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: '#DCFCE7', color: '#166534' }}>DSP/SI</span>}
                            {c.entity_type === 'reseller' && <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: '#FEF3C7', color: '#92400E' }}>Reseller</span>}
                            {c.entity_type === 'media' && <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: '#E0E7FF', color: '#3730A3' }}>Media</span>}
                            {c.entity_type === 'unknown' && <span style={{ color: '#9CA3AF', fontSize: 9 }}>—</span>}
                            {c.fence && <span title={c.fence} style={{ marginLeft: 3, fontSize: 9, cursor: 'help' }}>🔶</span>}
                          </td>
                          <td style={sTDCompact}>
                            <span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700, background: '#EFF6FF', color: '#1D4ED8', minWidth: 16, textAlign: 'center', marginRight: 3 }}>{c.source_count}</span>
                            {c.source_types.map(st => {
                              const b = SOURCE_BADGE_MAP[st];
                              return b ? <span key={st} style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 600, background: b.bg, color: b.color, marginRight: 2 }}>{b.label}</span> : null;
                            })}
                          </td>
                          <td style={sTDCompact}><span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 600, ...confStyle }}>{c.composite_confidence.toUpperCase()}</span></td>
                          <td style={sTDCompact}>{c.best_score}</td>
                          <td style={sTDCompact}>
                            {c.website ? <a href={c.website} target="_blank" rel="noopener noreferrer" style={{ color: '#2563EB', textDecoration: 'none', fontSize: 10 }}>{c.normalized_domain}</a> : <span style={{ color: '#D1D5DB' }}>—</span>}
                          </td>
                          <td style={sTDCompact}>{c.employee_count ?? <span style={{ color: '#D1D5DB' }}>—</span>}</td>
                          <td style={{ ...sTDCompact, fontSize: 10, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatKeySignal(c.key_signal, c.sources)}</td>
                          <td style={sTDCompact}>
                            <button style={{ padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#059669', color: '#fff', border: 'none', cursor: 'pointer' }}>Approve</button>
                            {' '}
                            <button style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10, background: '#fff', color: '#9CA3AF', border: '1px solid #E5E7EB', cursor: 'pointer' }}>✕</button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td colSpan={10} style={{ padding: 0, borderBottom: '1px solid #E5E7EB' }}>
                              <div style={{ borderTop: '2px solid #2C7BF2', borderLeft: '3px solid #2C7BF2', background: '#FAFCFF', boxShadow: '0 4px 20px rgba(44,123,242,0.09)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', background: '#2C7BF2', color: '#fff', fontSize: 13, fontWeight: 700 }}>
                                  {c.display_name}
                                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'rgba(255,255,255,0.2)' }}>{c.entity_type === 'operator' ? 'DSP/SI' : c.entity_type === 'reseller' ? 'Reseller' : c.entity_type}</span>
                                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'rgba(255,255,255,0.2)' }}>{c.source_count} sources</span>
                                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'rgba(255,255,255,0.2)' }}>{c.composite_confidence.toUpperCase()}</span>
                                  {c.has_dock3 && <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'rgba(255,255,255,0.2)' }}>Dock 3 Authorized</span>}
                                </div>

                                <div style={{ padding: '16px 20px' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
                                    <div>
                                      <div style={sDrawerColTitle}>Company Identity</div>
                                      <DrawerField label="Name" value={c.display_name} />
                                      <DrawerField label="Website" value={c.website} link />
                                      <DrawerField label="LinkedIn" value={c.linkedin_url} link />
                                      <DrawerField label="Country" value={c.country_code} />
                                      <DrawerField label="City" value={c.city} />
                                    </div>
                                    <div>
                                      <div style={sDrawerColTitle}>Business Profile</div>
                                      <DrawerField label="Employees" value={c.employee_count != null ? String(c.employee_count) : null} />
                                      {c.sources.find(s => s.source_meta?.founded_date) && (
                                        <DrawerField label="Founded" value={String(c.sources.find(s => s.source_meta?.founded_date)?.source_meta?.founded_date ?? '')} />
                                      )}
                                      {c.sources.find(s => s.source_meta?.activity_code) && (
                                        <DrawerField label="NAF Code" value={String(c.sources.find(s => s.source_meta?.activity_code)?.source_meta?.activity_code ?? '')} />
                                      )}
                                      {c.sources.find(s => s.source_meta?.registry_id) && (
                                        <DrawerField label="SIREN" value={String(c.sources.find(s => s.source_meta?.registry_id)?.source_meta?.registry_id ?? '')} />
                                      )}
                                      {c.sources.find(s => s.source_meta?.company_category) && (
                                        <DrawerField label="Category" value={String(c.sources.find(s => s.source_meta?.company_category)?.source_meta?.company_category ?? '')} />
                                      )}
                                    </div>
                                    <div>
                                      <div style={sDrawerColTitle}>DJI Relationship</div>
                                      {c.sources.find(s => s.source_meta?.dealer_type) && (
                                        <DrawerField label="Dealer Type" value={String(c.sources.find(s => s.source_meta?.dealer_type)?.source_meta?.dealer_type ?? '')} />
                                      )}
                                      <DrawerField label="Dock 3 Auth." value={c.has_dock3 ? 'Yes' : 'No'} />
                                      {c.sources.find(s => s.source_meta?.email) && (
                                        <DrawerField label="Contact" value={String(c.sources.find(s => s.source_meta?.email)?.source_meta?.email ?? '')} />
                                      )}
                                      {c.sources.find(s => s.source_meta?.phone) && (
                                        <DrawerField label="Phone" value={String(c.sources.find(s => s.source_meta?.phone)?.source_meta?.phone ?? '')} />
                                      )}
                                    </div>
                                  </div>

                                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #E5E7EB' }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                                      Source Evidence ({c.source_count} source{c.source_count > 1 ? 's' : ''})
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                      {c.sources.map((src, i) => {
                                        const badge = SOURCE_BADGE_MAP[src.source_type];
                                        const borderColor = SOURCE_BORDER_COLORS[src.source_type] ?? '#E5E7EB';
                                        return (
                                          <div key={i} style={{ flex: '1 1 200px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderLeft: `3px solid ${borderColor}`, borderRadius: 6, padding: '8px 12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                              {badge && <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 600, background: badge.bg, color: badge.color }}>{badge.fullLabel}</span>}
                                              <span style={{ fontSize: 9, color: '#6B7280' }}>{src.confidence} · Score {src.raw_score}</span>
                                            </div>
                                            <div style={{ fontSize: 10, color: '#6B7280', lineHeight: 1.5 }}>
                                              {src.snippet ?? src.signal_keyword ?? '—'}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid #E5E7EB', alignItems: 'center' }}>
                                    <button style={{ padding: '6px 20px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: '#059669', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                      ▸ Approve → Partner Queue
                                    </button>
                                    <button style={{ padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#fff', color: '#DC2626', border: '1px solid #FCA5A5', cursor: 'pointer' }}>
                                      Dismiss
                                    </button>
                                    <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9CA3AF' }}>Approving moves to discovered_companies + pipeline</span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div style={{ padding: '6px 12px', fontSize: 9, color: '#9CA3AF', display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
        {SOURCE_TYPES.map(st => (
          <span key={st.key}><span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 600, background: st.bg, color: st.color, marginRight: 2 }}>{st.label}</span> {st.fullLabel}</span>
        ))}
        <span style={{ borderLeft: '1px solid #E5E7EB', paddingLeft: 8, marginLeft: 4 }}><span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 600, background: '#DCFCE7', color: '#166534' }}>DSP/SI</span> Operator</span>
        <span><span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 600, background: '#FEF3C7', color: '#92400E' }}>Reseller</span> DJI Dealer</span>
        <span>🔶 Hybrid signal</span>
        <span style={{ borderLeft: '1px solid #E5E7EB', paddingLeft: 8, marginLeft: 4 }}><span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 600, background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}>Dock 3 ✓</span> Authorized</span>
        <span><span style={{ display: 'inline-block', padding: '1px 4px', borderRadius: 3, fontSize: 8, fontWeight: 600, background: '#FEF2F2', color: '#991B1B' }}>no web</span> Needs enrichment</span>
      </div>
    </div>
  );
}

/* ─── Drawer Field ─── */

function DrawerField({ label, value, link }: { label: string; value: string | null; link?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11, borderBottom: '1px solid #F3F4F6' }}>
      <span style={{ color: '#6B7280' }}>{label}</span>
      <span style={{ color: '#111827', fontWeight: 500, textAlign: 'right', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value ? (link ? <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" style={{ color: '#2563EB', textDecoration: 'none' }}>{value.replace(/^https?:\/\/(www\.)?/, '')}</a> : value) : <span style={{ color: '#D1D5DB' }}>—</span>}
      </span>
    </div>
  );
}

/* ─── Styles ─── */

const sFilterSelect: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 6, fontSize: 11, border: '1px solid #D1D5DB', background: '#fff', color: '#374151',
};

const sTHCompact: React.CSSProperties = {
  padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600,
  color: '#6B7280', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB',
  textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap',
  position: 'sticky', top: 0, zIndex: 10,
};

const sTDCompact: React.CSSProperties = {
  padding: '6px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap',
};

const sDrawerColTitle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase',
  letterSpacing: 0.5, marginBottom: 8, borderBottom: '1px solid #E5E7EB', paddingBottom: 4,
};
