import { loadLatestArticlesScheduleConfig, saveLatestArticlesScheduleConfig, computeNextRunAt } from './latestArticlesScheduleStore';
import { runLatestArticlesFlow } from './runLatestArticlesFlow';
import type { LatestArticlesScheduleConfig } from './latestArticlesScheduleStore';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

type SchedulerState = {
  started: boolean;
  running: boolean;
  timer: NodeJS.Timeout | null;
};

const SCHEDULER_POLL_MS = 15_000;

async function notifyCronRunByEmail(subject: string, message: string) {
  // Next dev sometimes doesn't hot-reload updated `.env` values for the running process.
  // Reloading ensures we use the latest SMTP credentials without a server restart.
  dotenv.config({ override: true });

  const host = process.env.EMAIL_SMTP_HOST;
  const portRaw = process.env.EMAIL_SMTP_PORT;
  const user = process.env.EMAIL_SMTP_USER;
  const pass = process.env.EMAIL_SMTP_PASS;
  const from = process.env.EMAIL_SMTP_FROM;
  const to = process.env.LATEST_ARTICLES_CRON_EMAIL_TO;

  if (!host || !portRaw || !user || !pass || !from || !to) return;

  const port = Number(portRaw);
  if (Number.isNaN(port)) {
    console.error('[latest-articles-scheduler] Invalid EMAIL_SMTP_PORT value');
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text: message,
    });
    console.log('[latest-articles-scheduler] Email notification sent', {
      to,
      subject,
      messageId: info.messageId,
    });
  } catch (err) {
    console.error('[latest-articles-scheduler] Email notification error:', err);
  }
}

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
    const result = await runLatestArticlesFlow(runningConfig);

    const nextRunAt = computeNextRunAt(config.timeOfDay, new Date());
    await saveLatestArticlesScheduleConfig({
      ...config,
      lastRunAt: new Date().toISOString(),
      lastStatus: 'success',
      nextRunAt,
    });

    const subject = 'Dock Radar | Latest Articles cron SUCCESS';
    const body = [
      'Latest Articles cron completed successfully.',
      '',
      `When: ${new Date().toISOString()}`,
      `Next scheduled run: ${nextRunAt}`,
      '',
      'Run config:',
      `- timeOfDay: ${runningConfig.timeOfDay}`,
      `- minScore: ${runningConfig.minScore}`,
      `- maxArticles: ${runningConfig.maxArticles}`,
      `- linkedin30SecScrape: ${runningConfig.linkedin30SecScrape}`,
      `- linkedinHeadless: ${runningConfig.linkedinHeadless}`,
      `- browserTimeoutMs: ${runningConfig.browserTimeoutMs}`,
      '',
      'Results:',
      `- Google News: ${result.googleCount}`,
      `- LinkedIn: ${result.linkedinCount}`,
      `- Merged unique: ${result.mergedCount}`,
    ].join('\n');

    await notifyCronRunByEmail(subject, body);
  } catch (err) {
    console.error('[latest-articles-scheduler] Scheduled run failed:', err);
    const nextRunAt = computeNextRunAt(config.timeOfDay, new Date());
    await saveLatestArticlesScheduleConfig({
      ...config,
      lastRunAt: new Date().toISOString(),
      lastStatus: 'failed',
      nextRunAt,
    });
    const message = err instanceof Error ? err.message : 'Unknown error';

    const subject = 'Dock Radar | Latest Articles cron FAILED';
    const body = [
      'Latest Articles cron failed.',
      '',
      `When: ${new Date().toISOString()}`,
      `Next scheduled run: ${nextRunAt}`,
      '',
      'Error:',
      String(message),
      '',
      'Run config:',
      `- timeOfDay: ${config.timeOfDay}`,
      `- minScore: ${config.minScore}`,
      `- maxArticles: ${config.maxArticles}`,
      `- linkedin30SecScrape: ${config.linkedin30SecScrape}`,
      `- linkedinHeadless: ${config.linkedinHeadless}`,
      `- browserTimeoutMs: ${config.browserTimeoutMs}`,
    ].join('\n');

    await notifyCronRunByEmail(subject, body);
  } finally {
    state.running = false;
  }
}

export function ensureLatestArticlesSchedulerStarted() {
  const state = getGlobalState();
  if (state.started) return;
  state.started = true;

  // Do not run immediately on server start.
  // If `nextRunAt` is already in the past (e.g. server restarted after the scheduled time),
  // advance it to the next scheduled time so we don't "catch up" unexpectedly.
  void (async () => {
    try {
      const config = await loadLatestArticlesScheduleConfig();
      if (!config.enabled) return;
      if (!config.nextRunAt) return;
      const dueAt = new Date(config.nextRunAt).getTime();
      if (Number.isNaN(dueAt)) return;
      if (Date.now() >= dueAt) {
        const nextRunAt = computeNextRunAt(config.timeOfDay, new Date());
        await saveLatestArticlesScheduleConfig({ ...config, nextRunAt });
        console.log('[latest-articles-scheduler] Startup advanced nextRunAt to', nextRunAt);
      }
    } catch (e) {
      console.error('[latest-articles-scheduler] Startup init failed:', e);
    }
  })();

  state.timer = setInterval(() => {
    void tick().catch((e) => console.error('[latest-articles-scheduler] tick failed:', e));
  }, SCHEDULER_POLL_MS);
}

