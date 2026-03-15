import { ConfigBar } from '@/components/shared/ConfigBar';
import { DEFAULTS } from '@/constants';
import type { ConfigItem } from '@/types';
import { useState } from 'react';

interface CollectPanelProps {
  onCollect: (params: { keywords: string[]; maxArticles: number; minScore: number; filterDays: number }) => void;
}

export function CollectPanel({ onCollect }: CollectPanelProps) {
  const [maxArticles, setMaxArticles] = useState<number>(DEFAULTS.maxArticles);
  const [minScore, setMinScore] = useState<number>(DEFAULTS.minScore);

  const configItems: ConfigItem[] = [
    { label: 'Max Articles', value: maxArticles, editable: true, type: 'number', onChange: (v) => setMaxArticles(v as number) },
    { label: 'Title Similarity', value: DEFAULTS.titleSimilarity, editable: false, type: 'number' },
    { label: 'Min Score', value: minScore, editable: true, type: 'number', onChange: (v) => setMinScore(v as number) },
  ];

  return (
    <div className="space-y-5">
      <ConfigBar items={configItems} />
      <div className="rounded-xl border border-border-default bg-white p-6">
        <p className="text-sm text-text-muted">Collection panel — keyword input, sources, date range, regions will be built here.</p>
        <button
          onClick={() => onCollect({ keywords: ['DJI Dock', 'Drone Deployment'], maxArticles, minScore, filterDays: DEFAULTS.filterDays })}
          className="mt-4 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover transition-colors"
        >
          Collect News
        </button>
      </div>
    </div>
  );
}
