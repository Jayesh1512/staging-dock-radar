"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { CAMPAIGN_NAME, CAMPAIGN_KEYWORDS, CAMPAIGN_WEST_REGIONS, CAMPAIGN_EAST_REGIONS, DEFAULTS } from '@/lib/constants';
import type { Run, Article, ArticleWithScore } from '@/lib/types';

// ─── 52-Bucket Generator ──────────────────────────────────────────────────────

interface Bucket {
  week: number;           // 1-26
  group: 'West' | 'East';
  label: string;          // "W1 West"
  start_date: string;     // YYYY-MM-DD
  end_date: string;       // YYYY-MM-DD
  regions: readonly string[];
}

function generateBuckets(): Bucket[] {
  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - 6);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));

  const buckets: Bucket[] = [];
  for (let w = 0; w < 26; w++) {
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + w * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const sd = weekStart.toISOString().slice(0, 10);
    const ed = weekEnd.toISOString().slice(0, 10);

    buckets.push({
      week: w + 1, group: 'West', label: `W${w + 1} West`,
      start_date: sd, end_date: ed, regions: CAMPAIGN_WEST_REGIONS,
    });
    buckets.push({
      week: w + 1, group: 'East', label: `W${w + 1} East`,
      start_date: sd, end_date: ed, regions: CAMPAIGN_EAST_REGIONS,
    });
  }
  return buckets;
}

// ─── Status Types ──────────────────────────────────────────────────────────────

type BucketPhase = 'pending' | 'collecting' | 'collected' | 'scoring' | 'scored' | 'failed';

interface BucketState {
  phase: BucketPhase;
  runId?: string;
  articles?: Article[];
  articlesCollected?: number;
  articlesScored?: number;
  scoreResults?: ArticleWithScore[];
  error?: string;
}

const PHASE_COLORS: Record<BucketPhase, { bg: string; text: string; dot: string }> = {
  pending:    { bg: '#F3F4F6', text: '#6B7280', dot: '#D1D5DB' },
  collecting: { bg: '#DBEAFE', text: '#2563EB', dot: '#2563EB' },
  collected:  { bg: '#FEF9C3', text: '#A16207', dot: '#CA8A04' },
  scoring:    { bg: '#DBEAFE', text: '#2563EB', dot: '#2563EB' },
  scored:     { bg: '#DCFCE7', text: '#166534', dot: '#16A34A' },
  failed:     { bg: '#FEE2E2', text: '#991B1B', dot: '#DC2626' },
};

/** Score campaign articles in chunks of 10 to avoid LLM output truncation */
const CAMPAIGN_SCORE_CHUNK = 10;

