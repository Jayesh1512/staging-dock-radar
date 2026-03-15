import { ConfigBar } from '@/components/shared/ConfigBar';
import type { ArticleWithScore, ConfigItem, Run } from '@/types';
import { MOCK_RUNS } from '@/data/mock-articles';

interface ScorePanelProps {
  currentRun: Run | null;
  scoredArticles: ArticleWithScore[];
}

export function ScorePanel({ currentRun, scoredArticles }: ScorePanelProps) {
  const run = currentRun ?? MOCK_RUNS[0];

  const configItems: ConfigItem[] = [
    { label: 'Max Articles', value: run.max_articles, editable: false, type: 'number' },
    { label: 'Min Score', value: run.min_score, editable: false, type: 'number' },
    { label: 'Title Similarity', value: 0.8, editable: false, type: 'number' },
    {
      label: 'Run',
      value: run.id,
      editable: true,
      type: 'select',
      options: MOCK_RUNS.map((r) => ({
        label: `${new Date(r.created_at).toLocaleDateString()} — ${r.keywords.join(', ')}`,
        value: r.id,
      })),
    },
  ];

  return (
    <div className="space-y-5">
      <ConfigBar items={configItems} />
      <div className="rounded-xl border border-border-default bg-white p-6">
        <p className="text-sm text-text-muted">
          Score panel — scoring progress, scored articles table, dropped articles will be built here.
        </p>
        <p className="mt-2 text-xs text-text-disabled">
          {scoredArticles.length} scored articles loaded for run {run.id}
        </p>
      </div>
    </div>
  );
}
