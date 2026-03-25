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
    await notifyCronRunByEmail(
      'Latest Articles cron: SUCCESS',
      [
        `time=${new Date().toISOString()}`,
        `google=${result.googleCount}, linkedin=${result.linkedinCount}, merged=${result.mergedCount}`,
        `nextRunAt=${nextRunAt}`,
      ].join('\n'),
    );
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
    await notifyCronRunByEmail(
      'Latest Articles cron: FAILED',
      [
        `time=${new Date().toISOString()}`,
        `error=${message}`,
        `nextRunAt=${nextRunAt}`,
      ].join('\n'),
    );
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

