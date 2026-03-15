import { useState, useCallback } from 'react';
import { Navbar } from '@/components/shared/Navbar';
import { StepTabs } from '@/components/shared/StepTabs';
import { CollectPanel } from '@/components/collect/CollectPanel';
import { ScorePanel } from '@/components/score/ScorePanel';
import { QueuePanel } from '@/components/queue/QueuePanel';
import { MOCK_ARTICLES_WITH_SCORES, MOCK_RUNS, getArticlesForRun } from '@/data/mock-articles';
import type { ArticleWithScore, Run } from '@/types';

export function Dashboard() {
  const [activeStep, setActiveStep] = useState(1);
  const [currentRun, setCurrentRun] = useState<Run | null>(null);
  const [scoredArticles, setScoredArticles] = useState<ArticleWithScore[]>([]);
  const [allArticles, setAllArticles] = useState<ArticleWithScore[]>(MOCK_ARTICLES_WITH_SCORES);

  const queueCount = allArticles.filter((a) => a.scored.status === 'new').length;
  const step3Enabled = allArticles.length > 0;

  const handleCollect = useCallback((_params: { keywords: string[]; maxArticles: number; minScore: number; filterDays: number }) => {
    // Simulate collection → auto-advance to Step 2
    const run = MOCK_RUNS[0];
    setCurrentRun(run);
    setScoredArticles(getArticlesForRun(run.id));
    setActiveStep(2);
  }, []);

  const handleAction = useCallback((articleId: string, action: 'slack' | 'bookmarked' | 'dismiss' | 'reviewed') => {
    setAllArticles((prev) =>
      prev.map((a) => {
        if (a.scored.article_id !== articleId) return a;
        const scored = { ...a.scored };
        if (action === 'dismiss') {
          scored.status = 'dismissed';
          scored.dismissed_at = new Date().toISOString();
        } else if (action === 'reviewed') {
          scored.status = 'reviewed';
          scored.reviewed_at = new Date().toISOString();
        } else if (action === 'slack') {
          scored.actions_taken = [...scored.actions_taken, 'slack'];
          scored.slack_sent_at = new Date().toISOString();
        } else if (action === 'bookmarked') {
          scored.actions_taken = [...scored.actions_taken, 'bookmarked'];
        }
        return { ...a, scored };
      }),
    );
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <StepTabs
        activeStep={activeStep}
        onStepChange={setActiveStep}
        queueCount={queueCount}
        step3Enabled={step3Enabled}
      />
      <main className="mx-auto max-w-[var(--max-w-content)] px-8 py-6">
        {activeStep === 1 && <CollectPanel onCollect={handleCollect} />}
        {activeStep === 2 && <ScorePanel currentRun={currentRun} scoredArticles={scoredArticles} />}
        {activeStep === 3 && <QueuePanel articles={allArticles} onAction={handleAction} />}
      </main>
    </div>
  );
}
