'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Navbar } from '@/components/shared/Navbar';

/* ─── Types ─── */

interface ScoreBreakdown {
  match_keyword: string | null;
  employee_points: number;
  age_points: number;
  category_points: number;
  legal_form_points: number;
  naf_points: number;
  name_keyword_points: number;
  name_penalty_points: number;
  relevance_total: number;
  establishment_total: number;
  is_blacklisted_naf: boolean;
  is_false_positive_uav: boolean;
}

interface Dedup {
  in_discovered: boolean;
  in_partners: boolean;
  partner_match_name: string | null;
  normalized_name: string;
}

interface RegistryRow {
  id: string;
  registry_id: string;
  company_name: string;
  trade_name: string | null;
  acronym: string | null;
  activity_code: string | null;
  legal_form_code: string | null;
  employee_band: string | null;
  employee_estimate: number;
  has_employees: boolean;
  company_category: string | null;
  founded_date: string | null;
  city: string | null;
  address: string | null;
  country_code: string;
  signal_source: string | null;
  filter_version: string | null;
  match_keyword: string | null;
  composite_score: number;
  confidence: 'high' | 'medium' | 'low';
  score_breakdown: ScoreBreakdown | null;
  rank: number | null;
  notes: string | null;
  website: string | null;
  linkedin: string | null;
  qa_status: 'pending' | 'approved' | 'rejected' | 'merged';
  qa_notes: string | null;
  merged_to: string | null;
  dedup: Dedup;
}

/* ─── Constants ─── */

const NAF_LABELS: Record<string, string> = {
  '74.20Z': 'Photography', '81.22Z': 'Building Cleaning', '71.12B': 'Engineering & Tech',
  '59.11B': 'Video Production', '81.21Z': 'General Cleaning', '71.20B': 'Technical Testing',
  '74.90B': 'Professional Services', '59.11A': 'Film Production', '85.59B': 'Other Education',
  '85.59A': 'Prof. Education', '81.29B': 'Cleaning Services', '43.91B': 'Roofing',
  '30.30Z': 'Aerospace Mfg', '70.22Z': 'Consulting', '71.12A': 'Architecture & Eng',
  '62.01Z': 'Software', '72.19Z': 'R&D Sciences', '82.99Z': 'Business Support',
  '80.10Z': 'Security', '51.10Z': 'Air Transport', '63.11Z': 'Data Processing',
  '26.70Z': 'Electronics', '47.11F': 'Retail', '49.39B': 'Land Transport',
  '49.32Z': 'Taxi', '85.51Z': 'Sports Education', '47.71Z': 'Clothing Retail',
};

const FR_EMP_LABELS: Record<string, string> = {
  'NN': '—', '00': '0', '01': '1–2', '02': '3–5', '03': '6–9',
  '11': '10–19', '12': '20–49', '21': '50–99', '22': '100–199',
  '31': '200–249', '32': '250–499', '41': '500–999', '42': '1K–2K',
  '51': '2K–5K', '52': '5K–10K', '53': '10K+',
};

const COUNTRY_FLAGS: Record<string, string> = {
  FR: '🇫🇷', DE: '🇩🇪', UK: '🇬🇧', ES: '🇪🇸', IT: '🇮🇹', NL: '🇳🇱',
  US: '🇺🇸', AU: '🇦🇺', IN: '🇮🇳', AE: '🇦🇪', SA: '🇸🇦',
};

const CONFIDENCE_COLORS = {
  high:   { bg: '#DCFCE7', color: '#15803D', label: 'High' },
  medium: { bg: '#FEF3C7', color: '#92400E', label: 'Med' },
  low:    { bg: '#FEE2E2', color: '#991B1B', label: 'Low' },
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:  { bg: '#F3F4F6', color: '#6B7280' },
  approved: { bg: '#DCFCE7', color: '#15803D' },
  rejected: { bg: '#FEE2E2', color: '#991B1B' },
  merged:   { bg: '#DBEAFE', color: '#1D4ED8' },
};

