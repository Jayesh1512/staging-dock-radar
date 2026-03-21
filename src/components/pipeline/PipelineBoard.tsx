'use client';

import React, { useState } from 'react';
import { KanbanBoard } from './KanbanBoard';
import { usePipeline } from './PipelineContext';

type ViewMode = 'kanban' | 'list';

export default function PipelineBoard() {
  const { cards, loading, moveStage, renameDeal, crmReady, undoToast, undoArchive, refreshPipeline } = usePipeline();
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [signalFilter, setSignalFilter] = useState('all');

  const hasActiveFilter = search !== '' || regionFilter !== 'all' || signalFilter !== 'all';

  // ─── Dynamic filter options ───────────────────────────────────────────────

  const regionOptions = Array.from(new Set(cards.map(c => c.region))).sort();
  const signalOptions = Array.from(new Set(cards.map(c => c.signal))).sort();

  // ─── Filtered cards ───────────────────────────────────────────────────────

  const filteredCards = cards.filter(c => {
    const matchSearch =
      !search ||
      c.dealName.toLowerCase().includes(search.toLowerCase()) ||
      c.companyName.toLowerCase().includes(search.toLowerCase());

    const matchRegion =
      regionFilter === 'all' ||
      c.region.toLowerCase() === regionFilter.toLowerCase();

    const matchSignal =
      signalFilter === 'all' ||
      c.signal.toLowerCase() === signalFilter.toLowerCase();

    return matchSearch && matchRegion && matchSignal;
  });

  // ─── Stats (always from full cards, not filtered) ─────────────────────────

  const activeCards = cards.filter(c => c.stage !== 'lost_archived');
  const computeDays = (c: typeof cards[number]) =>
    c.createdAt
      ? Math.max(0, Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 86_400_000))
      : c.daysAgo;
  const avgDays = activeCards.length > 0
    ? (activeCards.reduce((sum, c) => sum + computeDays(c), 0) / activeCards.length).toFixed(1)
    : '—';

  const stats = [
    { label: 'TOTAL LEADS',        value: String(activeCards.length), color: '#111827', sub: `${cards.length} total in pipeline` },
    { label: 'IN PROSPECT',        value: String(activeCards.filter(c => c.stage === 'prospect').length), color: '#4F46E5', sub: 'newly added' },
    { label: 'ACTIVE OUTREACH',    value: String(activeCards.filter(c => ['connecting_linkedin', 'connecting_email'].includes(c.stage)).length), color: '#2563EB', sub: 'LinkedIn + Email' },
    { label: 'AI SDR ACTIVE',      value: `${activeCards.filter(c => c.stage === 'scheduling_meeting').length} ⚡`, color: '#D97706', sub: 'scheduling meetings' },
    { label: 'SENT TO CRM',        value: String(activeCards.filter(c => c.stage === 'sent_to_crm').length), color: '#16A34A', sub: 'this month' },
    { label: 'AVG. DAYS IN STAGE', value: avgDays, color: '#111827', sub: 'days per stage' },
    { label: 'LOST / ARCHIVED',    value: String(cards.filter(c => c.stage === 'lost_archived').length), color: '#EF4444', sub: 'excluded from pipeline' },
  ];

  const clearFilters = () => {
    setSearch('');
    setRegionFilter('all');
    setSignalFilter('all');
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshPipeline();
    setRefreshing(false);
  };

  const handleExportCsv = () => {
    const escape = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const headers = ['Deal Name', 'Company', 'Stage', 'Score', 'Region', 'Signal', 'Source', 'Days Ago', 'Known Partner'];
    const rows = cards.map(c => {
      const days = c.createdAt
        ? Math.max(0, Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 86_400_000))
        : c.daysAgo;
      return [c.dealName, c.companyName, c.stage, c.score, c.region, c.signal, c.source, String(days), c.isKnownPartner ? 'Yes' : 'No'];
    });
    const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pipeline-leads.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>Pipeline</h1>
          <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 4 }}>All Deals</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={handleRefresh} disabled={refreshing} style={{ ...sBtnOutlined, opacity: refreshing ? 0.6 : 1 }}>
            {refreshing ? 'Refreshing…' : '↺ Refresh'}
          </button>
          <button onClick={handleExportCsv} style={sBtnOutlined}>↓ Export CSV</button>
        </div>
      </div>

      {/* View Toggle */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16 }}>
        <button
          onClick={() => setViewMode('list')}
          style={{
            ...sToggleBtn,
            borderRadius: '6px 0 0 6px',
            background: viewMode === 'list' ? '#4F46E5' : '#fff',
            color: viewMode === 'list' ? '#fff' : '#6B7280',
            borderRight: 'none',
          }}
        >
          ☰ List
        </button>
        <button
          onClick={() => setViewMode('kanban')}
          style={{
            ...sToggleBtn,
            borderRadius: '0 6px 6px 0',
            background: viewMode === 'kanban' ? '#4F46E5' : '#fff',
            color: viewMode === 'kanban' ? '#fff' : '#6B7280',
          }}
        >
          ⊞ Kanban
        </button>
      </div>

      {/* ── Stats Bar ── */}
      <div
        style={{
          background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8,
          padding: '16px 24px', display: 'flex', alignItems: 'stretch',
        }}
      >
        {stats.map((stat, idx) => (
          <React.Fragment key={stat.label}>
            {idx > 0 && (
              <div style={{ width: 1, background: '#E5E7EB', margin: '0 16px', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: 0.5, marginBottom: 6, whiteSpace: 'nowrap' }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: stat.color, lineHeight: 1.2, marginBottom: 2 }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                {stat.sub}
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* ── Filter Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <input
          type="text"
          placeholder="🔍 Search deals..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: 200, padding: '7px 12px', fontSize: 13,
            border: '1px solid #D1D5DB', borderRadius: 6,
            background: '#fff', color: '#374151', outline: 'none',
          }}
        />
        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          style={sFilterSelect}
        >
          <option value="all">Region</option>
          {regionOptions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select
          value={signalFilter}
          onChange={(e) => setSignalFilter(e.target.value)}
          style={sFilterSelect}
        >
          <option value="all">Signal</option>
          {signalOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {hasActiveFilter && (
          <button
            onClick={clearFilters}
            style={{
              fontSize: 12, fontWeight: 500, color: '#6B7280', background: 'transparent',
              border: 'none', cursor: 'pointer', padding: '4px 8px',
              textDecoration: 'underline',
            }}
          >
            ✕ Clear filters
          </button>
        )}
        <div style={{ flex: 1 }} />
      </div>

      {/* ── Board ── */}
      {loading ? (
        <div style={{ marginTop: 20, padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
          Loading pipeline…
        </div>
      ) : viewMode === 'kanban' ? (
        <KanbanBoard
          cards={filteredCards}
          hasActiveFilter={hasActiveFilter}
          onStageChange={moveStage}
          onDealNameChange={renameDeal}
          onCrmReady={crmReady}
        />
      ) : (
        <div style={{ marginTop: 20, padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14, background: '#F9FAFB', borderRadius: 8, border: '1px dashed #D1D5DB' }}>
          List view coming soon
        </div>
      )}

      {/* ── Archive Undo Toast ── */}
      {undoToast && (
        <div
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
            background: '#1F2937', color: '#fff', borderRadius: 8,
            padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)', fontSize: 13,
          }}
        >
          <span>{undoToast.name} archived</span>
          <button
            onClick={undoArchive}
            style={{
              background: 'transparent', border: '1px solid #6B7280', borderRadius: 5,
              color: '#93C5FD', fontSize: 12, fontWeight: 600, padding: '3px 10px',
              cursor: 'pointer',
            }}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const sBtnOutlined: React.CSSProperties = {
  padding: '7px 14px', fontSize: 13, fontWeight: 600,
  border: '1px solid #D1D5DB', borderRadius: 7,
  background: '#fff', color: '#374151', cursor: 'pointer',
};

const sToggleBtn: React.CSSProperties = {
  padding: '6px 14px', fontSize: 12, fontWeight: 600,
  border: '1px solid #D1D5DB', cursor: 'pointer',
};

const sFilterSelect: React.CSSProperties = {
  padding: '7px 12px', fontSize: 13,
  border: '1px solid #D1D5DB', borderRadius: 6,
  background: '#fff', color: '#374151', cursor: 'pointer',
};
