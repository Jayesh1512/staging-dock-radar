"use client";
import React, { useEffect, useState, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

interface LeaderboardArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string | null;
  relevance_score: number;
  signal_type: string;
}

interface LeaderboardContact {
  name: string;
  role: string | null;
  organization: string | null;
}

interface LeaderboardCompany {
  name: string;
  normalized_name: string;
  countries: string[];
  post_count: number;
  avg_score: number;
  max_score: number;
  trend: 'rising' | 'stable' | 'declining' | 'new';
  sources: string[];
  last_post_at: string | null;
  contacts: LeaderboardContact[];
  articles: LeaderboardArticle[];
  website: string | null;
  linkedin: string | null;
  in_pipeline: boolean;
  /** Current stage: pipeline stage, 'partner' (known FlytBase partner), or null (not tracked) */
  stage: 'partner' | 'prospect' | 'connecting_linkedin' | 'connecting_email' | 'scheduling_meeting' | 'sent_to_crm' | 'lost_archived' | null;
}

// ── Sample Data ──────────────────────────────────────────────────────────────

const SAMPLE_DATA: LeaderboardCompany[] = [
  {
    name: 'Aerosmart', normalized_name: 'aerosmart', countries: ['France'],
    post_count: 8, avg_score: 72, max_score: 85, trend: 'rising',
    sources: ['linkedin', 'google_news'], last_post_at: '2026-03-25T10:00:00Z',
    website: 'https://aerosmart.fr', linkedin: 'https://linkedin.com/company/aerosmart',
    in_pipeline: false, stage: null,
    contacts: [
      { name: 'Jean Dupont', role: 'CEO', organization: 'Aerosmart' },
      { name: 'Marie Laurent', role: 'Operations Director', organization: 'Aerosmart' },
    ],
    articles: [
      { id: 'a1', title: 'DJI Dock 2 deployed for autonomous solar farm inspections across France', url: '#', source: 'linkedin', published_at: '2026-03-25T10:00:00Z', relevance_score: 75, signal_type: 'DEPLOYMENT' },
      { id: 'a2', title: 'Aerosmart expands drone-in-a-box fleet with DJI Dock for energy sector', url: '#', source: 'linkedin', published_at: '2026-03-18T10:00:00Z', relevance_score: 68, signal_type: 'EXPANSION' },
      { id: 'a3', title: 'Partnership with TotalEnergies for pipeline monitoring using DJI Dock 3', url: '#', source: 'google_news', published_at: '2026-03-08T10:00:00Z', relevance_score: 72, signal_type: 'PARTNERSHIP' },
      { id: 'a4', title: 'Aerosmart showcases autonomous inspection at Drone Paris 2026', url: '#', source: 'google_news', published_at: '2026-02-28T10:00:00Z', relevance_score: 65, signal_type: 'OTHER' },
    ],
  },
  {
    name: 'AERONEX', normalized_name: 'aeronex', countries: ['France'],
    post_count: 6, avg_score: 68, max_score: 95, trend: 'rising',
    sources: ['linkedin'], last_post_at: '2026-03-22T10:00:00Z',
    website: 'https://aeronex.fr', linkedin: 'https://linkedin.com/company/aeronex',
    in_pipeline: true, stage: 'connecting_linkedin',
    contacts: [{ name: 'Pierre Martin', role: 'Founder & CTO', organization: 'AERONEX' }],
    articles: [
      { id: 'b1', title: 'AERONEX completes DJI Dock 3 deployment for pipeline monitoring with TotalEnergies', url: '#', source: 'linkedin', published_at: '2026-03-22T10:00:00Z', relevance_score: 95, signal_type: 'DEPLOYMENT' },
      { id: 'b2', title: 'Autonomous offshore inspection capabilities with DJI Dock 3', url: '#', source: 'linkedin', published_at: '2026-03-12T10:00:00Z', relevance_score: 62, signal_type: 'DEPLOYMENT' },
    ],
  },
  {
    name: 'Escadrone', normalized_name: 'escadrone', countries: ['France'],
    post_count: 5, avg_score: 61, max_score: 74, trend: 'stable',
    sources: ['linkedin', 'google_news'], last_post_at: '2026-03-26T10:00:00Z',
    website: 'https://escadrone.com', linkedin: 'https://linkedin.com/company/escadrone',
    in_pipeline: false, stage: 'partner',
    contacts: [
      { name: 'Luc Bernard', role: 'CEO', organization: 'Escadrone' },
      { name: 'Sophie Mercier', role: 'Sales Manager', organization: 'Escadrone' },
      { name: 'Antoine Girard', role: 'Pilot Lead', organization: 'Escadrone' },
    ],
    articles: [
      { id: 'c1', title: 'Escadrone adds DJI Dock 2 to construction monitoring portfolio', url: '#', source: 'linkedin', published_at: '2026-03-26T10:00:00Z', relevance_score: 74, signal_type: 'EXPANSION' },
      { id: 'c2', title: 'DJI Dock for infrastructure inspection — Escadrone case study', url: '#', source: 'google_news', published_at: '2026-03-14T10:00:00Z', relevance_score: 58, signal_type: 'DEPLOYMENT' },
    ],
  },
  {
    name: 'DroneVolt', normalized_name: 'dronevolt', countries: ['France'],
    post_count: 4, avg_score: 55, max_score: 68, trend: 'declining',
    sources: ['google_news'], last_post_at: '2026-03-15T10:00:00Z',
    website: 'https://dronevolt.com', linkedin: null,
    in_pipeline: false, stage: 'prospect',
    contacts: [{ name: 'Marc Lefebvre', role: 'VP Sales', organization: 'DroneVolt' }],
    articles: [
      { id: 'd1', title: 'DroneVolt deploys DJI Dock for security monitoring at industrial site', url: '#', source: 'google_news', published_at: '2026-03-15T10:00:00Z', relevance_score: 68, signal_type: 'DEPLOYMENT' },
    ],
  },
  {
    name: 'Abot', normalized_name: 'abot', countries: ['France'],
    post_count: 3, avg_score: 58, max_score: 65, trend: 'new',
    sources: ['linkedin'], last_post_at: '2026-03-24T10:00:00Z',
    website: null, linkedin: 'https://linkedin.com/company/abot-fr',
    in_pipeline: false, stage: null,
    contacts: [{ name: 'Thomas Moreau', role: 'Technical Director', organization: 'Abot' }],
    articles: [
      { id: 'e1', title: 'Abot launches DJI Dock rental service for agricultural monitoring', url: '#', source: 'linkedin', published_at: '2026-03-24T10:00:00Z', relevance_score: 65, signal_type: 'DEPLOYMENT' },
    ],
  },
  {
    name: 'FlyingEye', normalized_name: 'flyingeye', countries: ['Netherlands'],
    post_count: 3, avg_score: 64, max_score: 72, trend: 'rising',
    sources: ['linkedin'], last_post_at: '2026-03-23T10:00:00Z',
    website: 'https://flyingeye.nl', linkedin: 'https://linkedin.com/company/flyingeye',
    in_pipeline: false, stage: 'scheduling_meeting',
    contacts: [
      { name: 'Jan de Vries', role: 'CEO', organization: 'FlyingEye' },
      { name: 'Kees van den Berg', role: 'Operations Lead', organization: 'FlyingEye' },
    ],
    articles: [
      { id: 'f1', title: 'FlyingEye trials DJI Dock 2 for wind farm inspections in North Sea', url: '#', source: 'linkedin', published_at: '2026-03-23T10:00:00Z', relevance_score: 72, signal_type: 'DEPLOYMENT' },
    ],
  },
  {
    name: 'Drone Harmony', normalized_name: 'drone harmony', countries: ['Netherlands'],
    post_count: 2, avg_score: 52, max_score: 58, trend: 'stable',
    sources: ['linkedin', 'google_news'], last_post_at: '2026-03-19T10:00:00Z',
    website: 'https://droneharmony.com', linkedin: 'https://linkedin.com/company/droneharmony',
    in_pipeline: false, stage: null,
    contacts: [],
    articles: [
      { id: 'g1', title: 'Drone Harmony integrates DJI Dock for automated flight planning', url: '#', source: 'linkedin', published_at: '2026-03-19T10:00:00Z', relevance_score: 58, signal_type: 'PARTNERSHIP' },
    ],
  },
  {
    name: 'SkyWatch Drones', normalized_name: 'skywatch drones', countries: ['UK'],
    post_count: 2, avg_score: 48, max_score: 55, trend: 'new',
    sources: ['google_news'], last_post_at: '2026-03-21T10:00:00Z',
    website: null, linkedin: null,
    in_pipeline: false, stage: null,
    contacts: [],
    articles: [
      { id: 'h1', title: 'SkyWatch Drones wins contract for DJI Dock deployment at UK port', url: '#', source: 'google_news', published_at: '2026-03-21T10:00:00Z', relevance_score: 55, signal_type: 'CONTRACT' },
    ],
  },
  {
    name: 'Altametris', normalized_name: 'altametris', countries: ['France'],
    post_count: 2, avg_score: 70, max_score: 78, trend: 'stable',
    sources: ['google_news'], last_post_at: '2026-03-13T10:00:00Z',
    website: 'https://altametris.com', linkedin: 'https://linkedin.com/company/altametris',
    in_pipeline: false, stage: 'sent_to_crm',
    contacts: [{ name: 'Claire Dubois', role: 'Innovation Lead', organization: 'Altametris' }],
    articles: [
      { id: 'i1', title: 'Altametris deploys DJI Dock for railway inspection across France', url: '#', source: 'google_news', published_at: '2026-03-13T10:00:00Z', relevance_score: 78, signal_type: 'DEPLOYMENT' },
    ],
  },
  {
    name: 'Azur Drones', normalized_name: 'azur drones', countries: ['France'],
    post_count: 1, avg_score: 75, max_score: 75, trend: 'declining',
    sources: ['linkedin'], last_post_at: '2026-03-05T10:00:00Z',
    website: 'https://azurdrones.com', linkedin: 'https://linkedin.com/company/azur-drones',
    in_pipeline: false, stage: null,
    contacts: [{ name: 'Olivier Petit', role: 'Head of Partnerships', organization: 'Azur Drones' }],
    articles: [
      { id: 'j1', title: 'Azur Drones secures DJI Dock deployment for perimeter security', url: '#', source: 'linkedin', published_at: '2026-03-05T10:00:00Z', relevance_score: 75, signal_type: 'DEPLOYMENT' },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (d === 0) return 'today';
  if (d === 1) return '1d ago';
  return `${d}d ago`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function sourceLabel(s: string): string {
  if (s === 'linkedin') return 'LI';
  if (s === 'google_news') return 'GN';
  return s.toUpperCase().slice(0, 2);
}

const TREND_STYLES: Record<string, { bg: string; color: string; label: string; icon: string }> = {
  rising:    { bg: '#D1FAE5', color: '#059669', label: 'Rising',    icon: '▲' },
  stable:    { bg: '#F3F4F6', color: '#6B7280', label: 'Stable',    icon: '─' },
  declining: { bg: '#FEE2E2', color: '#DC2626', label: 'Declining', icon: '▼' },
  new:       { bg: '#FEF3C7', color: '#D97706', label: 'New',       icon: '★' },
};

const SCORE_STYLE = (score: number) => {
  if (score >= 75) return { bg: '#D1FAE5', color: '#059669' };
  if (score >= 50) return { bg: '#DBEAFE', color: '#1D4ED8' };
  if (score >= 25) return { bg: '#FEF3C7', color: '#D97706' };
  return { bg: '#F3F4F6', color: '#6B7280' };
};

const STAGE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  partner:              { bg: '#DBEAFE', color: '#1D4ED8', label: 'Partner' },
  prospect:             { bg: '#F3F4F6', color: '#6B7280', label: 'Prospect' },
  connecting_linkedin:  { bg: '#FEF3C7', color: '#D97706', label: 'LinkedIn' },
  connecting_email:     { bg: '#FEF3C7', color: '#D97706', label: 'Email' },
  scheduling_meeting:   { bg: '#D1FAE5', color: '#059669', label: 'Meeting' },
  sent_to_crm:          { bg: '#15803D', color: '#fff',    label: 'In CRM' },
  lost_archived:        { bg: '#FEE2E2', color: '#DC2626', label: 'Archived' },
};

type SortKey = 'post_count' | 'avg_score' | 'last_post_at' | 'contacts';
type SortDir = 'asc' | 'desc';

// ── Component ────────────────────────────────────────────────────────────────

export function SocialLeaderboard() {
  const [companies, setCompanies] = useState<LeaderboardCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState('60');
  const [trendFilter, setTrendFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('post_count');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Fetch from API; fall back to sample data if empty
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/company-activity?period=${periodFilter}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setCompanies(SAMPLE_DATA); return; }
        const rows = (data.companies || []) as LeaderboardCompany[];
        setCompanies(rows.length > 0 ? rows : SAMPLE_DATA);
      })
      .catch(() => { setError('Failed to load — showing sample data'); setCompanies(SAMPLE_DATA); })
      .finally(() => setLoading(false));
  }, [periodFilter]);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => d === 'desc' ? 'asc' : 'desc'); return key; }
      setSortDir('desc');
      return key;
    });
  }, []);

  // Filter
  const filtered = companies.filter(c => {
    if (trendFilter !== 'all' && c.trend !== trendFilter) return false;
    if (countryFilter !== 'all' && !c.countries.includes(countryFilter)) return false;
    if (sourceFilter !== 'all' && !c.sources.includes(sourceFilter)) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let va: number, vb: number;
    switch (sortKey) {
      case 'post_count': va = a.post_count; vb = b.post_count; break;
      case 'avg_score': va = a.avg_score; vb = b.avg_score; break;
      case 'contacts': va = a.contacts.length; vb = b.contacts.length; break;
      case 'last_post_at':
        va = a.last_post_at ? new Date(a.last_post_at).getTime() : 0;
        vb = b.last_post_at ? new Date(b.last_post_at).getTime() : 0;
        break;
      default: va = 0; vb = 0;
    }
    return sortDir === 'desc' ? vb - va : va - vb;
  });

  // KPIs
  const totalArticles = companies.reduce((s, c) => s + c.post_count, 0);
  const risingCount = companies.filter(c => c.trend === 'rising').length;
  const newCount = companies.filter(c => c.trend === 'new').length;
  const avgScore = companies.length > 0 ? Math.round(companies.reduce((s, c) => s + c.avg_score, 0) / companies.length) : 0;
  const reachable = companies.filter(c => c.website || c.linkedin).length;

  const allCountries = [...new Set(companies.flatMap(c => c.countries))].sort();

  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Loading */}
      {loading && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--dr-text-muted)', fontSize: 13 }}>
          Loading company activity…
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div style={{ padding: '10px 14px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 12, color: '#92400E' }}>
          {error}
        </div>
      )}

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {[
          { label: 'TRACKED COMPANIES', value: companies.length, sub: 'with 1+ scored article' },
          { label: 'RISING', value: risingCount, sub: 'more posts than prior period', valueColor: '#059669' },
          { label: 'NEW (14D)', value: newCount, sub: 'first seen in last 2 weeks', valueColor: '#D97706' },
          { label: 'AVG SCORE', value: avgScore, sub: 'across all tracked articles' },
          { label: 'REACHABLE', value: `${reachable}/${companies.length}`, sub: 'have website or LinkedIn' },
        ].map((kpi, i) => (
          <div key={i} style={{
            padding: '14px 16px', borderRadius: 10, border: '1px solid var(--dr-border)', background: '#F9FAFB',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dr-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{kpi.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: (kpi as any).valueColor ?? 'var(--dr-text)', marginTop: 2 }}>{kpi.value}</div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--dr-text-muted)' }}>Period:</span>
        <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)} style={sSelect}>
          <option value="30">Last 30 days</option>
          <option value="60">Last 60 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time</option>
        </select>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--dr-text-muted)', marginLeft: 8 }}>Trend:</span>
        <select value={trendFilter} onChange={e => setTrendFilter(e.target.value)} style={sSelect}>
          <option value="all">All</option>
          <option value="rising">Rising</option>
          <option value="stable">Stable</option>
          <option value="declining">Declining</option>
          <option value="new">New</option>
        </select>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--dr-text-muted)', marginLeft: 8 }}>Country:</span>
        <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} style={sSelect}>
          <option value="all">All</option>
          {allCountries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--dr-text-muted)', marginLeft: 8 }}>Source:</span>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={sSelect}>
          <option value="all">All</option>
          <option value="linkedin">LinkedIn</option>
          <option value="google_news">Google News</option>
        </select>
        <input
          type="text"
          placeholder="Search company..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...sSelect, width: 170, marginLeft: 'auto' }}
        />
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--dr-border)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F9FAFB' }}>
              <th style={{ ...sTh, width: 30, cursor: 'default' }}></th>
              <th style={sTh}>#</th>
              <th style={{ ...sTh, textAlign: 'left' }}>Company</th>
              <th style={sTh} onClick={() => handleSort('post_count')}>Posts{sortArrow('post_count')}</th>
              <th style={sTh} onClick={() => handleSort('avg_score')}>Avg Score{sortArrow('avg_score')}</th>
              <th style={{ ...sTh, cursor: 'default' }}>Trend</th>
              <th style={{ ...sTh, cursor: 'default' }}>Sources</th>
              <th style={sTh} onClick={() => handleSort('last_post_at')}>Last Post{sortArrow('last_post_at')}</th>
              <th style={sTh} onClick={() => handleSort('contacts')}>Contacts{sortArrow('contacts')}</th>
              <th style={{ ...sTh, cursor: 'default' }}>Stage</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((company, idx) => {
              const isExpanded = expandedRow === company.normalized_name;
              const trend = TREND_STYLES[company.trend] ?? TREND_STYLES.stable;
              return (
                <React.Fragment key={company.normalized_name}>
                  <tr
                    onClick={() => setExpandedRow(isExpanded ? null : company.normalized_name)}
                    style={{
                      cursor: 'pointer',
                      background: isExpanded ? '#F0FDF4' : undefined,
                      borderBottom: isExpanded ? 'none' : undefined,
                    }}
                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#F9FAFB'; }}
                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = ''; }}
                  >
                    <td style={sTd}>
                      <span style={{
                        fontSize: 12, color: isExpanded ? '#15803D' : '#9CA3AF',
                        transition: 'transform 0.15s',
                        display: 'inline-block',
                        transform: isExpanded ? 'rotate(90deg)' : 'none',
                      }}>
                        &#9654;
                      </span>
                    </td>
                    <td style={sTd}><span style={{ fontWeight: 700, color: '#9CA3AF', fontSize: 12 }}>{idx + 1}</span></td>
                    <td style={sTd}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--dr-text)' }}>
                            {company.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--dr-text-muted)' }}>{company.countries.join(', ')}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ ...sTd, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{company.post_count}</td>
                    <td style={{ ...sTd, textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', width: Math.max(20, company.avg_score * 0.6), height: 6,
                        borderRadius: 3, background: '#22C55E', verticalAlign: 'middle', marginRight: 6,
                      }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{company.avg_score}</span>
                    </td>
                    <td style={sTd}>
                      <span style={{
                        display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '2px 7px',
                        borderRadius: 4, background: trend.bg, color: trend.color,
                      }}>
                        {trend.icon} {trend.label}
                      </span>
                    </td>
                    <td style={sTd}>
                      {company.sources.map(s => (
                        <span key={s} style={{
                          display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '2px 7px',
                          borderRadius: 4, marginRight: 3,
                          background: s === 'linkedin' ? '#DBEAFE' : '#D1FAE5',
                          color: s === 'linkedin' ? '#1D4ED8' : '#059669',
                        }}>
                          {sourceLabel(s)}
                        </span>
                      ))}
                    </td>
                    <td style={sTd}><span style={{ fontSize: 12, color: 'var(--dr-text-muted)' }}>{daysAgo(company.last_post_at)}</span></td>
                    <td style={{ ...sTd, textAlign: 'center' }}>
                      <span style={{ fontSize: 12, color: company.contacts.length > 0 ? '#374151' : '#D1D5DB' }}>
                        {company.contacts.length}
                      </span>
                    </td>
                    <td style={sTd}>
                      {company.stage ? (() => {
                        const st = STAGE_STYLES[company.stage];
                        return st ? (
                          <span style={{
                            display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '2px 7px',
                            borderRadius: 4, background: st.bg, color: st.color,
                          }}>
                            {st.label}
                          </span>
                        ) : null;
                      })() : (
                        <span style={{ fontSize: 11, color: '#D1D5DB' }}>—</span>
                      )}
                    </td>
                  </tr>

                  {/* Expanded row */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={10} style={{ padding: 0, background: '#FAFDF7', borderBottom: '1px solid #E5E7EB' }}>
                        <div style={{ padding: '16px 20px 16px 50px' }}>

                          {/* Timeline dots */}
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--dr-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                              Activity Timeline ({periodFilter === 'all' ? 'all time' : `${periodFilter}d`})
                            </div>
                            <div style={{
                              position: 'relative', height: 28, background: '#F3F4F6', borderRadius: 6,
                              padding: '0 8px', display: 'flex', alignItems: 'center',
                            }}>
                              {company.articles.map((art, ai) => {
                                const total = company.articles.length;
                                const pct = total > 1 ? (ai / (total - 1)) * 90 + 5 : 50;
                                return (
                                  <div
                                    key={art.id}
                                    title={`${formatDate(art.published_at)} — ${art.source === 'linkedin' ? 'LinkedIn' : 'Google News'} (${art.relevance_score})`}
                                    style={{
                                      position: 'absolute', left: `${pct}%`,
                                      width: 10, height: 10, borderRadius: '50%',
                                      border: '2px solid #fff', cursor: 'pointer',
                                      background: art.source === 'linkedin' ? '#3B82F6' : '#22C55E',
                                    }}
                                  />
                                );
                              })}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                              <span style={{ fontSize: 9, color: '#9CA3AF' }}>
                                {company.articles.length > 0 ? formatDate(company.articles[company.articles.length - 1]?.published_at) : ''}
                              </span>
                              <span style={{ fontSize: 9, color: '#9CA3AF' }}>
                                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#3B82F6', marginRight: 3, verticalAlign: 'middle' }} />LI
                                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#22C55E', marginLeft: 8, marginRight: 3, verticalAlign: 'middle' }} />GN
                              </span>
                              <span style={{ fontSize: 9, color: '#9CA3AF' }}>
                                {company.articles.length > 0 ? formatDate(company.articles[0]?.published_at) : ''}
                              </span>
                            </div>
                          </div>

                          {/* Articles */}
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--dr-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                              Recent Articles
                            </div>
                            {company.articles.map(art => {
                              const sc = SCORE_STYLE(art.relevance_score);
                              return (
                                <div key={art.id} style={{
                                  display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
                                  borderBottom: '1px solid #F3F4F6', fontSize: 12,
                                }}>
                                  <span style={{
                                    fontWeight: 700, fontSize: 13, minWidth: 28, textAlign: 'center',
                                    padding: '2px 6px', borderRadius: 4, background: sc.bg, color: sc.color,
                                  }}>
                                    {art.relevance_score}
                                  </span>
                                  <span style={{ color: '#9CA3AF', minWidth: 50 }}>{formatDate(art.published_at)}</span>
                                  <a
                                    href={art.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    style={{ color: 'var(--dr-blue)', flex: 1, textDecoration: 'none', lineHeight: 1.3, fontWeight: 500 }}
                                    onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                                    onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                                  >
                                    {art.title}
                                  </a>
                                  <span style={{
                                    fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                                    background: art.source === 'linkedin' ? '#DBEAFE' : '#D1FAE5',
                                    color: art.source === 'linkedin' ? '#1D4ED8' : '#059669',
                                  }}>
                                    {sourceLabel(art.source)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          {/* Contacts */}
                          {company.contacts.length > 0 && (
                            <div style={{ marginBottom: 14 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--dr-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                                Contacts Extracted
                              </div>
                              {company.contacts.map((ct, ci) => (
                                <span key={ci} style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11,
                                  padding: '3px 8px', borderRadius: 12, background: '#F3F4F6', color: '#374151',
                                  marginRight: 6, marginBottom: 4,
                                }}>
                                  {ct.name}
                                  {ct.role && <span style={{ color: '#9CA3AF' }}>· {ct.role}</span>}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Actions */}
                          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                            {!company.in_pipeline && (
                              <button style={{ ...sBtn, background: '#15803D', color: '#fff', borderColor: '#15803D' }}>
                                + Add to Pipeline
                              </button>
                            )}
                            {company.linkedin && (
                              <a href={company.linkedin} target="_blank" rel="noopener noreferrer" style={{ ...sBtn, textDecoration: 'none' }}>
                                LinkedIn ↗
                              </a>
                            )}
                            {company.website && (
                              <a href={company.website} target="_blank" rel="noopener noreferrer" style={{ ...sBtn, textDecoration: 'none' }}>
                                Website ↗
                              </a>
                            )}
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

        {/* Footer */}
        <div style={{
          padding: '10px 14px', fontSize: 11, color: '#9CA3AF', background: '#F9FAFB',
          borderTop: '1px solid var(--dr-border)', display: 'flex', gap: 16,
        }}>
          <span>Showing <strong style={{ color: '#374151' }}>{sorted.length}</strong> companies</span>
          <span><strong style={{ color: '#059669' }}>{risingCount}</strong> rising</span>
          <span><strong style={{ color: '#D97706' }}>{newCount}</strong> new in last 14d</span>
          <span><strong style={{ color: '#374151' }}>{totalArticles}</strong> total articles</span>
          <span style={{ marginLeft: 'auto' }}>{error ? 'Showing sample data' : `Period: ${periodFilter === 'all' ? 'all time' : `${periodFilter} days`}`}</span>
        </div>
      </div>

      {/* Enrichment gap alert */}
      {(() => {
        const noWebsite = companies.filter(c => !c.website).length;
        const noLinkedin = companies.filter(c => !c.linkedin).length;
        const noContacts = companies.filter(c => c.contacts.length === 0).length;
        if (noWebsite === 0 && noLinkedin === 0 && noContacts === 0) return null;
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
            background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 12, color: '#92400E',
          }}>
            <span style={{ fontSize: 16 }}>⚠</span>
            <span>
              <strong style={{ color: '#78350F' }}>Enrichment gaps:</strong>{' '}
              {noWebsite > 0 && <>{noWebsite} missing website · </>}
              {noLinkedin > 0 && <>{noLinkedin} missing LinkedIn · </>}
              {noContacts > 0 && <>{noContacts} with 0 contacts</>}
            </span>
          </div>
        );
      })()}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const sSelect: React.CSSProperties = {
  fontSize: 12, padding: '5px 10px', borderRadius: 6,
  border: '1px solid var(--dr-border)', color: '#374151', background: '#fff', cursor: 'pointer',
};

const sTh: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase',
  letterSpacing: 0.5, padding: '10px 14px', textAlign: 'center',
  borderBottom: '1px solid var(--dr-border)', cursor: 'pointer', whiteSpace: 'nowrap',
};

const sTd: React.CSSProperties = {
  fontSize: 13, padding: '10px 14px', borderBottom: '1px solid #F3F4F6', verticalAlign: 'middle',
};

const sBtn: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 6,
  border: '1px solid var(--dr-border)', background: '#fff', color: '#374151', cursor: 'pointer',
};
