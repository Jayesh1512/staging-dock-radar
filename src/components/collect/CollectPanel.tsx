"use client";
import { useState } from 'react';
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
}: CollectPanelProps) {
  const { isCollecting, stats, error, startCollect } = useCollect();
  const [sources, setSources] = useState<ArticleSource[]>([]);
  const [regions, setRegions] = useState<string[]>([...CORE_8_REGIONS]);
  const [linkedinTimingPreset, setLinkedinTimingPreset] = useState<string>('std_180000');

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
      const liPreset = linkedinPresetByValue(linkedinTimingPreset);
      const result = await startCollect(keywords, regions, filterDays, maxArticles, sources, {
        ...(liPreset.linkedin30SecScrape && { linkedin30SecScrape: true }),
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
              Latest Articles (24h) — preset (not editable)
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
      </div>
    </div>
  );
}
