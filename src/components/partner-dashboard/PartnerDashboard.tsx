'use client';

import React, { useState, useEffect } from 'react';
import { HitListData, DspHitListEntry } from '@/lib/types';
import { toast } from 'sonner';
import PipelineBoard from '@/components/pipeline/PipelineBoard';
import { PipelineProvider, usePipeline, generateColor } from '@/components/pipeline/PipelineContext';
import type { PipelineCardData } from '@/components/pipeline/PipelineCard';

interface Partner {
  id: string;
  name: string;
  region: string;
  type: string;
  website?: string;
  linkedin?: string;
}

// Macro-region mapping for priority display (mirrors constants.ts)
const COUNTRY_TO_MACRO: Record<string, string> = {
  'US': 'Americas', 'Canada': 'Americas', 'Brazil': 'Americas', 'Mexico': 'Americas', 'Chile': 'Americas', 'North America': 'Americas',
  'UK': 'Europe', 'Germany': 'Europe', 'France': 'Europe', 'Italy': 'Europe', 'Spain': 'Europe',
  'Austria': 'Europe', 'Turkey': 'Europe', 'Lithuania': 'Europe', 'Netherlands': 'Europe',
  'UAE': 'MEA', 'Saudi Arabia': 'MEA', 'South Africa': 'MEA',
  'Singapore': 'APAC', 'Japan': 'APAC', 'Australia': 'APAC', 'South Korea': 'APAC', 'China': 'APAC', 'Indonesia': 'APAC',
  'India': 'Others',
};
const MACRO_LABELS: Record<string, string> = { 'Americas': 'HIGH', 'Europe': 'HIGH', 'MEA': 'MED', 'APAC': 'STD', 'Others': 'LOW' };

type SortConfig = { key: string; dir: 'asc' | 'desc' } | null;

function toggleSort(config: SortConfig, key: string): SortConfig {
  if (config?.key === key) return { key, dir: config.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: 'asc' };
}

function sortRows<T>(rows: T[], config: SortConfig, getValue: (row: T, key: string) => string | number): T[] {
  if (!config) return rows;
  return [...rows].sort((a, b) => {
    const va = getValue(a, config.key);
    const vb = getValue(b, config.key);
    const cmp = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va ?? '').localeCompare(String(vb ?? ''));
    return config.dir === 'asc' ? cmp : -cmp;
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getHostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function exportCsv(filename: string, rows: string[][], headers: string[]) {
  const escape = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Removed: OLD priority arrays. Now using COUNTRY_TO_MACRO / MACRO_LABELS above.

function PriorityPill({ isHigh }: { isHigh: boolean }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
      background: isHigh ? '#DCFCE7' : '#F3F4F6',
      color: isHigh ? '#15803D' : '#9CA3AF',
      letterSpacing: 0.3,
    }}>
      {isHigh ? 'HIGH' : 'STD'}
    </span>
  );
}

function RegionPriority({ countries }: { countries: string[] }) {
  const macro = countries.map(c => COUNTRY_TO_MACRO[c]).find(Boolean) ?? 'Unknown';
  const label = MACRO_LABELS[macro] ?? 'STD';
  const isHigh = label === 'HIGH';
  return (
    <div>
      <div style={{ fontSize: 12, color: '#374151', marginBottom: 4, lineHeight: 1.4 }}>
        {countries.length ? countries.join(', ') : '—'}
      </div>
      <span style={{
        display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
        background: isHigh ? '#DCFCE7' : label === 'MED' ? '#FEF3C7' : '#F3F4F6',
        color: isHigh ? '#15803D' : label === 'MED' ? '#92400E' : '#9CA3AF',
        letterSpacing: 0.3,
      }}>
        {macro}
      </span>
    </div>
  );
}

function IndustryPriority({ industries }: { industries: string[] }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: '#374151', marginBottom: 4, lineHeight: 1.4 }}>
        {industries.length ? industries.join(', ') : '—'}
      </div>
    </div>
  );
}

function SignalBadge({ type }: { type: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    DEPLOYMENT: { bg: '#DBEAFE', color: '#1D4ED8' },
    CONTRACT:   { bg: '#FEF9C3', color: '#854D0E' },
    PARTNERSHIP:{ bg: '#F3E8FF', color: '#6D28D9' },
    EXPANSION:  { bg: '#DCFCE7', color: '#15803D' },
    OTHER:      { bg: '#F3F4F6', color: '#6B7280' },
  };
  const c = colors[type] ?? colors.OTHER;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: c.bg, color: c.color, marginRight: 4 }}>
      {type}
    </span>
  );
}

function ArticleRow({ article, index }: { article: { id: string; title: string; url: string; score: number; date: string }; index: number }) {
  const dateStr = article.date ? new Date(article.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderTop: index > 0 ? '1px solid #F3F4F6' : 'none' }}>
      <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: '#DBEAFE', color: '#1D4ED8', marginTop: 1 }}>
        {article.score}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {article.url
          ? <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#1D4ED8', textDecoration: 'none', lineHeight: 1.4, display: 'block' }}
              onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
              {article.title}
            </a>
          : <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.4 }}>{article.title}</span>
        }
        {dateStr && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{dateStr}</div>}
      </div>
    </div>
  );
}

