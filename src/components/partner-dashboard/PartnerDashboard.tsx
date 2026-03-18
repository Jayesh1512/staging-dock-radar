'use client';

import React, { useState, useEffect } from 'react';
import { HitListData, DspHitListEntry } from '@/lib/types';
import { toast } from 'sonner';

interface Partner {
  id: string;
  name: string;
  region: string;
  type: string;
  website?: string;
  linkedin?: string;
}

interface ScoringWeights {
  regionWeight: number;
  industryWeight: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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

const HIGH_REGIONS = ['Americas', 'Europe', 'USA', 'Canada', 'United States', 'UK', 'Germany', 'France'];
const HIGH_INDUSTRIES = ['Security', 'Oil & Gas', 'Oil&Gas', 'Utilities', 'Port', 'Mining', 'Solar'];

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
  const isHigh = countries.some(c => HIGH_REGIONS.some(h => c.toLowerCase().includes(h.toLowerCase())));
  return (
    <div>
      <div style={{ fontSize: 12, color: '#374151', marginBottom: 4, lineHeight: 1.4 }}>
        {countries.length ? countries.join(', ') : '—'}
      </div>
      <PriorityPill isHigh={isHigh} />
    </div>
  );
}

function IndustryPriority({ industries }: { industries: string[] }) {
  const isHigh = industries.some(ind => HIGH_INDUSTRIES.some(h => ind.toLowerCase().includes(h.toLowerCase())));
  return (
    <div>
      <div style={{ fontSize: 12, color: '#374151', marginBottom: 4, lineHeight: 1.4 }}>
        {industries.length ? industries.join(', ') : '—'}
      </div>
      <PriorityPill isHigh={isHigh} />
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

// ─── Main Component ──────────────────────────────────────────────────────────

const PartnerDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [hitListData, setHitListData] = useState<HitListData | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingPartners, setSyncingPartners] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedIndustry, setSelectedIndustry] = useState('all');
  const [scoringWeights, setScoringWeights] = useState<ScoringWeights>({ regionWeight: 0.5, industryWeight: 0.5 });

  // ─── Data Fetching ─────────────────────────────────────────────────────────

  async function fetchHitList(weights = scoringWeights) {
    const res = await fetch(`/api/hitlist?regionWeight=${weights.regionWeight}&industryWeight=${weights.industryWeight}`);
    if (!res.ok) throw new Error('Failed to load hit list');
    return res.json() as Promise<HitListData>;
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [hitListJson, partnersJson] = await Promise.all([
          fetchHitList(),
          fetch('/api/partners/list').then(r => r.json()),
        ]);
        setHitListData(hitListJson);
        setPartners(partnersJson);
      } catch {
        toast.error('Error loading dashboard data');
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hitListData === null) return;
    fetchHitList(scoringWeights)
      .then(setHitListData)
      .catch(() => toast.error('Failed to refresh scores'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoringWeights]);

  // ─── Derived Data ──────────────────────────────────────────────────────────

  const newDsps = hitListData?.new_companies ?? [];
  const top20 = newDsps.slice(0, 20);

  const regionOptions = Array.from(new Set(newDsps.flatMap(d => d.countries))).sort();
  const industryOptions = Array.from(new Set(newDsps.flatMap(d => d.industries))).sort();

  const filteredNewDsps = newDsps.filter(d => {
    const regionOk = selectedRegion === 'all' || d.countries.includes(selectedRegion);
    const industryOk = selectedIndustry === 'all' || d.industries.includes(selectedIndustry);
    return regionOk && industryOk;
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

  const exportPartners = () => {
    exportCsv('flytbase-partners.csv',
      partners.map(p => [p.name, p.region ?? '', p.type ?? '', p.website ?? '', p.linkedin ?? '']),
      ['Name', 'Region', 'Type', 'Website', 'LinkedIn'],
    );
  };

  const exportNewDsps = () => {
    exportCsv('new-dsps.csv',
      filteredNewDsps.map(d => [
        d.name, d.countries.join('; '), d.industries.join('; '),
        String(d.mention_count), d.signal_types.join('; '),
        d.website ?? '', d.linkedin ?? '',
      ]),
      ['Company', 'Countries', 'Industries', 'Mentions', 'Signals', 'Website', 'LinkedIn'],
    );
  };

  const exportTop20 = () => {
    exportCsv('top-20-targets.csv',
      top20.map((d, i) => [
        String(i + 1), d.name, d.hit_score.toFixed(2),
        d.countries.join('; '), d.industries.join('; '),
        d.website ?? '', d.linkedin ?? '', String(d.articles.length),
      ]),
      ['Rank', 'Company', 'Hit Score', 'Countries', 'Industries', 'Website', 'LinkedIn', 'Articles'],
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'FLYTBASE PARTNERS', value: partners.length, tab: 0 },
          { label: 'NEW DSPS FOUND',    value: newDsps.length,  tab: 1 },
          { label: 'TOP 20 TARGETS',    value: Math.min(20, top20.length), tab: 2 },
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
          { label: `New DSPs (${newDsps.length})`, tab: 1 },
          { label: 'Top 20 Targets', tab: 2 },
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
                  <th style={sTH}>NAME</th>
                  <th style={sTH}>REGION</th>
                  <th style={sTH}>TYPE</th>
                  <th style={sTH}>WEBSITE</th>
                  <th style={sTH}>LINKEDIN</th>
                </tr>
              </thead>
              <tbody>
                {partners.map(p => (
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
              <h2 style={sH2}>New DSPs</h2>
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
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={sTable}>
              <thead>
                <tr style={sTHeadRow}>
                  <th style={{ ...sTH, width: '20%' }}>COMPANY</th>
                  <th style={{ ...sTH, width: '14%' }}>REGION</th>
                  <th style={{ ...sTH, width: '22%' }}>INDUSTRY</th>
                  <th style={{ ...sTH, width: '8%' }}>MENTIONS</th>
                  <th style={{ ...sTH, width: '14%' }}>SIGNAL</th>
                  <th style={{ ...sTH, width: '10%' }}>WEBSITE</th>
                  <th style={{ ...sTH, width: '10%' }}>LINKEDIN</th>
                  <th style={{ ...sTH, width: '2%' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredNewDsps.length === 0 && (
                  <tr><td colSpan={8} style={{ ...sTD, textAlign: 'center', color: '#9CA3AF', padding: 40 }}>No DSPs match the selected filters</td></tr>
                )}
                {filteredNewDsps.map(dsp => (
                  <React.Fragment key={dsp.normalized_name}>
                    <tr style={sClickableRow} onClick={() => toggleRow(dsp.normalized_name)}>
                      <td style={{ ...sTD, fontWeight: 600, color: '#111827' }}>{dsp.name}</td>
                      <td style={sTD}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {dsp.countries.length
                            ? dsp.countries.map(c => <span key={c} style={sCountryTag}>{c}</span>)
                            : <span style={{ color: '#D1D5DB' }}>—</span>}
                        </div>
                      </td>
                      <td style={{ ...sTD, fontSize: 13, color: '#4B5563' }}>{dsp.industries.join(', ') || '—'}</td>
                      <td style={{ ...sTD, textAlign: 'center' as const }}>{dsp.mention_count}</td>
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
                      <td style={{ ...sTD, color: '#CBD5E1', fontSize: 11, paddingLeft: 0 }}>
                        {expandedRows[dsp.normalized_name] ? '▼' : '▶'}
                      </td>
                    </tr>
                    {expandedRows[dsp.normalized_name] && (
                      <tr>
                        <td colSpan={8} style={sExpandedCell}>
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab 3: Top 20 Targets ── */}
      {activeTab === 2 && (
        <div style={sCard}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h2 style={sH2}>Top 20 Targets</h2>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 3 }}>
                Ranked by region &amp; industry fit — click any row to see source articles
              </div>
            </div>
            <button onClick={exportTop20} style={sBtnSecondary}>Export CSV</button>
          </div>

          {/* Compact scoring controls */}
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end', padding: '14px 16px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 20 }}>
            {(['regionWeight', 'industryWeight'] as const).map(key => (
              <div key={key} style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 500 }}>
                    {key === 'regionWeight' ? 'Region Weight' : 'Industry Weight'}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#15803D' }}>
                    {(scoringWeights[key] * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range" min="0" max="1" step="0.01"
                  value={scoringWeights[key]}
                  onChange={e => setScoringWeights(w => ({ ...w, [key]: parseFloat(e.target.value) }))}
                  style={{ width: '100%', accentColor: '#15803D', height: 4 }}
                />
              </div>
            ))}
            <div style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap' as const, paddingBottom: 2 }}>
              Americas/Europe = High region · Security, Oil&amp;Gas, Mining = High industry
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={sTable}>
              <thead>
                <tr style={sTHeadRow}>
                  <th style={{ ...sTH, width: 40 }}>#</th>
                  <th style={{ ...sTH, width: '20%' }}>COMPANY</th>
                  <th style={{ ...sTH, width: 80 }}>SCORE</th>
                  <th style={{ ...sTH, width: '16%' }}>REGION</th>
                  <th style={{ ...sTH, width: '20%' }}>INDUSTRY</th>
                  <th style={{ ...sTH, width: 100 }}>WEBSITE</th>
                  <th style={{ ...sTH, width: 100 }}>LINKEDIN</th>
                  <th style={{ ...sTH, width: 90 }}>ARTICLES</th>
                  <th style={{ ...sTH, width: 28 }}></th>
                </tr>
              </thead>
              <tbody>
                {top20.length === 0 && (
                  <tr><td colSpan={9} style={{ ...sTD, textAlign: 'center', color: '#9CA3AF', padding: 40 }}>No DSPs available for ranking</td></tr>
                )}
                {top20.map((dsp, i) => {
                  const key = `top-${dsp.normalized_name}`;
                  return (
                    <React.Fragment key={key}>
                      <tr style={sClickableRow} onClick={() => toggleRow(key)}>
                        <td style={{ ...sTD, fontWeight: 700, color: '#9CA3AF', fontSize: 13 }}>{i + 1}</td>
                        <td style={{ ...sTD, fontWeight: 600, color: '#111827' }}>{dsp.name}</td>
                        <td style={{ ...sTD, fontWeight: 700, color: '#15803D', fontSize: 15 }}>{dsp.hit_score.toFixed(2)}</td>
                        <td style={sTD}><RegionPriority countries={dsp.countries} /></td>
                        <td style={sTD}><IndustryPriority industries={dsp.industries} /></td>
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
                          <td colSpan={9} style={sExpandedCell}>
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

export { PartnerDashboard };
