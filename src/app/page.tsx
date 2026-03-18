"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { Navbar } from '@/components/shared/Navbar';
import { StepTabs } from '@/components/shared/StepTabs';
import { AnalyticsPage } from '@/components/analytics/AnalyticsPage';
import { ConfigBar } from '@/components/shared/ConfigBar';
import { CollectPanel } from '@/components/collect/CollectPanel';
import { ScorePanel } from '@/components/score/ScorePanel';
import { QueuePanel } from '@/components/queue/QueuePanel';
import { DEFAULTS } from '@/lib/constants';
import { useScore } from '@/hooks/use-score';
import type { Article, ArticleWithScore, ArticleAction, ConfigItem, CollectResult, Run } from '@/lib/types';
import { toast } from 'sonner';
import { formatDateTimeIST } from '@/lib/utils';
import { CampaignHub } from '@/components/campaign/CampaignHub';

/** Async DB action persistence — non-blocking, warns user on failure so they can retry */
function persistAction(articleId: string, action: string, actionsTaken?: ArticleAction[]) {
  fetch('/api/articles/action', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articleId, action, actions_taken: actionsTaken }),
  }).then((res) => {
    if (!res.ok) console.warn(`[persistAction] DB write failed for ${action} on ${articleId} (HTTP ${res.status})`);
  }).catch((err) => {
    console.error('[persistAction] Network error:', err);
  });
}