function SortHeader({
  label, sortKey, config, onSort, style,
}: {
  label: string;
  sortKey: string;
  config: SortConfig;
  onSort: (key: string) => void;
  style?: React.CSSProperties;
}) {
  const active = config?.key === sortKey;
  return (
    <th
      style={{ ...sTH, ...style, cursor: 'pointer', userSelect: 'none' as const }}
      onClick={() => onSort(sortKey)}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {label}
        <span style={{ fontSize: 8, color: active ? '#15803D' : '#CBD5E1', lineHeight: 1 }}>
          {active && config!.dir === 'asc' ? '▲' : '▼'}
        </span>
      </span>
    </th>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

const PartnerDashboard: React.FC = () => {
  return (
    <PipelineProvider>
      <PartnerDashboardInner />
    </PipelineProvider>
  );
};

const PartnerDashboardInner: React.FC = () => {
  const { cards: pipelineCards, addCard, isInPipeline } = usePipeline();
  const activePipelineCount = pipelineCards.filter(c => c.stage !== 'lost_archived').length;
  const [activeTab, setActiveTab] = useState(0);
  const [hitListData, setHitListData] = useState<HitListData | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingPartners, setSyncingPartners] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedIndustry, setSelectedIndustry] = useState('all');
  // Scoring weights removed — hit score is now macro-region-only (computed server-side)

  // ─── Sort State (one per tab) ───────────────────────────────────────────────
  const [partnerSort, setPartnerSort] = useState<SortConfig>(null);
  const [dspSort, setDspSort] = useState<SortConfig>({ key: 'score', dir: 'desc' });
  const [top25Sort, setTop25Sort] = useState<SortConfig>({ key: 'score', dir: 'desc' });

  // ─── Phase 2: Row Actions State ──────────────────────────────────────────────
  const [selectedScore, setSelectedScore] = useState('all');
  const [selectedShow, setSelectedShow] = useState('active');
  const [dismissedSet, setDismissedSet] = useState<Set<string>>(new Set());
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());

  // ─── Phase 4: Ask Radar State ─────────────────────────────────────────────
  const [radarOpen, setRadarOpen] = useState<Record<string, boolean>>({});
  const [radarInput, setRadarInput] = useState<Record<string, string>>({});
  const [radarLoading, setRadarLoading] = useState<Record<string, boolean>>({});
  const [radarResult, setRadarResult] = useState<Record<string, { answer: string; articleCount: number; sources: Record<string, number> } | null>>({});
  const [radarError, setRadarError] = useState<Record<string, string | null>>({});

  // ─── Phase 5: LinkedIn Connect State ──────────────────────────────────────
  const [connectLoading, setConnectLoading] = useState<Record<string, boolean>>({});
  const [connectDraft, setConnectDraft] = useState<Record<string, string>>({});

  // ─── Data Fetching ─────────────────────────────────────────────────────────

  async function fetchHitList() {
    const res = await fetch('/api/hitlist');
    if (!res.ok) throw new Error('Failed to load hit list');
    return res.json() as Promise<HitListData>;
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [hitListJson, partnersJson, dismissedJson] = await Promise.all([
          fetchHitList(),
          fetch('/api/partners/list').then(r => r.json()),
          fetch('/api/companies/dismiss').then(r => r.json()).catch(() => []),
        ]);
        setHitListData(hitListJson);
        setPartners(partnersJson);
        if (Array.isArray(dismissedJson) && dismissedJson.length > 0) {
          setDismissedSet(new Set(dismissedJson as string[]));
        }
      } catch {
        toast.error('Error loading dashboard data');
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scoring weights removed — hit score is macro-region-only, no re-fetch needed

  // ─── Derived & Sorted Data ─────────────────────────────────────────────────

  const newDsps = hitListData?.new_companies ?? [];
  const top25 = newDsps.slice(0, 25);

  const regionOptions = Array.from(new Set(newDsps.flatMap(d => d.countries))).sort();
  const industryOptions = Array.from(new Set(newDsps.flatMap(d => d.industries))).sort();

  const filteredNewDsps = newDsps.filter(d => {
    const regionOk = selectedRegion === 'all' || d.countries.includes(selectedRegion);
    const industryOk = selectedIndustry === 'all' || d.industries.includes(selectedIndustry);
    const scoreOk = selectedScore === 'all'
      || (selectedScore === 'high' && d.hit_score >= 0.8)
      || (selectedScore === 'med' && d.hit_score >= 0.5 && d.hit_score < 0.8);
    const showOk = selectedShow === 'all'
      || (selectedShow === 'active' && !dismissedSet.has(d.normalized_name))
      || (selectedShow === 'dismissed' && dismissedSet.has(d.normalized_name));
    return regionOk && industryOk && scoreOk && showOk;
  });

  const sortedPartners = sortRows(partners, partnerSort, (p, key) => {
    if (key === 'name') return p.name ?? '';
    if (key === 'region') return p.region ?? '';
    if (key === 'type') return p.type ?? '';
    return '';
  });

  const sortedFilteredDsps = sortRows(filteredNewDsps, dspSort, (d, key) => {
    if (key === 'name') return d.name ?? '';
    if (key === 'score') return d.hit_score;
    if (key === 'mentions') return d.mention_count;
    if (key === 'region') return d.countries[0] ?? '';
    if (key === 'industry') return d.industries[0] ?? '';
    if (key === 'signal') return d.signal_types[0] ?? '';
    return '';
  });

  const sortedTop25 = sortRows(top25, top25Sort, (d, key) => {
    if (key === 'name') return d.name ?? '';
    if (key === 'score') return d.hit_score;
    if (key === 'region') return d.countries[0] ?? '';
    if (key === 'industry') return d.industries[0] ?? '';
    if (key === 'articles') return d.articles.length;
    return '';
  });

  // ─── Actions ───────────────────────────────────────────────────────────────

  const toggleRow = (key: string) => setExpandedRows(p => ({ ...p, [key]: !p[key] }));

  const handleReSyncPartners = async () => {
    setSyncingPartners(true);
    try {
      const res = await fetch('/api/partners/list');
      if (!res.ok) throw new Error();
      setPartners(await res.json());
      toast.success('Partners list refreshed');
    } catch {
      toast.error('Failed to refresh partners list');
    } finally {
      setSyncingPartners(false);
    }
  };

  const handleReSync = async () => {
    setSyncing(true);
    try {
      const data = await fetchHitList();
      setHitListData(data);
      toast.success('DSP list refreshed');
    } catch {
      toast.error('Failed to refresh DSP list');
    } finally {
      setSyncing(false);
    }
  };

  const handleAddToPipeline = (dsp: DspHitListEntry) => {
    if (isInPipeline(dsp.name)) return;
    const card: PipelineCardData = {
      id: crypto.randomUUID(),
      dealName: `DJI Dock – ${dsp.name}`,
      companyName: dsp.name,
      companyInitials: dsp.name.slice(0, 2).toUpperCase(),
      companyColor: generateColor(dsp.name),
      score: dsp.hit_score >= 0.8 ? 'HIGH' : 'MED',
      region: dsp.countries?.[0] ?? 'Unknown',
      signal: dsp.signal_types?.[0] ?? 'DEPLOYMENT',
      daysAgo: 0,
      isKnownPartner: dsp.isFlytbasePartner ?? false,
      source: 'LinkedIn',
      stage: 'prospect',
    };
    addCard(card);
    toast.success(`${dsp.name} added to pipeline`);
    // 2s "Added!" flash before settling to "In Pipeline" badge
    setJustAdded(prev => new Set(prev).add(dsp.normalized_name));
    setTimeout(() => setJustAdded(prev => {
      const next = new Set(prev);
      next.delete(dsp.normalized_name);
      return next;
    }), 2000);
  };

  const cleanupCompanyState = (key: string) => {
    const del = <T,>(prev: Record<string, T>) => { const n = { ...prev }; delete n[key]; return n; };
    setExpandedRows(del);
    setRadarOpen(del);
    setRadarInput(del);
    setRadarLoading(del);
    setRadarResult(del);
    setRadarError(del);
    setConnectLoading(del);
    setConnectDraft(del);
  };

  const persistDismissStatus = (normalizedName: string, status: 'active' | 'dismissed') => {
    fetch('/api/companies/dismiss', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ normalized_name: normalizedName, status }),
    }).catch((err) => console.warn('[dismiss] persist failed:', err));
  };

  const handleDismissCompany = (normalizedName: string, displayName: string) => {
    setDismissedSet(prev => new Set(prev).add(normalizedName));
    cleanupCompanyState(normalizedName);
    persistDismissStatus(normalizedName, 'dismissed');
    toast(`${displayName} dismissed`, {
      action: {
        label: 'Undo',
        onClick: () => {
          setDismissedSet(prev => {
            const next = new Set(prev);
            next.delete(normalizedName);
            return next;
          });
          persistDismissStatus(normalizedName, 'active');
        },
      },
      duration: 5000,
    });
  };

  const handleAskRadar = async (normalizedKey: string, companyName: string, question: string) => {
    if (!question.trim()) return;
    setRadarLoading(prev => ({ ...prev, [normalizedKey]: true }));
    setRadarError(prev => ({ ...prev, [normalizedKey]: null }));
    setRadarResult(prev => ({ ...prev, [normalizedKey]: null }));
    try {
      const res = await fetch('/api/radar/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: companyName, question }),
      });
      if (!res.ok) throw new Error('Failed to query Radar');
      const data = await res.json() as { answer: string; article_count: number; sources: Record<string, number> };
      setRadarResult(prev => ({ ...prev, [normalizedKey]: { answer: data.answer, articleCount: data.article_count, sources: data.sources } }));
    } catch (err) {
      setRadarError(prev => ({ ...prev, [normalizedKey]: err instanceof Error ? err.message : 'Request failed' }));
    } finally {
      setRadarLoading(prev => ({ ...prev, [normalizedKey]: false }));
    }
  };

  const handleLinkedInConnect = async (dsp: DspHitListEntry) => {
    const key = dsp.normalized_name;
    setConnectLoading(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch('/api/linkedin-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: dsp.name,
          industry: dsp.industries[0] ?? '',
          signal_type: dsp.signal_types[0] ?? '',
          region: dsp.countries[0] ?? '',
        }),
      });
      if (!res.ok) throw new Error('Failed to generate');
      const data = await res.json() as { message: string };
      setConnectDraft(prev => ({ ...prev, [key]: data.message }));
    } catch {
      toast.error('Failed to generate connection request');
    } finally {
      setConnectLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const exportPartners = () => {
    exportCsv('flytbase-partners.csv',
      sortedPartners.map(p => [p.name, p.region ?? '', p.type ?? '', p.website ?? '', p.linkedin ?? '']),
      ['Name', 'Region', 'Type', 'Website', 'LinkedIn'],
    );
  };

  const exportNewDsps = () => {
    exportCsv('new-dsps.csv',
      sortedFilteredDsps.map(d => [
        d.name, d.countries.join('; '), d.industries.join('; '),
        String(d.mention_count), d.signal_types.join('; '),
        d.website ?? '', d.linkedin ?? '', String(d.linkedin_followers ?? ''),
        d.latest_article_url ?? '', d.latest_article_date ?? '',
      ]),
      ['Company', 'Countries', 'Industries', 'Mentions', 'Signals', 'Website', 'LinkedIn', 'LinkedIn Followers', 'Latest Article URL', 'Latest Article Date'],
    );
  };

  const exportTop25 = () => {
    exportCsv('top-25-targets.csv',
      sortedTop25.map((d, i) => [
        String(i + 1), d.name, d.hit_score.toFixed(2),
        d.countries.join('; '), d.industries.join('; '),
        d.website ?? '', d.latest_article_url ?? '', d.latest_article_date ?? '', String(d.articles.length),
      ]),
      ['Rank', 'Company', 'Hit Score', 'Countries', 'Industries', 'Website', 'Latest Article URL', 'Latest Article Date', 'Articles'],
    );
  };

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#6B7280', fontSize: 15 }}>
        Loading Partner Hit List…
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px 32px 64px', maxWidth: 1280, margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'FLYTBASE PARTNERS', value: partners.length, tab: 0 },
          { label: 'POTENTIAL PARTNERS', value: newDsps.length,  tab: 1 },
          { label: 'TOP 25 TARGETS',    value: Math.min(25, top25.length), tab: 2 },
          { label: 'PIPELINE',           value: activePipelineCount, tab: 3 },
        ].map(({ label, value, tab }) => (
          <div
            key={label}
            onClick={() => setActiveTab(tab)}
            style={{
              background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10,
              padding: '20px 24px', cursor: 'pointer', transition: 'box-shadow 0.15s',
              boxShadow: activeTab === tab ? '0 0 0 2px #15803D' : '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 36, fontWeight: 700, color: '#111827' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #E5E7EB', marginBottom: 24 }}>
        {[
          { label: 'FlytBase Partners', tab: 0 },
          { label: `Potential Partners (${newDsps.length})`, tab: 1 },
          { label: 'Top 25 Targets', tab: 2 },
          { label: `Pipeline (${activePipelineCount})`, tab: 3 },
        ].map(({ label, tab }) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 20px', fontSize: 13, fontWeight: 600, border: 'none',
              borderBottom: activeTab === tab ? '2px solid #15803D' : '2px solid transparent',
              marginBottom: -2, background: 'transparent', cursor: 'pointer',
              color: activeTab === tab ? '#15803D' : '#6B7280',
              transition: 'color 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab 1: FlytBase Partners ── */}
      {activeTab === 0 && (
        <div style={sCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={sH2}>FlytBase Partners</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleReSyncPartners} disabled={syncingPartners} style={{ ...sBtnSecondary, opacity: syncingPartners ? 0.6 : 1 }}>
                {syncingPartners ? 'Syncing…' : 'Re-sync'}
              </button>
              <button onClick={exportPartners} style={sBtnSecondary}>Export CSV</button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={sTable}>
              <thead>
                <tr style={sTHeadRow}>
                  <SortHeader label="NAME"     sortKey="name"   config={partnerSort} onSort={k => setPartnerSort(c => toggleSort(c, k))} />
                  <SortHeader label="REGION"   sortKey="region" config={partnerSort} onSort={k => setPartnerSort(c => toggleSort(c, k))} />
                  <SortHeader label="TYPE"     sortKey="type"   config={partnerSort} onSort={k => setPartnerSort(c => toggleSort(c, k))} />
                  <th style={sTH}>WEBSITE</th>
                  <th style={sTH}>LINKEDIN</th>
                </tr>
              </thead>
              <tbody>
                {sortedPartners.map(p => (
                  <tr key={p.id} style={sTRow}>
                    <td style={sTD}>{p.name}</td>
                    <td style={sTD}>{p.region || '—'}</td>
                    <td style={sTD}>{p.type || '—'}</td>
                    <td style={sTD}>
                      {p.website
                        ? <a href={p.website} target="_blank" rel="noopener noreferrer" style={sLink}>{p.website}</a>
                        : '—'}
                    </td>
                    <td style={sTD}>
                      {p.linkedin
                        ? <a href={p.linkedin} target="_blank" rel="noopener noreferrer" style={sLink}>LinkedIn ↗</a>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab 2: New DSPs ── */}
      {activeTab === 1 && (
        <div style={sCard}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h2 style={sH2}>Potential Partners</h2>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 3 }}>
                {filteredNewDsps.length} companies extracted from campaign articles
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleReSync} disabled={syncing} style={{ ...sBtnSecondary, opacity: syncing ? 0.6 : 1 }}>
                {syncing ? 'Syncing…' : 'Re-sync'}
              </button>
              <button onClick={exportNewDsps} style={sBtnSecondary}>Export CSV</button>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <label style={sFilterLabel}>Score</label>
              <select value={selectedScore} onChange={e => setSelectedScore(e.target.value)} style={sSelect}>
                <option value="all">All Scores</option>
                <option value="high">HIGH (&ge; 0.8)</option>
                <option value="med">MED (&ge; 0.5)</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={sFilterLabel}>Region</label>
              <select value={selectedRegion} onChange={e => setSelectedRegion(e.target.value)} style={sSelect}>
                <option value="all">All Regions</option>
                {regionOptions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={sFilterLabel}>Industry</label>
              <select value={selectedIndustry} onChange={e => setSelectedIndustry(e.target.value)} style={sSelect}>
                <option value="all">All Industries</option>
                {industryOptions.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={sFilterLabel}>Show</label>
              <select value={selectedShow} onChange={e => setSelectedShow(e.target.value)} style={sSelect}>
                <option value="active">Active</option>
                <option value="dismissed">Dismissed</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={sTable}>
              <thead>
                <tr style={sTHeadRow}>
                  <th style={{ ...sTH, width: 28 }}></th>
                  <SortHeader label="COMPANY"  sortKey="name"     config={dspSort} onSort={k => setDspSort(c => toggleSort(c, k))} style={{ width: '20%' }} />
                  <SortHeader label="SCORE"    sortKey="score"    config={dspSort} onSort={k => setDspSort(c => toggleSort(c, k))} style={{ width: 64 }} />
                  <SortHeader label="REGION"   sortKey="region"   config={dspSort} onSort={k => setDspSort(c => toggleSort(c, k))} style={{ width: '13%' }} />
                  <SortHeader label="INDUSTRY" sortKey="industry" config={dspSort} onSort={k => setDspSort(c => toggleSort(c, k))} style={{ width: '14%' }} />
                  <SortHeader label="SIGNAL"   sortKey="signal"   config={dspSort} onSort={k => setDspSort(c => toggleSort(c, k))} style={{ width: '13%' }} />
                  <th style={{ ...sTH, width: '9%' }}>WEBSITE</th>
                  <th style={{ ...sTH, width: '9%' }}>LINKEDIN</th>
                  <th style={{ ...sTH, width: '14%', textAlign: 'right' as const }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {sortedFilteredDsps.length === 0 && (
                  <tr><td colSpan={9} style={{ ...sTD, textAlign: 'center', color: '#9CA3AF', padding: 40 }}>No partners match the selected filters</td></tr>
                )}
                {sortedFilteredDsps.map(dsp => {
                  const inPipeline = isInPipeline(dsp.name);
                  return (
                  <React.Fragment key={dsp.normalized_name}>
                    <tr style={sClickableRow} onClick={() => toggleRow(dsp.normalized_name)}>
                      {/* Expand arrow — rotates on expand (matches Step 3 pattern) */}
                      <td style={{ ...sTD, paddingRight: 0, paddingLeft: 12, width: 28 }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10,
                          color: expandedRows[dsp.normalized_name] ? '#2C7BF2' : '#4B5563',
                          transform: expandedRows[dsp.normalized_name] ? 'rotate(90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.18s ease, color 0.15s ease',
                        }}>
                          ▶
                        </span>
                      </td>
                      {/* Company + badges */}
                      <td style={{ ...sTD, color: '#111827' }}>
                        <div style={{ fontWeight: 600 }}>{dsp.name}</div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                          {dsp.isFlytbasePartner && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC' }}>
                              Known Partner
                            </span>
                          )}
                          {inPipeline && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC' }}>
                              In Pipeline
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Score */}
                      <td style={{ ...sTD, fontWeight: 700, color: '#15803D', fontSize: 14 }}>
                        {dsp.hit_score.toFixed(2)}
                      </td>
                      {/* Region */}
                      <td style={sTD}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {dsp.countries.length
                            ? dsp.countries.map(c => <span key={c} style={sCountryTag}>{c}</span>)
                            : <span style={{ color: '#D1D5DB' }}>—</span>}
                        </div>
                      </td>
                      {/* Industry */}
                      <td style={{ ...sTD, fontSize: 13, color: '#374151' }}>{dsp.industries.join(', ') || '—'}</td>
                      {/* Signal */}
                      <td style={sTD}>{dsp.signal_types.map(s => <SignalBadge key={s} type={s} />)}</td>
                      {/* Website */}
                      <td style={sTD} onClick={e => e.stopPropagation()}>
                        {dsp.website
                          ? <a href={dsp.website} target="_blank" rel="noopener noreferrer" style={sLinkBtn}>Website ↗</a>
                          : <span style={{ color: '#D1D5DB' }}>—</span>}
                      </td>
                      {/* LinkedIn */}
                      <td style={sTD} onClick={e => e.stopPropagation()}>
                        {dsp.linkedin
                          ? <div>
                              <a href={dsp.linkedin} target="_blank" rel="noopener noreferrer" style={sLinkBtn}>LinkedIn ↗</a>
                              {dsp.linkedin_followers != null && (
                                <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>
                                  {dsp.linkedin_followers >= 1000 ? `${(dsp.linkedin_followers / 1000).toFixed(1).replace(/\.0$/, '')}k` : dsp.linkedin_followers} followers
                                </div>
                              )}
                            </div>
                          : <span style={{ color: '#D1D5DB' }}>—</span>}
                      </td>
                      {/* Actions */}
                      <td style={{ ...sTD, paddingRight: 4 }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {justAdded.has(dsp.normalized_name) ? (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#16A34A', padding: '3px 10px' }}>
                              ✓ Added!
                            </span>
                          ) : !inPipeline ? (
                            <button
                              onClick={() => handleAddToPipeline(dsp)}
                              style={sBtnPipeline}
                            >
                              + Pipe
                            </button>
                          ) : null}
                          <button
                            onClick={() => handleDismissCompany(dsp.normalized_name, dsp.name)}
                            style={sBtnDismiss}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedRows[dsp.normalized_name] && (
                      <tr>
                        <td colSpan={9} style={{ padding: 0, borderBottom: '1px solid #E5E7EB' }}>
                          <div style={{
                            borderTop: '2px solid #2C7BF2',
                            borderLeft: '3px solid #2C7BF2',
                            background: '#FAFCFF',
                            boxShadow: '0 4px 20px rgba(44, 123, 242, 0.09)',
                          }}>
                            {/* ── Header strip (matches ArticleDrawer) ── */}
                            <div
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 20px', background: '#2C7BF2', borderBottom: '1px solid #2370DC',
                              }}
                            >
                              <span style={{ fontSize: 11.5, fontWeight: 600, color: '#fff', letterSpacing: 0.2 }}>
                                Partner Detail
                              </span>
                              {dsp.isFlytbasePartner && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC', whiteSpace: 'nowrap' as const }}>
                                  Known Partner
                                </span>
                              )}
                              {inPipeline && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC', whiteSpace: 'nowrap' as const }}>
                                  In Pipeline
                                </span>
                              )}
                              <span style={{ fontSize: 11, color: '#BFDBFE' }}>
                                ·&nbsp; {dsp.signal_types.join(', ') || '—'}
                                {dsp.industries[0] && <>&nbsp;·&nbsp;{dsp.industries[0]}</>}
                                &nbsp;·&nbsp;Score {dsp.hit_score.toFixed(2)}
                              </span>
                              <div style={{ flex: 1 }} />
                              <span style={{ fontSize: 11, color: '#93C5FD', fontStyle: 'italic' }}>
                                {dsp.countries.join(', ') || '—'}
                              </span>
                            </div>

                            {/* ── Body ── */}
                            <div style={{ padding: '20px 20px 16px' }}>
                          {/* ── 3-Column Grid ── */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, marginBottom: 20 }}>

                            {/* Column 1: Company Identity */}
                            <div>
                              <div style={sSectionLabel}>Company</div>
                              {dsp.website ? (
                                <div style={{ marginBottom: 8 }}>
                                  <a href={dsp.website} target="_blank" rel="noopener noreferrer" style={sLinkBtn}>
                                    {getHostname(dsp.website)} ↗
                                  </a>
                                </div>
                              ) : (
                                <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', marginBottom: 8 }}>No website</div>
                              )}
                              {dsp.linkedin ? (
                                <div style={{ marginBottom: 4 }}>
                                  <a href={dsp.linkedin} target="_blank" rel="noopener noreferrer" style={sLinkBtn}>
                                    LinkedIn ↗
                                  </a>
                                  {dsp.linkedin_followers != null && (
                                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>
                                      {dsp.linkedin_followers >= 1000 ? `${(dsp.linkedin_followers / 1000).toFixed(1).replace(/\.0$/, '')}k` : dsp.linkedin_followers} followers
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', marginBottom: 4 }}>No LinkedIn</div>
                              )}
                              <div style={sBacklogDivider}>
                                <div style={sBacklog}>Company size (coming soon)</div>
                                <div style={sBacklog}>Founded year (coming soon)</div>
                                <div style={sBacklog}>About / description (coming soon)</div>
                              </div>
                            </div>

                            {/* Column 2: Drone Program */}
                            <div>
                              <div style={sSectionLabel}>Drone Program</div>
                              <div style={{ marginBottom: 10 }}>
                                <div style={sFieldLabel}>Signal</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                  {dsp.signal_types.length > 0
                                    ? dsp.signal_types.map(s => <SignalBadge key={s} type={s} />)
                                    : <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span>
                                  }
                                </div>
                              </div>
                              <div style={{ marginBottom: 10 }}>
                                <div style={sFieldLabel}>DJI Dock</div>
                                {dsp.articles.some(a => /dji\s*dock/i.test(a.title))
                                  ? <span style={{ fontSize: 13, fontWeight: 600, color: '#15803D' }}>● Yes</span>
                                  : <span style={{ fontSize: 13, color: '#6B7280' }}>○ No</span>
                                }
                              </div>
                              <div style={{ marginBottom: 10 }}>
                                <div style={sFieldLabel}>Last seen</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                                  {dsp.latest_article_date
                                    ? new Date(dsp.latest_article_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                                    : '—'}
                                </div>
                              </div>
                              <div style={{ marginBottom: 10 }}>
                                <div style={sFieldLabel}>Fleet stage</div>
                                <select
                                  disabled
                                  style={{
                                    fontSize: 12, padding: '3px 8px', borderRadius: 5,
                                    border: '1px solid #E5E7EB', color: '#9CA3AF', background: '#F9FAFB',
                                    fontStyle: 'italic', cursor: 'not-allowed', appearance: 'none' as const,
                                    WebkitAppearance: 'none' as const,
                                  }}
                                >
                                  <option>Select stage…</option>
                                  <option>Pilot</option>
                                  <option>Advanced</option>
                                  <option>Nationwide</option>
                                </select>
                              </div>
                              <div style={sBacklogDivider}>
                                <div style={sBacklog}>Signal timeline (coming soon)</div>
                                <div style={sBacklog}>Competitor mentions (coming soon)</div>
                              </div>
                            </div>

                            {/* Column 3: Decision Maker */}
                            <div>
                              <div style={sSectionLabel}>Decision Maker</div>
                              {dsp.key_contact ? (
                                <div style={{ padding: '8px 12px', background: '#F0FDF4', borderRadius: 6, borderLeft: '3px solid #15803D', marginBottom: 10 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{dsp.key_contact.name}</div>
                                  {(dsp.key_contact.role || dsp.key_contact.organization) && (
                                    <div style={{ fontSize: 11.5, color: '#4B5563', marginTop: 2 }}>
                                      {[dsp.key_contact.role, dsp.key_contact.organization].filter(Boolean).join(' · ')}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', marginBottom: 10 }}>No contact found</div>
                              )}
                              <div style={sBacklogDivider}>
                                <div style={sBacklog}>Contact LinkedIn URL (coming soon)</div>
                                <div style={sBacklog}>Seniority flag (coming soon)</div>
                                <div style={sBacklog}>Other contacts (coming soon)</div>
                              </div>
                            </div>
                          </div>

                          {/* ── Score Breakdown Strip ── */}
                          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, padding: '10px 14px', marginBottom: 16 }}>
                            <div style={{ ...sSectionLabel, marginBottom: 6 }}>Score Breakdown</div>
                            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13, color: '#374151' }}>
                                Region: <span style={{ fontWeight: 600 }}>{dsp.countries.join(', ') || '—'}</span>
                              </span>
                              <span style={{ fontSize: 13, color: '#374151' }}>
                                Priority: <span style={{ fontWeight: 600 }}>{(() => {
                                  const macro = dsp.countries.map(c => COUNTRY_TO_MACRO[c]).find(Boolean) ?? 'Unknown';
                                  return MACRO_LABELS[macro] ?? 'STD';
                                })()}</span>
                              </span>
                              <span style={{ fontSize: 13, color: '#374151' }}>
                                Hit Score: <span style={{ fontWeight: 700, color: '#15803D' }}>{dsp.hit_score.toFixed(2)}</span>
                              </span>
                            </div>
                            <div style={{ fontSize: 11.5, fontStyle: 'italic', color: '#6B7280', marginTop: 6 }}>
                              Score breakdown detail coming soon
                            </div>
                          </div>

                          {/* ── Source Articles ── */}
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ ...sSectionLabel, marginBottom: 10 }}>Source Articles</div>
                            {dsp.articles.length === 0
                              ? <div style={{ color: '#9CA3AF', fontSize: 13 }}>No articles available</div>
                              : dsp.articles.slice(0, 5).map((a, idx) => <ArticleRow key={a.id} article={a} index={idx} />)
                            }
                            {dsp.articles.length > 5 && (
                              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6, fontStyle: 'italic' }}>
                                +{dsp.articles.length - 5} more articles
                              </div>
                            )}
                          </div>

                          {/* ── Ask Radar (collapsible) ── */}
                          <div style={{ marginBottom: 16 }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setRadarOpen(prev => ({ ...prev, [dsp.normalized_name]: !prev[dsp.normalized_name] })); }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                                padding: '10px 14px', background: '#FAFAFF', border: '1px solid #E0E7FF',
                                borderRadius: radarOpen[dsp.normalized_name] ? '6px 6px 0 0' : 6,
                                cursor: 'pointer', fontSize: 11, fontWeight: 700,
                                color: '#4338CA', letterSpacing: 0.5, textTransform: 'uppercase' as const,
                              }}
                            >
                              <span style={{ fontSize: 9, color: '#818CF8' }}>{radarOpen[dsp.normalized_name] ? '▼' : '▶'}</span>
                              ASK RADAR
                              <span style={{ fontWeight: 400, fontSize: 11, color: '#9CA3AF', textTransform: 'none' as const, fontStyle: 'italic', letterSpacing: 0 }}>
                                — Ask anything about this company from collected signals
                              </span>
                            </button>
                            {radarOpen[dsp.normalized_name] && (
                              <div style={{
                                padding: '14px 14px 12px', background: '#FAFAFF',
                                border: '1px solid #E0E7FF', borderTop: 'none',
                                borderRadius: '0 0 6px 6px',
                              }}>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <input
                                    type="text"
                                    placeholder="e.g. What markets does this company operate in?"
                                    value={radarInput[dsp.normalized_name] ?? ''}
                                    onChange={(e) => { e.stopPropagation(); setRadarInput(prev => ({ ...prev, [dsp.normalized_name]: e.target.value })); }}
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleAskRadar(dsp.normalized_name, dsp.name, radarInput[dsp.normalized_name] ?? ''); }}
                                    style={{
                                      flex: 1, fontSize: 13, padding: '8px 12px', borderRadius: 6,
                                      border: '1px solid #D1D5DB', color: '#374151', background: '#fff',
                                    }}
                                  />
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleAskRadar(dsp.normalized_name, dsp.name, radarInput[dsp.normalized_name] ?? ''); }}
                                    disabled={radarLoading[dsp.normalized_name] || !(radarInput[dsp.normalized_name] ?? '').trim()}
                                    style={{
                                      fontSize: 12, fontWeight: 600, padding: '8px 16px', borderRadius: 6,
                                      border: 'none', background: '#4338CA', color: '#fff',
                                      cursor: radarLoading[dsp.normalized_name] ? 'wait' : 'pointer',
                                      opacity: radarLoading[dsp.normalized_name] || !(radarInput[dsp.normalized_name] ?? '').trim() ? 0.6 : 1,
                                      whiteSpace: 'nowrap' as const,
                                    }}
                                  >
                                    {radarLoading[dsp.normalized_name] ? 'Asking…' : 'Ask →'}
                                  </button>
                                </div>
                                {radarError[dsp.normalized_name] && (
                                  <div style={{ fontSize: 12, color: '#DC2626', marginTop: 10 }}>
                                    {radarError[dsp.normalized_name]}
                                  </div>
                                )}
                                {radarResult[dsp.normalized_name] && (
                                  <div style={{
                                    marginTop: 12, padding: '12px 14px',
                                    background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 6,
                                  }}>
                                    <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' as const }}>
                                      {radarResult[dsp.normalized_name]!.answer}
                                    </div>
                                    <div style={{
                                      marginTop: 10, paddingTop: 8, borderTop: '1px solid #C7D2FE',
                                      fontSize: 11, color: '#6B7280',
                                    }}>
                                      Based on {radarResult[dsp.normalized_name]!.articleCount} article{radarResult[dsp.normalized_name]!.articleCount !== 1 ? 's' : ''}
                                      {Object.keys(radarResult[dsp.normalized_name]!.sources).length > 0 && (
                                        <span>
                                          {' · Sources: '}
                                          {Object.entries(radarResult[dsp.normalized_name]!.sources).map(([src, count], i) => (
                                            <span key={src}>{i > 0 ? ', ' : ''}{src} ({count})</span>
                                          ))}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* ── Action Bar ── */}
                          <div style={{
                            display: 'flex', gap: 10, alignItems: 'center',
                            padding: '12px 16px', background: '#F9FAFB',
                            border: '1px solid #E5E7EB', borderRadius: 6,
                          }}>
                            {justAdded.has(dsp.normalized_name) ? (
                              <span style={{
                                fontSize: 12, fontWeight: 700, padding: '6px 16px', borderRadius: 6,
                                color: '#16A34A',
                              }}>
                                ✓ Added to Pipeline
                              </span>
                            ) : !inPipeline ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleAddToPipeline(dsp); }}
                                style={{
                                  fontSize: 12, fontWeight: 600, padding: '6px 16px', borderRadius: 6,
                                  border: '1px solid #818CF8', background: '#EEF2FF', color: '#4338CA',
                                  cursor: 'pointer',
                                }}
                              >
                                + Add to Pipeline
                              </button>
                            ) : (
                              <span style={{
                                fontSize: 12, fontWeight: 600, padding: '6px 16px', borderRadius: 6,
                                background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC',
                              }}>
                                In Pipeline
                              </span>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDismissCompany(dsp.normalized_name, dsp.name); }}
                              style={{
                                fontSize: 12, fontWeight: 600, padding: '6px 16px', borderRadius: 6,
                                border: '1px solid #D1D5DB', background: '#fff', color: '#6B7280',
                                cursor: 'pointer',
                              }}
                            >
                              Dismiss
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleLinkedInConnect(dsp); }}
                              disabled={connectLoading[dsp.normalized_name]}
                              style={{
                                fontSize: 12, fontWeight: 600, padding: '6px 16px', borderRadius: 6,
                                border: '1px solid #818CF8', background: '#EEF2FF', color: '#4338CA',
                                cursor: connectLoading[dsp.normalized_name] ? 'wait' : 'pointer', marginLeft: 'auto',
                                opacity: connectLoading[dsp.normalized_name] ? 0.6 : 1,
                              }}
                            >
                              {connectLoading[dsp.normalized_name] ? 'Generating…' : connectDraft[dsp.normalized_name] ? 'Regenerate' : 'Generate LinkedIn Connect'}
                            </button>
                            {connectDraft[dsp.normalized_name] && (
                              <button
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(connectDraft[dsp.normalized_name]).then(() => toast.success('Copied to clipboard')); }}
                                style={{
                                  fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 6,
                                  border: '1px solid #86EFAC', background: '#DCFCE7', color: '#15803D',
                                  cursor: 'pointer',
                                }}
                              >
                                Copy
                              </button>
                            )}
                          </div>
                          {/* LinkedIn Connect Draft */}
                          {connectDraft[dsp.normalized_name] && (
                            <div style={{ marginTop: 10 }}>
                              <textarea
                                value={connectDraft[dsp.normalized_name]}
                                onChange={(e) => setConnectDraft(prev => ({ ...prev, [dsp.normalized_name]: e.target.value }))}
                                onClick={(e) => e.stopPropagation()}
                                rows={3}
                                style={{
                                  width: '100%', fontSize: 13, padding: '10px 12px', borderRadius: 6,
                                  border: '1px solid #C7D2FE', background: '#EEF2FF', color: '#374151',
                                  resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box',
                                }}
                              />
                            </div>
                          )}
                            </div>{/* end body */}
                          </div>{/* end outer drawer wrapper */}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab 3: Top 25 Targets ── */}
      {activeTab === 2 && (
        <div style={sCard}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h2 style={sH2}>Top 25 Targets</h2>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 3 }}>
                Ranked by macro-region priority: Americas/Europe (1.0) &gt; MEA (0.8) &gt; APAC (0.7) &gt; Others (0.5)
              </div>
            </div>
            <button onClick={exportTop25} style={sBtnSecondary}>Export CSV</button>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={sTable}>
              <thead>
                <tr style={sTHeadRow}>
                  <th style={{ ...sTH, width: 36 }}>#</th>
                  <SortHeader label="COMPANY"  sortKey="name"     config={top25Sort} onSort={k => setTop25Sort(c => toggleSort(c, k))} style={{ width: '18%' }} />
                  <SortHeader label="SCORE"    sortKey="score"    config={top25Sort} onSort={k => setTop25Sort(c => toggleSort(c, k))} style={{ width: 72 }} />
                  <SortHeader label="REGION"   sortKey="region"   config={top25Sort} onSort={k => setTop25Sort(c => toggleSort(c, k))} style={{ width: '14%' }} />
                  <SortHeader label="INDUSTRY" sortKey="industry" config={top25Sort} onSort={k => setTop25Sort(c => toggleSort(c, k))} style={{ width: '15%' }} />
                  <th style={{ ...sTH, width: '13%' }}>SIGNAL</th>
                  <th style={{ ...sTH, width: 90 }}>WEBSITE</th>
                  <th style={{ ...sTH, width: 90 }}>LINKEDIN</th>
                  <SortHeader label="ARTICLES" sortKey="articles" config={top25Sort} onSort={k => setTop25Sort(c => toggleSort(c, k))} style={{ width: 80 }} />
                  <th style={{ ...sTH, width: 28 }}></th>
                </tr>
              </thead>
              <tbody>
                {sortedTop25.length === 0 && (
                  <tr><td colSpan={10} style={{ ...sTD, textAlign: 'center', color: '#9CA3AF', padding: 40 }}>No DSPs available for ranking</td></tr>
                )}
                {sortedTop25.map((dsp, i) => {
                  const key = `top-${dsp.normalized_name}`;
                  return (
                    <React.Fragment key={key}>
                      <tr style={sClickableRow} onClick={() => toggleRow(key)}>
                        <td style={{ ...sTD, fontWeight: 700, color: '#9CA3AF', fontSize: 13 }}>{i + 1}</td>
                        <td style={{ ...sTD, fontWeight: 600, color: '#111827' }}>{dsp.name}</td>
                        <td style={{ ...sTD, fontWeight: 700, color: '#15803D', fontSize: 15 }}>{dsp.hit_score.toFixed(2)}</td>
                        <td style={sTD}><RegionPriority countries={dsp.countries} /></td>
                        <td style={sTD}><IndustryPriority industries={dsp.industries} /></td>
                        <td style={sTD}>{dsp.signal_types.map(s => <SignalBadge key={s} type={s} />)}</td>
                        <td style={sTD} onClick={e => e.stopPropagation()}>
                          {dsp.website
                            ? <a href={dsp.website} target="_blank" rel="noopener noreferrer" style={sLinkBtn}>Website ↗</a>
                            : <span style={{ color: '#D1D5DB' }}>—</span>}
                        </td>
                        <td style={sTD} onClick={e => e.stopPropagation()}>
                          {dsp.linkedin
                            ? <a href={dsp.linkedin} target="_blank" rel="noopener noreferrer" style={sLinkBtn}>LinkedIn ↗</a>
                            : <span style={{ color: '#D1D5DB' }}>—</span>}
                        </td>
                        <td style={sTD}>
                          <span style={{ fontSize: 12, color: '#6B7280' }}>
                            {dsp.articles.length} {dsp.articles.length === 1 ? 'article' : 'articles'}
                          </span>
                        </td>
                        <td style={{ ...sTD, color: '#CBD5E1', fontSize: 11, paddingLeft: 0 }}>
                          {expandedRows[key] ? '▼' : '▶'}
                        </td>
                      </tr>
                      {expandedRows[key] && (
                        <tr>
                          <td colSpan={10} style={sExpandedCell}>
                            {dsp.latest_article_date && (
                              <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 12 }}>
                                Last seen: <span style={{ fontWeight: 600 }}>{new Date(dsp.latest_article_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                              </div>
                            )}
                            {dsp.key_contact && (
                              <div style={{ marginBottom: 14, padding: '8px 12px', background: '#F0FDF4', borderRadius: 6, borderLeft: '3px solid #15803D' }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#15803D', letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase' as const }}>Key Contact</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{dsp.key_contact.name}</div>
                                {(dsp.key_contact.role || dsp.key_contact.organization) && (
                                  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                                    {[dsp.key_contact.role, dsp.key_contact.organization].filter(Boolean).join(' · ')}
                                  </div>
                                )}
                              </div>
                            )}
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' as const }}>
                              Source Articles
                            </div>
                            {dsp.articles.length === 0
                              ? <div style={{ color: '#9CA3AF', fontSize: 13 }}>No articles available</div>
                              : dsp.articles.map((a, idx) => <ArticleRow key={a.id} article={a} index={idx} />)
                            }
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab 4: Pipeline ── */}
      {activeTab === 3 && (
        <PipelineBoard />
      )}
    </div>
  );
};

// ─── Shared Styles ───────────────────────────────────────────────────────────

const sCard: React.CSSProperties = {
  background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10,
  padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};

const sH2: React.CSSProperties = {
  fontSize: 18, fontWeight: 700, color: '#111827', margin: 0,
};

const sTable: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse', fontSize: 14,
};

const sTHeadRow: React.CSSProperties = {
  borderBottom: '2px solid #E5E7EB', background: '#F9FAFB',
};

const sTH: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left', fontWeight: 600,
  fontSize: 11, color: '#6B7280', letterSpacing: 0.5,
};

const sTRow: React.CSSProperties = {
  borderBottom: '1px solid #F3F4F6',
};

const sTD: React.CSSProperties = {
  padding: '12px 16px', color: '#374151', verticalAlign: 'top',
};

const sLink: React.CSSProperties = {
  color: '#2563EB', textDecoration: 'none', fontSize: 13,
};

const sLinkBtn: React.CSSProperties = {
  display: 'inline-block', fontSize: 12, fontWeight: 500,
  color: '#2563EB', textDecoration: 'none',
  padding: '2px 8px', borderRadius: 6,
  background: '#EFF6FF', border: '1px solid #BFDBFE',
  whiteSpace: 'nowrap' as const,
};


const sClickableRow: React.CSSProperties = {
  borderBottom: '1px solid #F3F4F6', cursor: 'pointer',
  transition: 'background 0.1s',
};

const sCountryTag: React.CSSProperties = {
  fontSize: 11, background: '#EFF6FF', color: '#1D4ED8',
  padding: '2px 7px', borderRadius: 8, fontWeight: 500,
};

const sExpandedCell: React.CSSProperties = {
  padding: '14px 20px 18px',
  background: '#FAFAFA',
  borderBottom: '1px solid #E5E7EB',
};

const sBtnSecondary: React.CSSProperties = {
  padding: '7px 14px', fontSize: 13, fontWeight: 600,
  border: '1px solid #D1D5DB', borderRadius: 7,
  background: '#fff', color: '#374151', cursor: 'pointer',
};

const sFilterLabel: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: '#6B7280',
  letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase',
};

const sSelect: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 13,
  border: '1px solid #D1D5DB', borderRadius: 6,
  background: '#fff', color: '#374151', cursor: 'pointer',
};

const sSectionLabel: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: '#4B5563', letterSpacing: 0.7,
  textTransform: 'uppercase' as const, marginBottom: 10,
};

const sFieldLabel: React.CSSProperties = {
  fontSize: 11, color: '#6B7280', marginBottom: 4,
};

const sBacklog: React.CSSProperties = {
  fontSize: 11, fontStyle: 'italic', color: '#9CA3AF', marginBottom: 4,
};

const sBacklogDivider: React.CSSProperties = {
  marginTop: 12, borderTop: '1px dashed #E5E7EB', paddingTop: 8,
};

const sBtnPipeline: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 5,
  border: '1px solid #818CF8', background: '#EEF2FF', color: '#4338CA',
  cursor: 'pointer', whiteSpace: 'nowrap' as const,
};

const sBtnDismiss: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 5,
  border: '1px solid #D1D5DB', background: '#fff', color: '#6B7280',
  cursor: 'pointer',
};

export { PartnerDashboard };
