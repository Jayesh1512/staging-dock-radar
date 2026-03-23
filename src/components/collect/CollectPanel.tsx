"use client";
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { KeywordInput } from './KeywordInput';
import { SourcesPanel } from './SourcesPanel';
import { DateFilter } from './DateFilter';
import { RegionSelector } from './RegionSelector';
import { PipelineStats } from './PipelineStats';
import { useCollect } from '@/hooks/use-collect';
import type { ArticleSource, CollectResult } from '@/lib/types';
import { CORE_8_REGIONS, LATEST_ARTICLES_24H_KEYWORD } from '@/lib/constants';

interface CollectPanelProps {
  keywords: string[];
  maxArticles: number;
  onAddKeyword: (kw: string) => void;
  onRemoveKeyword: (i: number) => void;
  filterDays: number;
  onFilterDaysChange: (days: number) => void;
  onCollectComplete: (result: CollectResult) => void;
  collectionComplete: boolean;
  minScore: number;
}

const COLLECTABLE: ArticleSource[] = ['google_news', 'linkedin', 'latest_articles_24h'];

/** Single control for LinkedIn: quick mode + browser timeout (collect-linkedin API). */
const LINKEDIN_TIMING_PRESETS = [
  {
    value: 'quick30',
    label: '~30 second quick scrape (fewer scrolls & pauses, no hydration; ~48s limit)',
    linkedin30SecScrape: true,
    browserTimeoutMs: 48_000,
  },
  { value: 'std_30000', label: '30 seconds', linkedin30SecScrape: false, browserTimeoutMs: 30_000 },
  { value: 'std_45000', label: '45 seconds', linkedin30SecScrape: false, browserTimeoutMs: 45_000 },
  { value: 'std_60000', label: '60 seconds', linkedin30SecScrape: false, browserTimeoutMs: 60_000 },
  { value: 'std_120000', label: '2 minutes', linkedin30SecScrape: false, browserTimeoutMs: 120_000 },
  { value: 'std_180000', label: '3 minutes (default)', linkedin30SecScrape: false, browserTimeoutMs: 180_000 },
  { value: 'std_300000', label: '5 minutes', linkedin30SecScrape: false, browserTimeoutMs: 300_000 },
] as const;

function linkedinPresetByValue(v: string) {
  return LINKEDIN_TIMING_PRESETS.find((p) => p.value === v) ?? LINKEDIN_TIMING_PRESETS[5];
}

function collectingStatusLabel(sources: ArticleSource[], regionCount: number): string {
  const hasLatest24h = sources.includes('latest_articles_24h');
  const hasGoogle = sources.includes('google_news');
  const hasLinkedIn = sources.includes('linkedin');
  if (hasLatest24h && !hasGoogle && !hasLinkedIn) {
    return 'Collecting Latest Articles (24h) — Google News & LinkedIn…';
  }
  return `Collecting from ${regionCount} region${regionCount !== 1 ? 's' : ''}…`;
}