const SCORE_TIERS = [
  { label: 'All', min: 0 },
  { label: 'Hot (≥30)', min: 30 },
  { label: 'Warm (≥20)', min: 20 },
  { label: 'Cool (≥10)', min: 10 },
];

/* ─── Styles ─── */

const sPage: React.CSSProperties = { maxWidth: 1280, margin: '0 auto', padding: '24px 20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' };
const sHeader: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 };
const sTitle: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: '#111827' };
const sFilterBar: React.CSSProperties = { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' };
const sFilterGroup: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 };
const sFilterLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 };
const sSelect: React.CSSProperties = { fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid #D1D5DB', background: '#fff', color: '#374151' };
const sTable: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const sTH: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' };
const sTD: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #F3F4F6', verticalAlign: 'middle' };
const sPill = (bg: string, color: string): React.CSSProperties => ({ display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: bg, color, whiteSpace: 'nowrap' });
const sActionBar: React.CSSProperties = { display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' };
const sBtn = (bg: string, color: string, border: string): React.CSSProperties => ({ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 6, border: `1px solid ${border}`, background: bg, color, cursor: 'pointer' });
const sExpandedRow: React.CSSProperties = { background: '#FAFCFF', borderTop: '2px solid #2C7BF2', borderLeft: '3px solid #2C7BF2', padding: '16px 20px' };
const sSectionLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: '#4B5563', letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 8 };
const sBreakdownRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12.5, color: '#374151' };
const sInput: React.CSSProperties = { fontSize: 12, padding: '5px 8px', borderRadius: 5, border: '1px solid #D1D5DB', width: '100%', color: '#374151' };

/* ─── Scoring Rules Panel (collapsible, readonly) ─── */