export default function Dashboard() {
  // ─── Core State ────────────────────────────────────────
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showCampaign, setShowCampaign] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [currentRun, setCurrentRun] = useState<Run | null>(null);
  const [allRuns, setAllRuns] = useState<Run[]>([]);
  const [collectedArticles, setCollectedArticles] = useState<Article[]>([]);
  const [collectedRegions, setCollectedRegions] = useState<string[]>([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [hasScored, setHasScored] = useState(false);
  const [step3Enabled, setStep3Enabled] = useState(false);
  const [collectionComplete, setCollectionComplete] = useState(false);
  const [scoringStarted, setScoringStarted] = useState(false);
  const [dbLoaded, setDbLoaded] = useState(false);

  // ─── Article State ──────────────────────────────────────
  const [currentRunScored, setCurrentRunScored] = useState<ArticleWithScore[]>([]);
  const [articles, setArticles] = useState<ArticleWithScore[]>([]);
  const [runArticleMap, setRunArticleMap] = useState<Record<string, string[]>>({});

  // ─── Scoring State (lifted so it survives tab navigation) ──
  const { isScoring, progress, total, error: scoringError, partialResults, startScoring } = useScore();
  const hasStartedRef = useRef(false);
  const currentRunRef = useRef<Run | null>(null);
  currentRunRef.current = currentRun;

  // ─── Collect Config ────────────────────────────────────
  const [keywords, setKeywords] = useState<string[]>(['DJI Dock', 'DJI Dock 3', 'Drone in a box', 'Drone-in-a-box', 'Drone Dock']);
  const [maxArticles] = useState<number>(DEFAULTS.maxArticles);
  const [minScore, setMinScore] = useState<number>(DEFAULTS.minScore);
  const [filterDays, setFilterDays] = useState<number>(DEFAULTS.filterDays);

  // ─── Load persisted data from DB on mount ──────────────
  useEffect(() => {
    async function loadFromDb() {
      try {
        const res = await fetch('/api/runs');
        if (!res.ok) {
          console.warn('[page] /api/runs returned', res.status);
          return;
        }
        const data = await res.json() as {
          runs: Run[];
          scoredArticles: ArticleWithScore[];
          runArticleMap: Record<string, string[]>;
        };

        if (data.runs.length > 0) {
          setAllRuns(data.runs);
          setSelectedRunId(data.runs[0].id);
        }

        if (data.runArticleMap) {
          setRunArticleMap(data.runArticleMap);
        }

        if (data.scoredArticles.length > 0) {
          // Restore the global queue from DB — only articles eligible for queue.
          // Use DEFAULTS.minScore as the fixed threshold so that test runs with a lower
          // min_score don't permanently lower the bar for all future loads.
          let queueArticles = data.scoredArticles.filter(a =>
            a.scored.relevance_score >= DEFAULTS.minScore &&
            !a.scored.drop_reason &&
            !a.scored.is_duplicate,
          );
          // Exclude articles that don't appear in any run (cross-run dedup omits duplicates)
          if (data.runArticleMap && Object.keys(data.runArticleMap).length > 0) {
            const inAnyRun = (articleId: string) =>
              Object.values(data.runArticleMap).some(ids => ids.includes(articleId));
            queueArticles = queueArticles.filter(a => inAnyRun(a.article.id));
          }
          setArticles(queueArticles);
          setStep3Enabled(true);
        }

        console.log(`[page] DB loaded: ${data.runs.length} runs, ${data.scoredArticles.length} scored articles`);
      } catch (err) {
        // DB load failure is non-fatal — app works with empty state
        console.warn('[page] Failed to load from DB:', err);
      } finally {
        setDbLoaded(true);
      }
    }
    loadFromDb();
  }, []);

  // ─── Derived State ─────────────────────────────────────
  const queueCount = articles.filter(a => a.scored.status === 'new').length;

  const scoredArticles = currentRunScored.length > 0
    ? currentRunScored
    : articles.filter(a => (runArticleMap[selectedRunId] ?? []).includes(a.article.id));

  // ─── Scoring Trigger (lifted from ScorePanel) ────────────────────────────
  useEffect(() => {
    if (scoringStarted && !hasScored && !hasStartedRef.current && collectedArticles.length > 0) {
      hasStartedRef.current = true;
      startScoring(collectedArticles, handleScoringComplete, collectedRegions, minScore);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoringStarted, hasScored, collectedArticles, startScoring]);

  // ─── Action Helpers ────────────────────────────────────
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

  // ─── Callbacks ─────────────────────────────────────────
  const handleCollectComplete = useCallback((result: CollectResult) => {
    const run: Run = {
      id: result.runId,
      keywords: result.keywords,
      sources: ['google_news'],
      regions: result.regions,
      filter_days: result.filterDays,
      min_score: minScore,
      max_articles: maxArticles,
      status: 'completed',
      articles_fetched: result.stats.totalFetched,
      articles_stored: result.stats.stored,
      dedup_removed: result.stats.dedupRemoved,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };
    setAllRuns((prev) => [run, ...prev]);
    setCurrentRun(run);
    setSelectedRunId(run.id);
    setCollectedArticles(result.articles);
    setCollectedRegions(result.regions ?? []);
    setCollectionComplete(true);
    setHasScored(false);
    hasStartedRef.current = false;
    setScoringStarted(false);
  }, [minScore, maxArticles]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleScoringComplete = useCallback((results: ArticleWithScore[]) => {
    // Gate 2 dedup already applied server-side in /api/score — results have correct is_duplicate flags
    setCurrentRunScored(results);

    setArticles(prev => {
      const existingIds = new Set(prev.map(a => a.article.id));
      const newOnes = results.filter(r =>
        !existingIds.has(r.article.id) &&
        r.scored.relevance_score >= minScore &&
        !r.scored.drop_reason &&
        !r.scored.is_duplicate &&
        !r.article.ever_queued,
      );
      return [...prev, ...newOnes];
    });

    const runId = currentRunRef.current?.id;
    if (runId) {
      setRunArticleMap(prev => {
        // Only map articles NOT already attributed to a prior run.
        // This prevents the same article appearing under multiple run headers in Step 3.
        const alreadyMapped = new Set(Object.values(prev).flat());
        const newRunIds = results
          .filter(r =>
            !alreadyMapped.has(r.article.id) &&
            !r.article.ever_queued &&
            !r.scored.drop_reason &&
            !r.scored.is_duplicate &&
            r.scored.relevance_score >= minScore,
          )
          .map(r => r.article.id);
        return { ...prev, [runId]: newRunIds };
      });
    }

    setHasScored(true);
    setStep3Enabled(true);
    const queueable = results.filter(r => r.scored.status === 'new' && !r.scored.drop_reason && !r.scored.is_duplicate && r.scored.relevance_score >= minScore).length;
    toast.success(`Queue ready — ${queueable} articles`);
  }, [minScore]);

  const handleDismiss = useCallback((articleId: string) => {
    const dismissedAt = new Date().toISOString();
    updateArticle(articleId, (s) => ({ ...s, status: 'dismissed', dismissed_at: dismissedAt }));
    setCurrentRunScored(prev => prev.map(a =>
      a.article.id === articleId
        ? { ...a, scored: { ...a.scored, status: 'dismissed', dismissed_at: dismissedAt } }
        : a
    ));
    persistAction(articleId, 'dismiss');
  }, [updateArticle]);

  const handleSlack = useCallback((articleId: string) => {
    updateArticle(articleId, (s) => {
      const newActions = s.actions_taken.includes('slack') ? s.actions_taken : [...s.actions_taken, 'slack' as ArticleAction];
      persistAction(articleId, 'slack', newActions);
      return { ...s, actions_taken: newActions, slack_sent_at: new Date().toISOString() };
    });
  }, [updateArticle]);

  const handleBookmark = useCallback((articleId: string) => {
    updateArticle(articleId, (s) => {
      const newActions = s.actions_taken.includes('bookmarked') ? s.actions_taken : [...s.actions_taken, 'bookmarked' as ArticleAction];
      persistAction(articleId, 'bookmark', newActions);
      return { ...s, actions_taken: newActions };
    });
  }, [updateArticle]);

  const handleMarkReviewed = useCallback((articleId: string) => {
    updateArticle(articleId, (s) => ({ ...s, status: 'reviewed', reviewed_at: new Date().toISOString() }));
    persistAction(articleId, 'review');
  }, [updateArticle]);

  const handleBulkDismiss = useCallback((articleIds: string[]) => {
    setArticles(prev => prev.map(a => {
      if (!articleIds.includes(a.article.id)) return a;
      return { ...a, scored: { ...a.scored, status: 'dismissed', dismissed_at: new Date().toISOString() } };
    }));
    // Persist each dismiss
    articleIds.forEach(id => persistAction(id, 'dismiss'));
  }, []);

  // ─── Config Bars ───────────────────────────────────────
  const step1Config: ConfigItem[] = [
    { label: 'Max Articles per Run', value: maxArticles, editable: false, type: 'number' },
    { label: 'Title Similarity', value: DEFAULTS.titleSimilarity, editable: false, type: 'number' },
    { label: 'Min AI Score', value: minScore, editable: true, type: 'number', onChange: (v) => setMinScore(v as number) },
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
        label: `${formatDateTimeIST(r.created_at)} — ${(r.keywords || []).join(', ')}`,
        value: r.id,
      })),
      onChange: (v) => setSelectedRunId(v as string),
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#F3F4F6' }}>
      <Navbar
        onAnalytics={() => { setShowAnalytics(v => !v); setShowCampaign(false); }}
        analyticsActive={showAnalytics}
        onCampaign={() => { setShowCampaign(v => !v); setShowAnalytics(false); }}
        campaignActive={showCampaign}
      />
      {showCampaign ? (
        <main style={{ padding: '24px 32px 64px' }}>
          <CampaignHub />
        </main>
      ) : showAnalytics ? (
        <AnalyticsPage onClose={() => setShowAnalytics(false)} />
      ) : (
        <>
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
                  maxArticles={maxArticles}
                  onAddKeyword={(kw) => setKeywords(prev => [...prev, kw])}
                  onRemoveKeyword={(i) => setKeywords(prev => prev.filter((_, idx) => idx !== i))}
                  filterDays={filterDays}
                  onFilterDaysChange={setFilterDays}
                  onCollectComplete={handleCollectComplete}
                  collectionComplete={collectionComplete}
                  onProceedToScoring={() => { setActiveStep(2); setScoringStarted(true); }}
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
                  onDismiss={handleDismiss}
                  isScoring={isScoring}
                  progress={progress}
                  total={total}
                  scoringError={scoringError}
                  partialResults={partialResults}
                />
              </>
            )}
            {activeStep === 3 && (
              <QueuePanel
                articles={articles}
                runs={allRuns}
                runArticleMap={runArticleMap}
                getActions={getActions}
                onSlack={handleSlack}
                onBookmark={handleBookmark}
                onMarkReviewed={handleMarkReviewed}
                onDismiss={handleDismiss}
                onBulkDismiss={handleBulkDismiss}
              />
            )}
          </main>
        </>
      )}
    </div>
  );
}
