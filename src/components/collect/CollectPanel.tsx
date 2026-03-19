"use client";
import { useState } from 'react';
import { KeywordInput } from './KeywordInput';
import { SourcesPanel } from './SourcesPanel';
import { DateFilter } from './DateFilter';
import { RegionSelector } from './RegionSelector';
import { PipelineStats } from './PipelineStats';
import { useCollect } from '@/hooks/use-collect';
import { ALL_COUNTRIES } from '@/lib/constants';
import type { ArticleSource, CollectResult } from '@/lib/types';
import { CORE_8_REGIONS } from '@/lib/constants';

interface CollectPanelProps {
  keywords: string[];
  maxArticles: number;
  onAddKeyword: (kw: string) => void;
  onRemoveKeyword: (i: number) => void;
  filterDays: number;
  onFilterDaysChange: (days: number) => void;
  onCollectComplete: (result: CollectResult) => void;
  collectionComplete: boolean;
  onProceedToScoring: () => void;
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
  onProceedToScoring,
}: CollectPanelProps) {
  const { isCollecting, stats, error, startCollect } = useCollect();
  const [sources, setSources] = useState<ArticleSource[]>([]);
  const [regions, setRegions] = useState<string[]>([...CORE_8_REGIONS]);

  // NewsAPI doesn't support regions — only show regions selector when Google News or LinkedIn is selected
  const hasGoogleOrLinkedIn = sources.includes('google_news') || sources.includes('linkedin');
  const onlyNewsAPI = sources.length === 1 && sources.includes('newsapi');

  const handleCollect = async () => {
    if (keywords.length === 0) return;
    try {
      const result = await startCollect(keywords, regions, filterDays, maxArticles, sources);
      onCollectComplete(result);
    } catch {
      // error is already set in hook state — displayed below
    }
  };

  return (
    <div className="bg-white" style={{ border: '1px solid var(--dr-border)', borderRadius: 'var(--dr-radius-card)', overflow: 'hidden' }}>
      <div style={{ padding: 20 }}>
        <SourcesPanel selected={sources} onChange={setSources} />
        <KeywordInput keywords={keywords} onAdd={onAddKeyword} onRemove={onRemoveKeyword} />

        <div className="flex flex-col gap-4" style={{ marginBottom: 20 }}>
          <DateFilter days={filterDays} onChange={onFilterDaysChange} showAll={sources.includes('linkedin')} />
          
          {/* Only show regions if Google News or LinkedIn is selected */}
          {hasGoogleOrLinkedIn && (
            <RegionSelector selected={regions} onChange={setRegions} />
          )}

          {/* Info message when only NewsAPI is selected */}
          {onlyNewsAPI && (
            <div style={{
              background: '#E0F2FE',
              border: '1px solid #0EA5E9',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 12,
              color: '#0369A1',
              fontStyle: 'italic',
            }}>
              ℹ️ NewsAPI provides global news coverage and doesn't support regional filtering
            </div>
          )}
        </div>

        <div className="flex justify-center" style={{ marginBottom: 20 }}>
          <button
            onClick={handleCollect}
            disabled={isCollecting || keywords.length === 0}
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
                  {onlyNewsAPI
                    ? 'Collecting from NewsAPI…'
                    : `Collecting from ${regions.length} region${regions.length !== 1 ? 's' : ''}…`
                  }
                </>
              : <>🔍&nbsp;&nbsp;Collect News</>
            }
          </button>
        </div>

        {/* Error state */}
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
          <div className="flex justify-center" style={{ marginTop: 20 }}>
            <button
              onClick={onProceedToScoring}
              className="flex items-center gap-2 cursor-pointer transition-colors"
              style={{
                background: 'var(--dr-blue)', color: '#fff',
                padding: '10px 28px', borderRadius: 'var(--dr-radius-btn)',
                border: 'none', fontSize: 14, fontWeight: 600,
              }}
            >
              Start Scoring
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