function ScoringRulesPanel() {
  const [open, setOpen] = useState(false);
  const rTh: React.CSSProperties = { padding: '4px 8px', fontSize: 11, fontWeight: 700, color: '#6B7280', textAlign: 'left', borderBottom: '1px solid #E5E7EB' };
  const rTd: React.CSSProperties = { padding: '4px 8px', fontSize: 11, color: '#374151', borderBottom: '1px solid #F3F4F6' };
  return (
    <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, marginBottom: 16, overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>Waterfall Scoring Rules</span>
          <span style={{ fontSize: 11, color: '#B45309' }}>How companies are scored from country registries</span>
        </div>
        <span style={{ fontSize: 12, color: '#92400E' }}>{open ? 'Hide' : 'Show'}</span>
      </div>
      {open && (
        <div style={{ padding: '0 16px 14px', borderTop: '1px solid #FDE68A' }}>
          {/* Confidence */}
          <div style={{ marginTop: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Confidence Levels</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={rTh}>Level</th><th style={rTh}>Criteria</th></tr></thead>
              <tbody>
                <tr><td style={rTd}><span style={{ ...sPill('#DCFCE7', '#15803D'), fontSize: 10 }}>High</span></td><td style={rTd}>Matched on &quot;drone&quot; + premium activity code or has employees; OR matched on &quot;telepilot&quot;/&quot;rpas&quot;</td></tr>
                <tr><td style={rTd}><span style={{ ...sPill('#FEF3C7', '#92400E'), fontSize: 10 }}>Medium</span></td><td style={rTd}>Matched on &quot;drone&quot; but no premium activity code and no employees</td></tr>
                <tr><td style={rTd}><span style={{ ...sPill('#FEE2E2', '#991B1B'), fontSize: 10 }}>Low</span></td><td style={rTd}>False positive UAV match (AQUA*, GUAVA), or blacklisted sector, or no keyword match</td></tr>
              </tbody>
            </table>
          </div>
          {/* Score components */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Composite Score Components</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', marginBottom: 4, textTransform: 'uppercase' }}>Relevance</div>
                <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.6 }}>
                  Activity code bonus: +3 to +8 (engineering, R&D, security, aerospace)<br/>
                  Name keywords: +4 (inspection, surveillance, services) / +2 (tech, solutions, lidar)<br/>
                  Name penalties: -3 (photo, video, film) / -2 (agri)
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', marginBottom: 4, textTransform: 'uppercase' }}>Establishment</div>
                <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.6 }}>
                  Employee size: 0–30 points by band<br/>
                  Has employees bonus: +3<br/>
                  Company age: +8 (≥7yr), +5 (≥4yr), +2 (≥2yr)<br/>
                  Category: PME +5, ETI +12, GE +15<br/>
                  Legal form: SAS +3, SARL +2
                </div>
              </div>
            </div>
          </div>
          {/* Score tiers */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Score Tiers</div>
            <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
              <span><strong style={{ color: '#15803D' }}>Hot ≥ 30</strong> — established DSPs</span>
              <span><strong style={{ color: '#1D4ED8' }}>Warm 20–29</strong> — solid companies worth evaluating</span>
              <span><strong style={{ color: '#6B7280' }}>Cool 10–19</strong> — smaller operators</span>
              <span><strong style={{ color: '#9CA3AF' }}>Cold &lt; 10</strong> — minimal signal</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Component ─── */

export default function RegistryReviewPage() {
  const [rows, setRows] = useState<RegistryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [countries, setCountries] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [filterCountry, setFilterCountry] = useState('all');
  const [filterMinScore, setFilterMinScore] = useState(0);
  const [filterConfidence, setFilterConfidence] = useState('all');
  const [filterStatus, setFilterStatus] = useState('pending');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // Inline enrich state
  const [enrichEdits, setEnrichEdits] = useState<Record<string, { website?: string; linkedin?: string }>>({});

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterCountry !== 'all') params.set('country', filterCountry);
      if (filterMinScore > 0) params.set('min_score', String(filterMinScore));
      if (filterConfidence !== 'all') params.set('confidence', filterConfidence);
      if (filterStatus !== 'all') params.set('status', filterStatus);
      params.set('limit', String(pageSize));
      params.set('offset', String((page - 1) * pageSize));

      const res = await fetch(`/api/registry/list?${params}`);
      const json = await res.json();
      setRows(json.rows ?? []);
      setTotal(json.total ?? 0);
      setCountries(json.countries ?? []);
    } catch {
      toast.error('Failed to load registry data');
    } finally {
      setLoading(false);
    }
  }, [filterCountry, filterMinScore, filterConfidence, filterStatus, page, pageSize]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [filterCountry, filterMinScore, filterConfidence, filterStatus, pageSize]);

  // ─── Handlers ───

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map(r => r.id)));
    }
  };

  const handleBulkReview = async (qa_status: 'approved' | 'rejected') => {
    if (selectedIds.size === 0) return;
    const label = qa_status === 'approved' ? 'Approve' : 'Reject';
    if (!confirm(`${label} ${selectedIds.size} companies?`)) return;

    try {
      const res = await fetch('/api/registry/review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), qa_status }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(`${selectedIds.size} companies ${qa_status}`);
      setSelectedIds(new Set());
      fetchRows();
    } catch {
      toast.error(`Failed to ${label.toLowerCase()}`);
    }
  };

  const handleMerge = async () => {
    const approvedCount = rows.filter(r => r.qa_status === 'approved').length;
    if (approvedCount === 0) {
      toast.error('No approved rows to merge. Approve companies first.');
      return;
    }
    if (!confirm(`Merge ${approvedCount} approved companies into Partner Hit List?`)) return;

    try {
      const body: Record<string, string> = {};
      if (filterCountry !== 'all') body.country_code = filterCountry;

      const res = await fetch('/api/registry/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      toast.success(`Merged ${json.merged}: ${json.created} new, ${json.updated} updated`);
      fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Merge failed');
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const csvText = await file.text();
      const res = await fetch('/api/registry/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Import failed');
      toast.success(`Imported ${json.imported} rows (High: ${json.confidence_tiers.high}, Med: ${json.confidence_tiers.medium}, Low: ${json.confidence_tiers.low})`);
      fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleEnrichSave = async (id: string) => {
    const edits = enrichEdits[id];
    if (!edits) return;
    try {
      const res = await fetch('/api/registry/enrich', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...edits }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Enrichment saved');
      setEnrichEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
      fetchRows();
    } catch {
      toast.error('Failed to save enrichment');
    }
  };

  const getEmpLabel = (row: RegistryRow) => {
    if (row.country_code === 'FR' && row.employee_band) return FR_EMP_LABELS[row.employee_band] ?? row.employee_band;
    return row.employee_estimate > 0 ? String(row.employee_estimate) : '—';
  };

  const getActivityLabel = (code: string | null) => {
    if (!code) return '—';
    return NAF_LABELS[code] ?? code;
  };

  const getCompanyAge = (founded: string | null) => {
    if (!founded) return null;
    const years = Math.floor((Date.now() - new Date(founded).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    return years > 0 ? years : null;
  };

  // ─── Render ───

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <Navbar />

      <div style={sPage}>
      {/* Header */}
      <div style={sHeader}>
        <div>
          <div style={sTitle}>Country-wise Registry Review</div>
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
            {total} companies{filterCountry !== 'all' ? ` in ${filterCountry}` : ''} · {filterStatus !== 'all' ? filterStatus : 'all statuses'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files?.[0]) handleImport(e.target.files[0]); }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            style={sBtn('#EEF2FF', '#4338CA', '#818CF8')}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
        </div>
      </div>

      {/* ── Scoring Rules (collapsible) ── */}
      <ScoringRulesPanel />

      {/* Filters */}
      <div style={sFilterBar}>
        <div style={sFilterGroup}>
          <label style={sFilterLabel}>Country</label>
          <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)} style={sSelect}>
            <option value="all">All Countries</option>
            {countries.map(c => (
              <option key={c} value={c}>{COUNTRY_FLAGS[c] ?? ''} {c}</option>
            ))}
          </select>
        </div>
        <div style={sFilterGroup}>
          <label style={sFilterLabel}>Min Score</label>
          <select value={filterMinScore} onChange={e => setFilterMinScore(Number(e.target.value))} style={sSelect}>
            {SCORE_TIERS.map(t => (
              <option key={t.min} value={t.min}>{t.label}</option>
            ))}
          </select>
        </div>
        <div style={sFilterGroup}>
          <label style={sFilterLabel}>Confidence</label>
          <select value={filterConfidence} onChange={e => setFilterConfidence(e.target.value)} style={sSelect}>
            <option value="all">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div style={sFilterGroup}>
          <label style={sFilterLabel}>Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={sSelect}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="merged">Merged</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {/* Action Bar */}
      <div style={sActionBar}>
        <span style={{ fontSize: 12, color: '#6B7280' }}>
          {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'None selected'}
        </span>
        <button
          onClick={() => handleBulkReview('approved')}
          disabled={selectedIds.size === 0}
          style={{ ...sBtn('#DCFCE7', '#15803D', '#86EFAC'), opacity: selectedIds.size === 0 ? 0.5 : 1 }}
        >
          ✓ Approve
        </button>
        <button
          onClick={() => handleBulkReview('rejected')}
          disabled={selectedIds.size === 0}
          style={{ ...sBtn('#FEE2E2', '#991B1B', '#FCA5A5'), opacity: selectedIds.size === 0 ? 0.5 : 1 }}
        >
          ✗ Reject
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleMerge}
          style={sBtn('#DBEAFE', '#1D4ED8', '#93C5FD')}
        >
          → Merge Approved to Partners
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>No companies match the selected filters</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={sTable}>
            <thead>
              <tr>
                <th style={{ ...sTH, width: 32 }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === rows.length && rows.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th style={{ ...sTH, width: '22%' }}>Company</th>
                <th style={{ ...sTH, width: 50 }}>Country</th>
                <th style={{ ...sTH, width: 60 }}>Score</th>
                <th style={{ ...sTH, width: 55 }}>Conf.</th>
                <th style={{ ...sTH, width: 70 }}>Employees</th>
                <th style={{ ...sTH, width: '16%' }}>Activity</th>
                <th style={{ ...sTH, width: 90 }}>Dedup</th>
                <th style={{ ...sTH, width: 70 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const conf = CONFIDENCE_COLORS[row.confidence];
                const stat = STATUS_COLORS[row.qa_status] ?? STATUS_COLORS.pending;
                const isExpanded = expandedId === row.id;
                const age = getCompanyAge(row.founded_date);
                const bd = row.score_breakdown;

                return (
                  <React.Fragment key={row.id}>
                    <tr
                      style={{ cursor: 'pointer', transition: 'background 0.1s' }}
                      onClick={() => setExpandedId(isExpanded ? null : row.id)}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={sTD} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleSelect(row.id)}
                        />
                      </td>
                      <td style={sTD}>
                        <div style={{ fontWeight: 600, color: '#111827' }}>{row.company_name}</div>
                        {row.trade_name && row.trade_name !== row.company_name && (
                          <div style={{ fontSize: 11, color: '#9CA3AF' }}>{row.trade_name}</div>
                        )}
                      </td>
                      <td style={sTD}>
                        <span style={{ fontSize: 13 }}>{COUNTRY_FLAGS[row.country_code] ?? ''} {row.country_code}</span>
                      </td>
                      <td style={sTD}>
                        <span style={{
                          fontWeight: 700, fontSize: 14,
                          color: row.composite_score >= 30 ? '#15803D' : row.composite_score >= 20 ? '#1D4ED8' : '#6B7280',
                        }}>
                          {row.composite_score}
                        </span>
                      </td>
                      <td style={sTD}>
                        <span style={sPill(conf.bg, conf.color)}>{conf.label}</span>
                      </td>
                      <td style={{ ...sTD, fontSize: 12 }}>{getEmpLabel(row)}</td>
                      <td style={{ ...sTD, fontSize: 12, color: '#374151' }}>{getActivityLabel(row.activity_code)}</td>
                      <td style={sTD}>
                        {row.dedup.in_partners ? (
                          <span style={sPill('#DCFCE7', '#15803D')}>✓ Partner</span>
                        ) : row.dedup.in_discovered ? (
                          <span style={sPill('#FEF3C7', '#92400E')}>⚠ Discovered</span>
                        ) : (
                          <span style={sPill('#F3F4F6', '#6B7280')}>— New</span>
                        )}
                      </td>
                      <td style={sTD}>
                        <span style={sPill(stat.bg, stat.color)}>
                          {row.qa_status.charAt(0).toUpperCase() + row.qa_status.slice(1)}
                        </span>
                      </td>
                    </tr>

                    {/* ── Expanded Row ── */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={9} style={{ padding: 0 }}>
                          <div style={sExpandedRow}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                              {/* Left: Score Breakdown */}
                              <div>
                                <div style={sSectionLabel}>Composite Score Analysis</div>
                                <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 6, padding: '12px 14px' }}>
                                  <div style={{ ...sBreakdownRow, fontWeight: 700, borderBottom: '1px solid #E5E7EB', paddingBottom: 6, marginBottom: 4 }}>
                                    <span>Component</span>
                                    <span>Points</span>
                                  </div>

                                  {/* Relevance section */}
                                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', marginTop: 6, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    Relevance
                                  </div>
                                  <div style={sBreakdownRow}>
                                    <span>Activity code ({row.activity_code ?? '—'})</span>
                                    <span style={{ fontWeight: 600 }}>{bd?.naf_points ?? 0}</span>
                                  </div>
                                  <div style={sBreakdownRow}>
                                    <span>Name keywords</span>
                                    <span style={{ fontWeight: 600 }}>{bd?.name_keyword_points ?? 0}</span>
                                  </div>
                                  <div style={sBreakdownRow}>
                                    <span>Name penalties</span>
                                    <span style={{ fontWeight: 600, color: (bd?.name_penalty_points ?? 0) < 0 ? '#DC2626' : undefined }}>
                                      {bd?.name_penalty_points ?? 0}
                                    </span>
                                  </div>
                                  <div style={{ ...sBreakdownRow, fontWeight: 600, color: '#4338CA', borderTop: '1px dashed #E5E7EB', paddingTop: 4 }}>
                                    <span>Relevance subtotal</span>
                                    <span>{bd?.relevance_total ?? 0}</span>
                                  </div>

                                  {/* Establishment section */}
                                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', marginTop: 10, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    Establishment
                                  </div>
                                  <div style={sBreakdownRow}>
                                    <span>Employee size ({getEmpLabel(row)})</span>
                                    <span style={{ fontWeight: 600 }}>{bd?.employee_points ?? 0}</span>
                                  </div>
                                  <div style={sBreakdownRow}>
                                    <span>Company age ({age ? `${age}yr` : '—'})</span>
                                    <span style={{ fontWeight: 600 }}>{bd?.age_points ?? 0}</span>
                                  </div>
                                  <div style={sBreakdownRow}>
                                    <span>Category ({row.company_category ?? '—'})</span>
                                    <span style={{ fontWeight: 600 }}>{bd?.category_points ?? 0}</span>
                                  </div>
                                  <div style={sBreakdownRow}>
                                    <span>Legal form ({row.legal_form_code ?? '—'})</span>
                                    <span style={{ fontWeight: 600 }}>{bd?.legal_form_points ?? 0}</span>
                                  </div>
                                  <div style={{ ...sBreakdownRow, fontWeight: 600, color: '#4338CA', borderTop: '1px dashed #E5E7EB', paddingTop: 4 }}>
                                    <span>Establishment subtotal</span>
                                    <span>{bd?.establishment_total ?? 0}</span>
                                  </div>

                                  {/* Total */}
                                  <div style={{ ...sBreakdownRow, fontWeight: 700, fontSize: 13, color: '#111827', borderTop: '2px solid #E5E7EB', paddingTop: 6, marginTop: 6 }}>
                                    <span>Total (original composite)</span>
                                    <span>{row.composite_score}</span>
                                  </div>

                                  {/* Flags */}
                                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                    <span style={{ fontSize: 11, color: '#6B7280' }}>
                                      Match: <strong>{bd?.match_keyword ?? row.match_keyword ?? '—'}</strong>
                                    </span>
                                    <span style={sPill(conf.bg, conf.color)}>
                                      Confidence: {conf.label}
                                    </span>
                                    {bd?.is_false_positive_uav && (
                                      <span style={sPill('#FEE2E2', '#991B1B')}>UAV False Positive</span>
                                    )}
                                    {bd?.is_blacklisted_naf && (
                                      <span style={sPill('#FEE2E2', '#991B1B')}>Blacklisted Sector</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Right: Details + Enrichment */}
                              <div>
                                <div style={sSectionLabel}>Registry Details</div>
                                <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 6, padding: '12px 14px', marginBottom: 16 }}>
                                  <div style={sBreakdownRow}>
                                    <span style={{ color: '#6B7280' }}>Registry ID</span>
                                    <span style={{ fontWeight: 600 }}>{row.registry_id}</span>
                                  </div>
                                  <div style={sBreakdownRow}>
                                    <span style={{ color: '#6B7280' }}>Activity Code</span>
                                    <span>{row.activity_code ?? '—'} · {getActivityLabel(row.activity_code)}</span>
                                  </div>
                                  <div style={sBreakdownRow}>
                                    <span style={{ color: '#6B7280' }}>Legal Form</span>
                                    <span>{row.legal_form_code ?? '—'}</span>
                                  </div>
                                  <div style={sBreakdownRow}>
                                    <span style={{ color: '#6B7280' }}>Founded</span>
                                    <span>{row.founded_date ?? '—'}{age ? ` (${age} years)` : ''}</span>
                                  </div>
                                  <div style={sBreakdownRow}>
                                    <span style={{ color: '#6B7280' }}>City</span>
                                    <span style={{ fontWeight: row.city ? 600 : 400 }}>{row.city ?? '—'}</span>
                                  </div>
                                  {row.address && (
                                    <div style={sBreakdownRow}>
                                      <span style={{ color: '#6B7280' }}>Address</span>
                                      <span>{row.address}</span>
                                    </div>
                                  )}
                                  <div style={sBreakdownRow}>
                                    <span style={{ color: '#6B7280' }}>Signal Source</span>
                                    <span>{row.signal_source ?? '—'}</span>
                                  </div>
                                  {row.notes && (
                                    <div style={sBreakdownRow}>
                                      <span style={{ color: '#6B7280' }}>Notes</span>
                                      <span>{row.notes}</span>
                                    </div>
                                  )}
                                </div>

                                <div style={sSectionLabel}>Enrichment</div>
                                <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 6, padding: '12px 14px' }}>
                                  <div style={{ marginBottom: 8 }}>
                                    <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>Website</label>
                                    <input
                                      type="text"
                                      placeholder="https://..."
                                      value={enrichEdits[row.id]?.website ?? row.website ?? ''}
                                      onChange={e => setEnrichEdits(prev => ({
                                        ...prev,
                                        [row.id]: { ...prev[row.id], website: e.target.value },
                                      }))}
                                      onClick={e => e.stopPropagation()}
                                      style={sInput}
                                    />
                                  </div>
                                  <div style={{ marginBottom: 8 }}>
                                    <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>LinkedIn</label>
                                    <input
                                      type="text"
                                      placeholder="https://linkedin.com/company/..."
                                      value={enrichEdits[row.id]?.linkedin ?? row.linkedin ?? ''}
                                      onChange={e => setEnrichEdits(prev => ({
                                        ...prev,
                                        [row.id]: { ...prev[row.id], linkedin: e.target.value },
                                      }))}
                                      onClick={e => e.stopPropagation()}
                                      style={sInput}
                                    />
                                  </div>
                                  {enrichEdits[row.id] && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleEnrichSave(row.id); }}
                                      style={sBtn('#DCFCE7', '#15803D', '#86EFAC')}
                                    >
                                      Save Enrichment
                                    </button>
                                  )}
                                </div>

                                {/* QA Notes */}
                                <div style={{ marginTop: 12 }}>
                                  <label style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>QA Notes</label>
                                  <div style={{ fontSize: 12, color: '#374151', fontStyle: row.qa_notes ? 'normal' : 'italic' }}>
                                    {row.qa_notes || 'No notes'}
                                  </div>
                                </div>
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
      )}

      {/* Pagination bar */}
      {!loading && total > 0 && (
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6B7280' }}>
            <span>Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total}</span>
            <span style={{ color: '#D1D5DB' }}>|</span>
            <span>High: {rows.filter(r => r.confidence === 'high').length}</span>
            <span>Med: {rows.filter(r => r.confidence === 'medium').length}</span>
            <span>Low: {rows.filter(r => r.confidence === 'low').length}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 11, color: '#6B7280' }}>Per page:</label>
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              style={{ ...sSelect, padding: '4px 8px', fontSize: 12 }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                style={{ ...sBtn('#fff', page === 1 ? '#D1D5DB' : '#374151', '#E5E7EB'), padding: '4px 8px', fontSize: 11 }}
              >
                ««
              </button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ ...sBtn('#fff', page === 1 ? '#D1D5DB' : '#374151', '#E5E7EB'), padding: '4px 10px', fontSize: 11 }}
              >
                ‹ Prev
              </button>
              <span style={{ fontSize: 12, color: '#374151', padding: '4px 10px', fontWeight: 600 }}>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{ ...sBtn('#fff', page === totalPages ? '#D1D5DB' : '#374151', '#E5E7EB'), padding: '4px 10px', fontSize: 11 }}
              >
                Next ›
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                style={{ ...sBtn('#fff', page === totalPages ? '#D1D5DB' : '#374151', '#E5E7EB'), padding: '4px 8px', fontSize: 11 }}
              >
                »»
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
