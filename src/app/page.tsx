"use client";

import { useState, useCallback } from 'react';
import { Navbar } from '@/components/shared/Navbar';
import { StepTabs } from '@/components/shared/StepTabs';
import { ConfigBar } from '@/components/shared/ConfigBar';
import { CollectPanel } from '@/components/collect/CollectPanel';
import { ScorePanel } from '@/components/score/ScorePanel';
import { QueuePanel } from '@/components/queue/QueuePanel';
import { MOCK_RUNS, MOCK_ARTICLES_WITH_SCORES, RUN_ARTICLE_MAP } from '@/data/mock-data';
import { DEFAULTS } from '@/lib/constants';
import type { ArticleWithScore, ArticleAction, ConfigItem, PipelineStats, Run } from '@/lib/types';
import { toast } from 'sonner';

export default function Dashboard() {
  // ─── Core State ────────────────────────────────────
  const [activeStep, setActiveStep] = useState(1);
  const [currentRun, setCurrentRun] = useState<Run | null>(null);
  const [allRuns] = useState<Run[]>(MOCK_RUNS);
  const [selectedRunId, setSelectedRunId] = useState(MOCK_RUNS[0].id);
  const [hasScored, setHasScored] = useState(false);
  const [step3Enabled, setStep3Enabled] = useState(true);

  // ─── Article State (overlay on mock data) ──────────
  const [articles, setArticles] = useState<ArticleWithScore[]>(MOCK_ARTICLES_WITH_SCORES);

  // ─── Collect Config ────────────────────────────────
  const [keywords, setKeywords] = useState<string[]>(['DJI Dock', 'Drone Deployment']);
  const [maxArticles, setMaxArticles] = useState<number>(DEFAULTS.maxArticles);
  const [minScore, setMinScore] = useState<number>(DEFAULTS.minScore);
  const [filterDays, setFilterDays] = useState<number>(DEFAULTS.filterDays);

  // ─── Derived State ─────────────────────────────────
  const queueCount = articles.filter(a => a.scored.status === 'new').length;

  const scoredArticles = articles.filter(a => {
    const runIds = RUN_ARTICLE_MAP[selectedRunId] ?? [];
    return runIds.includes(a.article.id);
  });

  // ─── Action Helpers ────────────────────────────────
  const getActions = useCallback((articleId: string): ArticleAction[] => {
    const article = articles.find(a => a.article.id === articleId);
    return article?.scored.actions_taken ?? [];
  }, [articles]);

  const updateArticle = useCallback((articleId: string, updater: (scored: ArticleWithScore['scored']) => ArticleWithScore['scored']) => {
    setArticles(prev => prev.map(a => {
      if (a.article.id !== articleId) return a;
      return { ...a, scored: updater({ ...a.scored }) };
    }));
  }, []);

  // ─── Callbacks ─────────────────────────────────────
  const handleCollectComplete = useCallback((_stats: PipelineStats) => {
    const run = MOCK_RUNS[0];
    setCurrentRun(run);
    setSelectedRunId(run.id);
    setHasScored(false);
    setActiveStep(2);
  }, []);

  const handleScoringComplete = useCallback(() => {
    setHasScored(true);
    setStep3Enabled(true);
    toast.success(`Queue ready — ${queueCount} articles`);
  }, [queueCount]);

  const handleDismiss = useCallback((articleId: string) => {
    updateArticle(articleId, (s) => ({ ...s, status: 'dismissed', dismissed_at: new Date().toISOString() }));
  }, [updateArticle]);

  const handleSlack = useCallback((articleId: string) => {
    updateArticle(articleId, (s) => ({
      ...s,
      actions_taken: s.actions_taken.includes('slack') ? s.actions_taken : [...s.actions_taken, 'slack'],
      slack_sent_at: new Date().toISOString(),
    }));
  }, [updateArticle]);

  const handleBookmark = useCallback((articleId: string) => {
    updateArticle(articleId, (s) => ({
      ...s,
      actions_taken: s.actions_taken.includes('bookmarked') ? s.actions_taken : [...s.actions_taken, 'bookmarked'],
    }));
  }, [updateArticle]);

  const handleMarkReviewed = useCallback((articleId: string) => {
    updateArticle(articleId, (s) => ({ ...s, status: 'reviewed', reviewed_at: new Date().toISOString() }));
  }, [updateArticle]);

  const handleBulkDismiss = useCallback((articleIds: string[]) => {
    setArticles(prev => prev.map(a => {
      if (!articleIds.includes(a.article.id)) return a;
      return { ...a, scored: { ...a.scored, status: 'dismissed', dismissed_at: new Date().toISOString() } };
    }));
  }, []);

  // ─── Config Bars ───────────────────────────────────
  const step1Config: ConfigItem[] = [
    { label: 'Max Articles', value: maxArticles, editable: true, type: 'number', onChange: (v) => setMaxArticles(v as number) },
    { label: 'Title Similarity', value: DEFAULTS.titleSimilarity, editable: false, type: 'number' },
    { label: 'Min Score', value: minScore, editable: true, type: 'number', onChange: (v) => setMinScore(v as number) },
  ];

  const step2Config: ConfigItem[] = [
    { label: 'Max Articles', value: currentRun?.max_articles ?? maxArticles, editable: false, type: 'number' },
    { label: 'Min Score', value: currentRun?.min_score ?? minScore, editable: false, type: 'number' },
    { label: 'Title Similarity', value: DEFAULTS.titleSimilarity, editable: false, type: 'number' },
    {
      label: 'Run',
      value: selectedRunId,
      editable: true,
      type: 'select',
      options: allRuns.map(r => ({
        label: `${new Date(r.created_at).toLocaleDateString()} — ${r.keywords.join(', ')}`,
        value: r.id,
      })),
      onChange: (v) => setSelectedRunId(v as string),
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#F3F4F6' }}>
      <Navbar />
      <StepTabs
        activeStep={activeStep}
        onStepChange={setActiveStep}
        queueCount={queueCount}
        step3Enabled={step3Enabled}
      />
      <main className="mx-auto" style={{ maxWidth: 'var(--dr-max-w)', padding: '24px 32px 64px' }}>
        {activeStep === 1 && (
          <>
            <ConfigBar items={step1Config} />
            <CollectPanel
              keywords={keywords}
              onAddKeyword={(kw) => setKeywords(prev => [...prev, kw])}
              onRemoveKeyword={(i) => setKeywords(prev => prev.filter((_, idx) => idx !== i))}
              filterDays={filterDays}
              onFilterDaysChange={setFilterDays}
              onCollectComplete={handleCollectComplete}
            />
          </>
        )}
        {activeStep === 2 && (
          <>
            <ConfigBar items={step2Config} />
            <ScorePanel
              currentRun={currentRun}
              scoredArticles={scoredArticles}
              minScore={minScore}
              onScoringComplete={handleScoringComplete}
              onDismiss={handleDismiss}
              hasScored={hasScored}
            />
          </>
        )}
        {activeStep === 3 && (
          <QueuePanel
            articles={articles}
            runs={allRuns}
            runArticleMap={RUN_ARTICLE_MAP}
            getActions={getActions}
            onSlack={handleSlack}
            onBookmark={handleBookmark}
            onMarkReviewed={handleMarkReviewed}
            onDismiss={handleDismiss}
            onBulkDismiss={handleBulkDismiss}
          />
        )}
      </main>
    </div>
  );
}
