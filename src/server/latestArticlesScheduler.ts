import { loadLatestArticlesScheduleConfig, saveLatestArticlesScheduleConfig, computeNextRunAt } from './latestArticlesScheduleStore';
import { runLatestArticlesFlow } from './runLatestArticlesFlow';
import type { LatestArticlesScheduleConfig } from './latestArticlesScheduleStore';

type SchedulerState = {
  started: boolean;
  running: boolean;
  timer: NodeJS.Timeout | null;
};

const SCHEDULER_POLL_MS = 15_000;

function getGlobalState(): SchedulerState {
  const g = globalThis as unknown as { __latestArticlesScheduler?: SchedulerState };
  if (!g.__latestArticlesScheduler) {
    g.__latestArticlesScheduler = {
      started: false,
      running: false,
      timer: null,
    };
  }
  return g.__latestArticlesScheduler;
}

async function tick() {
  const state = getGlobalState();
  if (state.running) return;

  const config = await loadLatestArticlesScheduleConfig();
  if (!config.enabled) return;

  const dueAt = config.nextRunAt ? new Date(config.nextRunAt).getTime() : null;
  if (dueAt == null || Number.isNaN(dueAt)) {
    const recomputed = { ...config, nextRunAt: computeNextRunAt(config.timeOfDay, new Date()) };
    await saveLatestArticlesScheduleConfig(recomputed);
    return;
  }

  if (Date.now() < dueAt) return;

  state.running = true;

  try {
    const runningConfig: LatestArticlesScheduleConfig = { ...config, lastStatus: 'running' };
    await saveLatestArticlesScheduleConfig(runningConfig);
    console.log('[latest-articles-scheduler] Triggering scheduled run at', new Date().toISOString());
    await runLatestArticlesFlow(runningConfig);

    const nextRunAt = computeNextRunAt(config.timeOfDay, new Date());
    await saveLatestArticlesScheduleConfig({
      ...config,
      lastRunAt: new Date().toISOString(),
      lastStatus: 'success',
      nextRunAt,
    });
  } catch (err) {
    console.error('[latest-articles-scheduler] Scheduled run failed:', err);
    const nextRunAt = computeNextRunAt(config.timeOfDay, new Date());
    await saveLatestArticlesScheduleConfig({
      ...config,
      lastRunAt: new Date().toISOString(),
      lastStatus: 'failed',
      nextRunAt,
    });
  } finally {
    state.running = false;
  }
}

export function ensureLatestArticlesSchedulerStarted() {
  const state = getGlobalState();
  if (state.started) return;
  state.started = true;

  // Kick immediately on start (then poll).
  void tick().catch((e) => console.error('[latest-articles-scheduler] initial tick failed:', e));

  state.timer = setInterval(() => {
    void tick().catch((e) => console.error('[latest-articles-scheduler] tick failed:', e));
  }, SCHEDULER_POLL_MS);
}

