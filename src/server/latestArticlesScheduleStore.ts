import fs from 'fs';
import path from 'path';
import { DEFAULTS } from '@/lib/constants';

export type LatestArticlesScheduleConfig = {
  enabled: boolean;
  /** Daily time in HH:mm (24h). Interpreted in server local time. */
  timeOfDay: string;

  /** Scoring queue threshold. */
  minScore: number;
  maxArticles: number;

  /** LinkedIn scrape options (passed through to /api/collect-linkedin). */
  linkedin30SecScrape: boolean;
  linkedinHeadless: boolean;
  browserTimeoutMs: number;

  /** Computed next run time as ISO string. */
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: 'success' | 'failed' | 'running' | null;
};

const DATA_DIR = path.join(process.cwd(), 'data');
const SCHEDULE_PATH = path.join(DATA_DIR, 'latest_articles_schedule.json');

const DEFAULT_CONFIG: LatestArticlesScheduleConfig = {
  enabled: false,
  timeOfDay: '09:00',

  minScore: DEFAULTS.minScore,
  maxArticles: DEFAULTS.maxArticles,

  linkedin30SecScrape: false,
  linkedinHeadless: true,
  browserTimeoutMs: 180_000,

  nextRunAt: null,
  lastRunAt: null,
  lastStatus: null,
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function computeNextRunAt(timeOfDay: string, now: Date = new Date()): string {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeOfDay);
  if (!m) throw new Error(`Invalid timeOfDay: "${timeOfDay}" (expected HH:mm)`);
  const hh = Number(m[1]);
  const mm = Number(m[2]);

  const candidate = new Date(now);
  candidate.setHours(hh, mm, 0, 0);
  if (candidate.getTime() <= now.getTime()) candidate.setDate(candidate.getDate() + 1);
  return candidate.toISOString();
}

export async function loadLatestArticlesScheduleConfig(): Promise<LatestArticlesScheduleConfig> {
  try {
    ensureDataDir();
    if (!fs.existsSync(SCHEDULE_PATH)) return DEFAULT_CONFIG;
    const raw = await fs.promises.readFile(SCHEDULE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LatestArticlesScheduleConfig>;

    const merged: LatestArticlesScheduleConfig = {
      ...DEFAULT_CONFIG,
      ...parsed,
      enabled: Boolean(parsed.enabled),
      minScore: typeof parsed.minScore === 'number' ? parsed.minScore : DEFAULT_CONFIG.minScore,
      maxArticles: typeof parsed.maxArticles === 'number' ? parsed.maxArticles : DEFAULT_CONFIG.maxArticles,
      linkedin30SecScrape: Boolean(parsed.linkedin30SecScrape),
      linkedinHeadless: typeof parsed.linkedinHeadless === 'boolean' ? parsed.linkedinHeadless : DEFAULT_CONFIG.linkedinHeadless,
      browserTimeoutMs: typeof parsed.browserTimeoutMs === 'number' ? parsed.browserTimeoutMs : DEFAULT_CONFIG.browserTimeoutMs,
      timeOfDay: typeof parsed.timeOfDay === 'string' ? parsed.timeOfDay : DEFAULT_CONFIG.timeOfDay,
      nextRunAt: typeof parsed.nextRunAt === 'string' ? parsed.nextRunAt : null,
      lastRunAt: typeof parsed.lastRunAt === 'string' ? parsed.lastRunAt : null,
      lastStatus: (parsed.lastStatus as LatestArticlesScheduleConfig['lastStatus']) ?? null,
    };

    // If enabled but nextRunAt missing/invalid, recompute.
    if (merged.enabled) {
      const nextOk = typeof merged.nextRunAt === 'string' && !Number.isNaN(new Date(merged.nextRunAt).getTime());
      if (!nextOk) merged.nextRunAt = computeNextRunAt(merged.timeOfDay);
    }

    return merged;
  } catch {
    // If file parsing fails, fall back to defaults rather than crashing API/scheduler.
    return DEFAULT_CONFIG;
  }
}

export async function saveLatestArticlesScheduleConfig(
  next: LatestArticlesScheduleConfig,
): Promise<LatestArticlesScheduleConfig> {
  ensureDataDir();
  await fs.promises.writeFile(SCHEDULE_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