async function scoreChunked(articles: Article[]): Promise<ArticleWithScore[]> {
  const allResults: ArticleWithScore[] = [];
  for (let i = 0; i < articles.length; i += CAMPAIGN_SCORE_CHUNK) {
    const chunk = articles.slice(i, i + CAMPAIGN_SCORE_CHUNK);
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        articles: chunk,
        minScore: DEFAULTS.minScore,
        campaign: CAMPAIGN_NAME,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? `Score failed (HTTP ${res.status})`);
    }
    const data = await res.json();
    const results: ArticleWithScore[] = data.results ?? [];

    // Truncation detection: if < 50% of articles got a non-zero score or non-null company, warn
    const meaningful = results.filter(r => r.scored.relevance_score > 0 || r.scored.company);
    if (meaningful.length < chunk.length * 0.3 && chunk.length > 3) {
      console.warn(`[campaign] Possible LLM truncation: ${meaningful.length}/${chunk.length} articles scored meaningfully in chunk ${Math.floor(i / CAMPAIGN_SCORE_CHUNK) + 1}`);
    }

    allResults.push(...results);
  }
  return allResults;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function CampaignPanel() {
  const [buckets] = useState(generateBuckets);
  const [states, setStates] = useState<Record<string, BucketState>>({});
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);

  // Load existing campaign runs from DB to restore status + scoreResults
  useEffect(() => {
    async function loadCampaignRuns() {
      try {
        const res = await fetch('/api/runs');
        if (!res.ok) return;
        const data = await res.json() as { runs: Run[]; scoredArticles: ArticleWithScore[] };
        const campaignRuns = data.runs.filter(r => r.campaign === CAMPAIGN_NAME);
        const allScored: ArticleWithScore[] = data.scoredArticles ?? [];

        // Index scored articles by run_id for fast lookup
        const scoredByRunId = new Map<string, ArticleWithScore[]>();
        for (const item of allScored) {
          const rid = item.article.run_id;
          if (!scoredByRunId.has(rid)) scoredByRunId.set(rid, []);
          scoredByRunId.get(rid)!.push(item);
        }

        // Sort runs oldest-first so we match the right week bucket
        const sorted = [...campaignRuns].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );

        const restored: Record<string, BucketState> = {};
        for (const run of sorted) {
          const runRegions = new Set(run.regions);
          const isWest = CAMPAIGN_WEST_REGIONS.some(r => runRegions.has(r));
          const isEast = CAMPAIGN_EAST_REGIONS.some(r => runRegions.has(r));
          const group = isWest ? 'West' : isEast ? 'East' : null;
          if (!group) continue;

          for (const bucket of buckets) {
            if (bucket.group !== group) continue;
            const key = bucket.label;
            if (restored[key]?.phase === 'scored') continue;

            const runScored = scoredByRunId.get(run.id) ?? [];
            const articlesScored = runScored.filter(
              r => r.scored.relevance_score >= DEFAULTS.minScore && !r.scored.is_duplicate,
            ).length;

            restored[key] = {
              phase: run.status === 'failed' ? 'failed' : 'scored',
              runId: run.id,
              articlesCollected: run.articles_stored,
              scoreResults: runScored.length > 0 ? runScored : undefined,
              articlesScored,
            };
            break;
          }
        }
        setStates(prev => ({ ...prev, ...restored }));
      } catch { /* non-fatal */ }
    }
    loadCampaignRuns();
  }, [buckets]);

  // ─── Step 1: Collect only ───────────────────────────────────────────────────
  const collectBucket = useCallback(async (bucket: Bucket) => {
    const key = bucket.label;
    setStates(prev => ({ ...prev, [key]: { phase: 'collecting' } }));

    try {
      const res = await fetch('/api/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: [...CAMPAIGN_KEYWORDS],
          regions: [...bucket.regions],
          filterDays: 7,
          maxArticles: DEFAULTS.maxArticles,
          minScore: DEFAULTS.minScore,
          start_date: bucket.start_date,
          end_date: bucket.end_date,
          campaign: CAMPAIGN_NAME,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `Collect failed (HTTP ${res.status})`);
      }

      const data = await res.json();
      const articles: Article[] = data.articles ?? [];

      setStates(prev => ({
        ...prev,
        [key]: {
          phase: 'collected',
          runId: data.runId,
          articles,
          articlesCollected: articles.length,
        },
      }));
    } catch (err) {
      setStates(prev => ({
        ...prev,
        [key]: { phase: 'failed', error: err instanceof Error ? err.message : 'Unknown error' },
      }));
    }
  }, []);

  // ─── Step 2: Score collected articles (in chunks of 10) ─────────────────────
  const scoreBucket = useCallback(async (bucket: Bucket) => {
    const key = bucket.label;
    const current = states[key];
    if (!current?.articles || current.articles.length === 0) return;

    setStates(prev => ({ ...prev, [key]: { ...prev[key], phase: 'scoring' } }));

    try {
      const results = await scoreChunked(current.articles);
      const aboveThreshold = results.filter(
        r => r.scored.relevance_score >= DEFAULTS.minScore && !r.scored.is_duplicate && !r.scored.drop_reason
      ).length;

      setStates(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          phase: 'scored',
          articlesScored: aboveThreshold,
          scoreResults: results,
        },
      }));
    } catch (err) {
      setStates(prev => ({
        ...prev,
        [key]: { ...prev[key], phase: 'failed', error: err instanceof Error ? err.message : 'Unknown error' },
      }));
    }
  }, [states]);

  // ─── Summary Stats ──────────────────────────────────────────────────────────
  const stateValues = Object.values(states);
  const completedCount = stateValues.filter(s => s.phase === 'scored').length;
  const totalCollected = stateValues.reduce((sum, s) => sum + (s.articlesCollected ?? 0), 0);
  const totalScored = stateValues.reduce((sum, s) => sum + (s.articlesScored ?? 0), 0);
  const total25to49 = stateValues.reduce((sum, s) => {
    if (!s.scoreResults) return sum;
    return sum + s.scoreResults.filter(r => r.scored.relevance_score >= 25 && r.scored.relevance_score < 50 && !r.scored.is_duplicate).length;
  }, 0);

  const weeks = Array.from({ length: 26 }, (_, i) => i + 1);

  return (
    <div className="bg-white" style={{ border: '1px solid var(--dr-border)', borderRadius: 'var(--dr-radius-card)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--dr-border)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold" style={{ fontSize: 16, color: 'var(--dr-text-primary)' }}>
              DSP 6-Month Campaign
            </h2>
            <p style={{ fontSize: 12, color: 'var(--dr-text-muted)', marginTop: 2 }}>
              26 weeks × 2 region groups = 52 runs &middot; {CAMPAIGN_KEYWORDS.length} keywords &middot; 16 regions
            </p>
            <p style={{ fontSize: 11, color: 'var(--dr-text-disabled)', marginTop: 4 }}>
              Manual flow: Collect &rarr; review titles &rarr; Score (10 articles/batch to prevent LLM truncation)
            </p>
          </div>
          <div className="flex items-center gap-4">
            <StatBox value={completedCount} label="/ 52 runs" color="var(--dr-blue)" />
            <StatBox value={totalCollected} label="collected" color="#6B7280" />
            <StatBox value={totalScored} label="at 50+" color="#166534" />
            <StatBox value={total25to49} label="at 25-49" color="#A16207" />
          </div>
        </div>
      </div>

      {/* Bucket Grid */}
      <div style={{ padding: '12px 20px 20px' }}>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
          {weeks.map((weekNum) => {
            const westBucket = buckets.find(b => b.week === weekNum && b.group === 'West')!;
            const eastBucket = buckets.find(b => b.week === weekNum && b.group === 'East')!;
            const westState = states[westBucket.label] ?? { phase: 'pending' as BucketPhase };
            const eastState = states[eastBucket.label] ?? { phase: 'pending' as BucketPhase };
            const isExpanded = expandedWeek === weekNum;

            return (
              <div key={weekNum} style={{ border: '1px solid var(--dr-border)', borderRadius: 8, overflow: 'hidden' }}>
                <button
                  onClick={() => setExpandedWeek(isExpanded ? null : weekNum)}
                  className="w-full flex items-center justify-between cursor-pointer"
                  style={{ background: '#FAFAFA', padding: '8px 12px', border: 'none', borderBottom: isExpanded ? '1px solid var(--dr-border)' : 'none' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold" style={{ fontSize: 12.5, color: 'var(--dr-text-primary)' }}>
                      Week {weekNum}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--dr-text-muted)' }}>
                      {westBucket.start_date} &rarr; {westBucket.end_date}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <PhaseDot phase={westState.phase} label="W" />
                    <PhaseDot phase={eastState.phase} label="E" />
                    <span style={{ fontSize: 11, color: 'var(--dr-text-muted)', marginLeft: 4 }}>
                      {isExpanded ? '▾' : '▸'}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div style={{ padding: '10px 12px' }} className="flex flex-col gap-2">
                    <BucketRow bucket={westBucket} state={westState} onCollect={() => collectBucket(westBucket)} onScore={() => scoreBucket(westBucket)} />
                    <BucketRow bucket={eastBucket} state={eastState} onCollect={() => collectBucket(eastBucket)} onScore={() => scoreBucket(eastBucket)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatBox({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="text-center" style={{ fontSize: 11, color: 'var(--dr-text-muted)' }}>
      <div className="font-bold" style={{ fontSize: 18, color }}>{value}</div>
      <div>{label}</div>
    </div>
  );
}

function PhaseDot({ phase, label }: { phase: BucketPhase; label: string }) {
  const color = PHASE_COLORS[phase];
  return (
    <span
      title={`${label}: ${phase}`}
      className="inline-flex items-center justify-center rounded-full font-bold"
      style={{ width: 18, height: 18, fontSize: 8, background: color.bg, color: color.text, border: `1.5px solid ${color.dot}` }}
    >
      {label}
    </span>
  );
}

function ScoredResultsView({ results }: { results: ArticleWithScore[] }) {
  const [showDropped, setShowDropped] = useState(false);
  const sorted = [...results].sort((a, b) => b.scored.relevance_score - a.scored.relevance_score);
  const scored50Plus = sorted.filter(r => r.scored.relevance_score >= 50 && !r.scored.is_duplicate);
  const scored25to49 = sorted.filter(r => r.scored.relevance_score >= 25 && r.scored.relevance_score < 50 && !r.scored.is_duplicate);
  const dropped = sorted.filter(r => r.scored.relevance_score < 25 || r.scored.is_duplicate);

  return (
    <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
      {/* Scored 50+ */}
      {scored50Plus.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: '#166534', marginBottom: 4, fontWeight: 700 }}>
            SCORED 50+ ({scored50Plus.length}):
          </div>
          <div style={{ marginBottom: 8 }}>
            {scored50Plus.map(r => (
              <ScoreRow key={r.article.id} r={r} />
            ))}
          </div>
        </>
      )}

      {/* Scored 25-49 (weak signals) */}
      {scored25to49.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: '#A16207', marginBottom: 4, fontWeight: 700 }}>
            WEAK SIGNALS 25-49 ({scored25to49.length}):
          </div>
          <div style={{ marginBottom: 8 }}>
            {scored25to49.map(r => (
              <ScoreRow key={r.article.id} r={r} />
            ))}
          </div>
        </>
      )}

      {/* Dropped (<25) — collapsed by default */}
      {dropped.length > 0 && (
        <>
          <button
            onClick={() => setShowDropped(v => !v)}
            className="cursor-pointer"
            style={{ fontSize: 10, color: '#991B1B', fontWeight: 700, background: 'none', border: 'none', padding: 0, marginBottom: 4 }}
          >
            {showDropped ? '▾' : '▸'} DROPPED / NOISE ({dropped.length}):
          </button>
          {showDropped && (
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {dropped.map(r => (
                <ScoreRow key={r.article.id} r={r} muted />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ScoreRow({ r, muted }: { r: ArticleWithScore; muted?: boolean }) {
  const scoreColor = r.scored.relevance_score >= 75 ? '#166534'
    : r.scored.relevance_score >= 50 ? '#2563EB'
    : r.scored.relevance_score >= 25 ? '#A16207'
    : '#991B1B';

  return (
    <div className="flex items-center gap-2" style={{ fontSize: 11, padding: '3px 0', opacity: muted ? 0.6 : 1 }}>
      <span className="font-bold" style={{ minWidth: 24, color: scoreColor, textAlign: 'right' }}>
        {r.scored.relevance_score}
      </span>
      <span className="font-semibold truncate" style={{ color: '#C2410C', minWidth: 80, maxWidth: 100 }} title={r.scored.company ?? undefined}>
        {r.scored.company ?? '—'}
      </span>
      <a
        href={r.article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate hover:underline"
        style={{ color: muted ? 'var(--dr-text-disabled)' : 'var(--dr-blue)', flex: 1 }}
        title={r.article.title}
      >
        {r.article.title}
      </a>
      {r.scored.drop_reason && (
        <span style={{ fontSize: 10, color: '#991B1B', whiteSpace: 'nowrap' }} title={r.scored.drop_reason}>
          {r.scored.drop_reason.slice(0, 30)}
        </span>
      )}
    </div>
  );
}

function StatPill({ value, label, color, bg }: { value: number; label: string; color: string; bg: string }) {
  return (
    <span
      style={{ fontSize: 10, fontWeight: 600, color, background: bg, borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap' }}
      title={`${value} ${label}`}
    >
      {value} <span style={{ fontWeight: 400, opacity: 0.8 }}>{label}</span>
    </span>
  );
}

function BucketRow({ bucket, state, onCollect, onScore }: { bucket: Bucket; state: BucketState; onCollect: () => void; onScore: () => void }) {
  const [openStep, setOpenStep] = useState<1 | 2 | 3 | null>(null);
  const color = PHASE_COLORS[state.phase];
  const progress = ({ pending: 0, collecting: 0, failed: 0, collected: 1, scoring: 2, scored: 3 } as Record<BucketPhase, number>)[state.phase] ?? 0;

  const scoreBreakdown = state.scoreResults ? {
    r50: state.scoreResults.filter(r => r.scored.relevance_score >= 50 && !r.scored.is_duplicate).length,
    r25: state.scoreResults.filter(r => r.scored.relevance_score >= 25 && r.scored.relevance_score < 50 && !r.scored.is_duplicate).length,
    dropped: state.scoreResults.filter(r => r.scored.relevance_score < 25 || r.scored.is_duplicate).length,
    total: state.scoreResults.length,
  } : null;

  // Auto-open the relevant step when phase changes
  useEffect(() => {
    if (state.phase === 'collected') setOpenStep(2);
    if (state.phase === 'scored') setOpenStep(3);
  }, [state.phase]);

  const toggle = (step: 1 | 2 | 3) => setOpenStep(s => s === step ? null : step);

  const stepRowStyle: React.CSSProperties = { borderTop: '1px solid rgba(0,0,0,0.07)', paddingTop: 3, marginTop: 3 };
  const stepHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0' };

  return (
    <div style={{ background: color.bg, borderRadius: 6, padding: '8px 10px' }}>

      {/* ── Bucket header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <div className="flex items-center gap-2">
          <span className="rounded-full" style={{ width: 7, height: 7, background: color.dot, flexShrink: 0 }} />
          <span className="font-bold" style={{ fontSize: 12, color: color.text }}>{bucket.group}</span>
          <span
            style={{ fontSize: 10, color: 'var(--dr-text-muted)', cursor: 'help', textDecoration: 'underline dotted' }}
            title={bucket.regions.join(', ')}
          >
            {bucket.regions.length} regions
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {scoreBreakdown ? (
            <>
              <StatPill value={scoreBreakdown.r50}    label="≥50"    color="#166534" bg="#DCFCE7" />
              <StatPill value={scoreBreakdown.r25}    label="25-49"  color="#92400E" bg="#FEF3C7" />
              <StatPill value={scoreBreakdown.dropped} label="drop"   color="#6B7280" bg="#F3F4F6" />
            </>
          ) : state.articlesCollected != null ? (
            <span style={{ fontSize: 10.5, color: 'var(--dr-text-muted)' }}>{state.articlesCollected} collected</span>
          ) : null}
          {(state.phase === 'collecting' || state.phase === 'scoring') && (
            <span className="flex items-center gap-1" style={{ fontSize: 10.5, color: '#2563EB', fontWeight: 600 }}>
              <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
              {state.phase === 'collecting' ? 'Collecting…' : 'Scoring…'}
            </span>
          )}
        </div>
      </div>

      {/* ── Step 1: Collect ───────────────────────────────────── */}
      <div style={stepRowStyle}>
        <div style={{ ...stepHeaderStyle, cursor: 'pointer' }} onClick={() => toggle(1)}>
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: 9, color: 'var(--dr-text-disabled)', fontWeight: 700, letterSpacing: '0.05em' }}>S1</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: color.text }}>Collect</span>
            {state.articlesCollected != null && (
              <span style={{ fontSize: 10, color: 'var(--dr-text-muted)' }}>· {state.articlesCollected} articles</span>
            )}
            {progress >= 1 && <span style={{ fontSize: 10, color: '#166534' }}>✓</span>}
          </div>
          <div className="flex items-center gap-1.5">
            {(state.phase === 'pending' || state.phase === 'failed') && (
              <button
                onClick={(e) => { e.stopPropagation(); onCollect(); }}
                className="cursor-pointer"
                style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'var(--dr-blue)', color: '#fff', border: 'none' }}
              >
                {state.phase === 'failed' ? 'Retry' : 'Collect'}
              </button>
            )}
            <span style={{ fontSize: 10, color: 'var(--dr-text-muted)' }}>{openStep === 1 ? '▾' : '▸'}</span>
          </div>
        </div>
        {openStep === 1 && (
          <div style={{ paddingLeft: 14, paddingBottom: 4, fontSize: 10, color: 'var(--dr-text-muted)', lineHeight: 1.5 }}>
            {state.error
              ? <span style={{ color: '#991B1B' }}>{state.error}</span>
              : state.articlesCollected != null
                ? <>{state.articlesCollected} articles · {bucket.start_date} → {bucket.end_date}</>
                : <>Click Collect to fetch articles for this week</>}
          </div>
        )}
      </div>

      {/* ── Step 2: Review Titles ────────────────────────────── */}
      <div style={{ ...stepRowStyle, opacity: progress < 1 ? 0.4 : 1 }}>
        <div
          style={{ ...stepHeaderStyle, cursor: progress >= 1 ? 'pointer' : 'default' }}
          onClick={() => progress >= 1 && toggle(2)}
        >
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: 9, color: 'var(--dr-text-disabled)', fontWeight: 700, letterSpacing: '0.05em' }}>S2</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: color.text }}>Review Titles</span>
            {state.articles && (
              <span style={{ fontSize: 10, color: 'var(--dr-text-muted)' }}>· {state.articles.length}</span>
            )}
          </div>
          {progress >= 1 && (
            <span style={{ fontSize: 10, color: 'var(--dr-text-muted)' }}>{openStep === 2 ? '▾' : '▸'}</span>
          )}
        </div>
        {openStep === 2 && state.articles && state.articles.length > 0 && (
          <div style={{ maxHeight: 300, overflowY: 'auto', paddingLeft: 14, paddingBottom: 6 }}>
            {state.articles.map((a, i) => (
              <div key={a.id} className="flex items-start gap-1" style={{ fontSize: 10.5, padding: '2px 0', lineHeight: 1.4 }}>
                <span style={{ color: 'var(--dr-text-disabled)', minWidth: 16, flexShrink: 0 }}>{i + 1}.</span>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={a.title}
                  style={{ color: 'var(--dr-blue)', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                  onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                >
                  {a.title}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Step 3: Score & Results ──────────────────────────── */}
      <div style={{ ...stepRowStyle, opacity: progress < 1 ? 0.4 : 1 }}>
        <div
          style={{ ...stepHeaderStyle, cursor: progress >= 1 ? 'pointer' : 'default' }}
          onClick={() => progress >= 1 && toggle(3)}
        >
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: 9, color: 'var(--dr-text-disabled)', fontWeight: 700, letterSpacing: '0.05em' }}>S3</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: color.text }}>Score & Results</span>
            {scoreBreakdown && (
              <span style={{ fontSize: 10, color: '#166534', fontWeight: 600 }}>· {scoreBreakdown.r50} strong</span>
            )}
            {progress === 3 && <span style={{ fontSize: 10, color: '#166534' }}>✓</span>}
          </div>
          <div className="flex items-center gap-1.5">
            {state.phase === 'collected' && (
              <button
                onClick={(e) => { e.stopPropagation(); onScore(); }}
                className="cursor-pointer"
                style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#C2410C', color: '#fff', border: 'none' }}
              >
                Score ({state.articlesCollected})
              </button>
            )}
            {progress >= 1 && (
              <span style={{ fontSize: 10, color: 'var(--dr-text-muted)' }}>{openStep === 3 ? '▾' : '▸'}</span>
            )}
          </div>
        </div>
        {openStep === 3 && state.scoreResults && (
          <div style={{ paddingLeft: 14, paddingBottom: 6 }}>
            <ScoredResultsView results={state.scoreResults} />
          </div>
        )}
      </div>

    </div>
  );
}