export function CollectPanel({
  keywords,
  maxArticles,
  onAddKeyword,
  onRemoveKeyword,
  filterDays,
  onFilterDaysChange,
  onCollectComplete,
  collectionComplete,
  minScore,
}: CollectPanelProps) {
  const { isCollecting, stats, error, startCollect } = useCollect();
  const [sources, setSources] = useState<ArticleSource[]>([]);
  const [regions, setRegions] = useState<string[]>([...CORE_8_REGIONS]);
  const [linkedinTimingPreset, setLinkedinTimingPreset] = useState<string>('std_180000');
  /** LinkedIn Puppeteer: matches long-standing server default (headed) unless user picks headless. */
  const [linkedinHeadless, setLinkedinHeadless] = useState(false);

  const latestScheduleDefaultTime = '09:00';
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleEnabledDraft, setScheduleEnabledDraft] = useState(true);
  const [scheduleTimeDraft, setScheduleTimeDraft] = useState(latestScheduleDefaultTime);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [latestSchedule, setLatestSchedule] = useState<{
    enabled: boolean;
    timeOfDay: string;
    nextRunAt: string | null;
    lastRunAt: string | null;
    lastStatus?: string | null;
  } | null>(null);

  const liPreset = useMemo(() => linkedinPresetByValue(linkedinTimingPreset), [linkedinTimingPreset]);

  useEffect(() => {
    let alive = true;
    async function loadSchedule() {
      try {
        const res = await fetch('/api/latest-articles/schedule');
        if (!res.ok) return;
        const data = await res.json() as {
          enabled: boolean;
          timeOfDay: string;
          nextRunAt: string | null;
          lastRunAt: string | null;
          lastStatus?: string | null;
        };
        if (!alive) return;
        setLatestSchedule(data);
        setScheduleEnabledDraft(data.enabled);
        setScheduleTimeDraft(data.timeOfDay || latestScheduleDefaultTime);
      } catch {
        // Scheduling is optional — ignore errors.
      }
    }
    loadSchedule();
    return () => { alive = false; };
  }, []);

  const hasGoogle = sources.includes('google_news');
  const hasLinkedIn = sources.includes('linkedin');
  const hasLatest24h = sources.includes('latest_articles_24h');

  const needsUserKeywords = hasGoogle || hasLinkedIn;
  const showDateFilter = needsUserKeywords;
  const showRegionSelector = hasGoogle || hasLinkedIn;
  const showLinkedInTimeout = hasLinkedIn || hasLatest24h;

  const hasCollectableSource = sources.some((s) => COLLECTABLE.includes(s));

  const handleCollect = async () => {
    if (needsUserKeywords && keywords.length === 0) return;
    try {
      const result = await startCollect(keywords, regions, filterDays, maxArticles, sources, {
        ...(liPreset.linkedin30SecScrape && { linkedin30SecScrape: true }),
        linkedinHeadless,
      }, liPreset.browserTimeoutMs);
      onCollectComplete(result);
    } catch {
      // error is already set in hook state — displayed below
    }
  };

  const collectDisabled =
    isCollecting ||
    !hasCollectableSource ||
    (needsUserKeywords && keywords.length === 0);

  const presetLabelStyle = {
    fontSize: 11,
    fontWeight: 600 as const,
    color: 'var(--dr-text-muted)',
    marginBottom: 2,
  };
  const presetValueStyle = {
    fontSize: 13,
    fontWeight: 600 as const,
    color: 'var(--dr-text-secondary)',
    margin: 0,
  };

  return (
    <div className="bg-white" style={{ border: '1px solid var(--dr-border)', borderRadius: 'var(--dr-radius-card)', overflow: 'hidden' }}>
      <div style={{ padding: 20 }}>
        <SourcesPanel selected={sources} onChange={setSources} />

        {hasLatest24h && (
          <div
            style={{
              background: 'var(--dr-surface)',
              border: '1px solid var(--dr-border)',
              borderRadius: 8,
              padding: '12px 14px',
              marginBottom: 14,
            }}
          >
            <div
              className="uppercase"
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                color: 'var(--dr-text-muted)',
                letterSpacing: 0.4,
                marginBottom: 12,
              }}
            >
              Latest Articles (24h)
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <div style={presetLabelStyle}>Keyword</div>
                <p style={presetValueStyle}>{LATEST_ARTICLES_24H_KEYWORD}</p>
              </div>
              <div>
                <div style={presetLabelStyle}>Time window</div>
                <p style={presetValueStyle}>1 day</p>
              </div>
              <div>
                <div style={presetLabelStyle}>Regions (8)</div>
                <p style={{ ...presetValueStyle, fontWeight: 500, lineHeight: 1.45 }}>
                  {CORE_8_REGIONS.join(', ')}
                </p>
              </div>
              <div>
                <div style={presetLabelStyle}>Phase 2 — LinkedIn</div>
                <p style={{ ...presetValueStyle, fontWeight: 500, lineHeight: 1.45 }}>
                  {hasLinkedIn
                    ? 'Uses your keywords and date filter below (single browser run).'
                    : `Same keyword (${LATEST_ARTICLES_24H_KEYWORD}), 1-day filter — runs automatically after Google News.`}
                </p>
              </div>

              <div style={{ paddingTop: 2 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--dr-text-muted)', letterSpacing: 0.35, marginBottom: 8 }}>
                  Auto-run (cron)
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setScheduleModalOpen(true)}
                    style={{
                      background: latestSchedule?.enabled ? 'var(--dr-blue)' : '#fff',
                      color: latestSchedule?.enabled ? '#fff' : 'var(--dr-text)',
                      border: latestSchedule?.enabled ? 'none' : '1px solid var(--dr-border)',
                      padding: '8px 14px',
                      borderRadius: 9,
                      fontSize: 13,
                      fontWeight: 800,
                      letterSpacing: 0.1,
                    }}
                  >
                    {latestSchedule?.enabled ? `Scheduled: ${latestSchedule.timeOfDay}` : 'Schedule Latest Articles'}
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--dr-text-muted)' }}>
                    {latestSchedule?.enabled
                      ? `Next: ${latestSchedule.nextRunAt ? new Date(latestSchedule.nextRunAt).toLocaleString() : '—'}`
                      : 'Not scheduled'}
                  </span>
                </div>
              </div>

              {(stats?.fetchedGoogleNews != null || stats?.fetchedLinkedin != null) && (
                <div
                  style={{
                    marginTop: 4,
                    paddingTop: 12,
                    borderTop: '1px solid var(--dr-border)',
                  }}
                >
                  <div style={presetLabelStyle}>Last collect — raw posts fetched (per source, before cross-source dedup)</div>
                  <p style={{ ...presetValueStyle, fontWeight: 500, lineHeight: 1.5, marginTop: 6 }}>
                    {stats.fetchedGoogleNews != null && (
                      <span>
                        Google News (8 regions): <strong style={{ color: 'var(--dr-text)' }}>{stats.fetchedGoogleNews}</strong>
                      </span>
                    )}
                    {stats.fetchedGoogleNews != null && stats.fetchedLinkedin != null && (
                      <span style={{ color: 'var(--dr-text-muted)', margin: '0 8px' }}>·</span>
                    )}
                    {stats.fetchedLinkedin != null && (
                      <span>
                        LinkedIn: <strong style={{ color: 'var(--dr-text)' }}>{stats.fetchedLinkedin}</strong>
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {needsUserKeywords && (
          <KeywordInput keywords={keywords} onAdd={onAddKeyword} onRemove={onRemoveKeyword} />
        )}

        <div className="flex flex-col gap-4" style={{ marginBottom: 20 }}>
          {showDateFilter && (
            <DateFilter days={filterDays} onChange={onFilterDaysChange} showAll={hasLinkedIn} />
          )}

          {showRegionSelector && (
            <RegionSelector selected={regions} onChange={setRegions} />
          )}

          {showLinkedInTimeout && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--dr-text-secondary)', whiteSpace: 'nowrap' }}>
                  LinkedIn timeout
                </label>
                <select
                  value={linkedinTimingPreset}
                  onChange={(e) => setLinkedinTimingPreset(e.target.value)}
                  style={{
                    fontSize: 12,
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--dr-border)',
                    color: 'var(--dr-text)',
                    background: '#fff',
                    cursor: 'pointer',
                    maxWidth: 'min(100%, 420px)',
                  }}
                >
                  {LINKEDIN_TIMING_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--dr-text-secondary)', whiteSpace: 'nowrap' }}>
                  LinkedIn browser (Puppeteer)
                </label>
                <select
                  value={linkedinHeadless ? 'headless' : 'visible'}
                  onChange={(e) => setLinkedinHeadless(e.target.value === 'headless')}
                  style={{
                    fontSize: 12,
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--dr-border)',
                    color: 'var(--dr-text)',
                    background: '#fff',
                    cursor: 'pointer',
                    maxWidth: 'min(100%, 420px)',
                  }}
                >
                  <option value="visible">Visible window (default — easier login / debug)</option>
                  <option value="headless">Headless (no UI — typical on servers)</option>
                </select>
              </div>
            </div>
          )}

        </div>

        <div className="flex justify-center" style={{ marginBottom: 20 }}>
          <button
            onClick={handleCollect}
            disabled={collectDisabled}
            className="flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
            style={{
              background: 'var(--dr-blue)', color: '#fff',
              padding: '10px 28px', borderRadius: 'var(--dr-radius-btn)',
              border: 'none', fontSize: 14, fontWeight: 600,
            }}
          >
            {isCollecting
              ? <>
                  <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  {collectingStatusLabel(sources, regions.length)}
                </>
              : <>🔍&nbsp;&nbsp;Collect News</>
            }
          </button>
        </div>

        {error && (
          <div
            style={{
              background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
              padding: '10px 14px', marginBottom: 12,
              fontSize: 13, color: '#991B1B',
            }}
          >
            <strong>Collection failed:</strong> {error}
          </div>
        )}

        {stats && <PipelineStats stats={stats} />}

        {collectionComplete && (
          <p style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: 'var(--dr-text-muted)' }}>
            Unique articles are saved from each source, then scoring runs automatically on Step 2. Above-threshold items are added to the queue on Step 3 when scoring finishes — use the tabs to review.
          </p>
        )}

        {scheduleModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setScheduleModalOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              background: 'rgba(17,24,39,0.45)',
              zIndex: 50,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'min(520px, 100%)',
                background: '#fff',
                borderRadius: 12,
                border: '1px solid var(--dr-border)',
                padding: 18,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--dr-text)' }}>Schedule Latest Articles</div>
                  <div style={{ fontSize: 13, color: 'var(--dr-text-muted)', marginTop: 6 }}>
                    Runs the Latest Articles (24h) collect + scoring flow daily at the selected time.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setScheduleModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--dr-border)',
                    borderRadius: 9,
                    width: 36,
                    height: 36,
                    cursor: 'pointer',
                    color: 'var(--dr-text-secondary)',
                    fontWeight: 900,
                  }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={scheduleEnabledDraft}
                    onChange={(e) => setScheduleEnabledDraft(e.target.checked)}
                  />
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--dr-text-secondary)' }}>
                    Enable daily auto-run
                  </span>
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--dr-text-muted)' }}>Time of day</div>
                  <input
                    type="time"
                    value={scheduleTimeDraft}
                    onChange={(e) => setScheduleTimeDraft(e.target.value)}
                    disabled={!scheduleEnabledDraft || scheduleLoading}
                    style={{
                      height: 38,
                      padding: '0 10px',
                      borderRadius: 10,
                      border: '1px solid var(--dr-border)',
                      background: !scheduleEnabledDraft ? '#F3F4F6' : '#fff',
                      color: 'var(--dr-text)',
                      fontWeight: 800,
                    }}
                  />
                  {!timeInputToValidate(scheduleTimeDraft) && scheduleEnabledDraft && (
                    <div style={{ fontSize: 12, color: '#991B1B', fontWeight: 700 }}>
                      Enter a valid time (HH:mm).
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => setScheduleModalOpen(false)}
                    disabled={scheduleLoading}
                    style={{
                      background: '#fff',
                      color: 'var(--dr-text-secondary)',
                      border: '1px solid var(--dr-border)',
                      padding: '10px 14px',
                      borderRadius: 10,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={scheduleLoading || (scheduleEnabledDraft && !timeInputToValidate(scheduleTimeDraft))}
                    onClick={async () => {
                      if (!scheduleEnabledDraft) {
                        // Disabling: keep time value but turn scheduler off.
                      }
                      setScheduleLoading(true);
                      try {
                        const res = await fetch('/api/latest-articles/schedule', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            enabled: scheduleEnabledDraft,
                            timeOfDay: scheduleTimeDraft,
                            minScore,
                            maxArticles,
                            linkedin30SecScrape: liPreset.linkedin30SecScrape,
                            linkedinHeadless,
                            browserTimeoutMs: liPreset.browserTimeoutMs,
                          }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          throw new Error(typeof data.error === 'string' ? data.error : 'Failed to save schedule');
                        }
                        toast.success('Latest Articles schedule saved');
                        setLatestSchedule(data);
                        setScheduleModalOpen(false);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'Failed to save schedule');
                      } finally {
                        setScheduleLoading(false);
                      }
                    }}
                    style={{
                      background: 'var(--dr-blue)',
                      color: '#fff',
                      border: 'none',
                      padding: '10px 14px',
                      borderRadius: 10,
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    {scheduleLoading ? 'Saving…' : 'Save'}
                  </button>
                </div>

                <div style={{ fontSize: 12.5, color: 'var(--dr-text-muted)', lineHeight: 1.45 }}>
                  Uses the current “LinkedIn timeout” and “Puppeteer browser (headless/visible)” settings.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function timeInputToValidate(t: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(t);
}
