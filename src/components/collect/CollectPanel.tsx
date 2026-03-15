"use client";
import { KeywordInput } from './KeywordInput';
import { SourcesPanel } from './SourcesPanel';
import { DateFilter } from './DateFilter';
import { RegionSelector } from './RegionSelector';
import { PipelineStats } from './PipelineStats';
import { useCollect } from '@/hooks/use-collect';
import { ALL_COUNTRIES } from '@/lib/constants';
import type { PipelineStats as PipelineStatsType } from '@/lib/types';
import { useState } from 'react';

interface CollectPanelProps {
  keywords: string[];
  onAddKeyword: (kw: string) => void;
  onRemoveKeyword: (i: number) => void;
  filterDays: number;
  onFilterDaysChange: (days: number) => void;
  onCollectComplete: (stats: PipelineStatsType) => void;
}

export function CollectPanel({ keywords, onAddKeyword, onRemoveKeyword, filterDays, onFilterDaysChange, onCollectComplete }: CollectPanelProps) {
  const { isCollecting, stats, startCollect } = useCollect();
  const [regions, setRegions] = useState<string[]>([...ALL_COUNTRIES]);

  const handleCollect = async () => {
    if (keywords.length === 0) return;
    const result = await startCollect();
    onCollectComplete(result);
  };

  return (
    <div className="bg-white" style={{ border: '1px solid var(--dr-border)', borderRadius: 'var(--dr-radius-card)', overflow: 'hidden' }}>
      <div style={{ padding: 20 }}>
        <SourcesPanel />
        <KeywordInput keywords={keywords} onAdd={onAddKeyword} onRemove={onRemoveKeyword} />
        <div className="grid grid-cols-2 gap-4" style={{ marginBottom: 20 }}>
          <DateFilter days={filterDays} onChange={onFilterDaysChange} />
          <RegionSelector selected={regions} onChange={setRegions} />
        </div>
        <div className="flex justify-center" style={{ marginBottom: 20 }}>
          <button
            onClick={handleCollect}
            disabled={isCollecting || keywords.length === 0}
            className="flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
            style={{
              background: 'var(--dr-blue)', color: '#fff',
              padding: '10px 28px', borderRadius: 'var(--dr-radius-btn)',
              border: 'none', fontSize: 14, fontWeight: 600, fontFamily: 'Inter, sans-serif',
            }}
          >
            {isCollecting ? (
              <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Collecting...</>
            ) : (
              <>🔍&nbsp;&nbsp;Collect News</>
            )}
          </button>
        </div>
        {stats && <PipelineStats stats={stats} />}
      </div>
    </div>
  );
}
