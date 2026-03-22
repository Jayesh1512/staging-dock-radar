import fs from 'fs';
import path from 'path';
import puppeteer, { Browser, Page, Protocol } from 'puppeteer';

export type BrowserTask<T> = (page: Page, browser: Browser) => Promise<T>;

export type BrowserOptions = {
  /** Run headless by default; set false to debug. */
  headless?: boolean;
  /** Extra Chromium args to add on top of the safe defaults. */
  args?: string[];
};

const DEFAULT_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  /** Lets sites treat the session more like a normal Chrome tab (needed for LinkedIn login). */
  '--disable-blink-features=AutomationControlled',
];

/** Puppeteer adds this by default; it flags the browser as automated and many sites block sign-in. */
const IGNORE_DEFAULT_AUTOMATION_FLAG = ['--enable-automation'] as const;

export async function launchPuppeteerBrowser(options: BrowserOptions = {}) {
  const { headless = false, args = [] } = options;
  return puppeteer.launch({
    headless,
    ignoreDefaultArgs: [...IGNORE_DEFAULT_AUTOMATION_FLAG],
    args: [...DEFAULT_ARGS, ...args],
  });
}

/**
 * Register before the first navigation. Reduces obvious automation signals so interactive
 * login (e.g. LinkedIn) is not rejected.
 */
export async function preparePageForHumanUse(page: Page) {
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      configurable: true,
      get: () => false,
    });
  });
}

/**
 * Generic helper to run a Puppeteer task with automatic browser startup + teardown.
 * Reusable across LinkedIn and any other cookie-based scrapers.
 */
export async function withBrowserPage<T>(
  task: BrowserTask<T>,
  options: BrowserOptions = {},
): Promise<T> {
  const browser = await launchPuppeteerBrowser(options);

  try {
    const page = await browser.newPage();
    await preparePageForHumanUse(page);
    return await task(page, browser);
  } finally {
    await browser.close();
  }
}

/** Look for a cookies JSON file for a given service (e.g. "linkedin"). */
export function findCookiesFile(service: string): string | null {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, `${service}-cookies.json`),
    path.join(cwd, `${service}_cookies.json`),
    path.join(cwd, `${service}.cookies.json`),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Load cookies from a JSON file created by a separate login script.
 * The JSON format matches Puppeteer's `page.cookies()` output.
 */
export async function loadServiceCookies(page: Page, service: string) {
  const cookiesPath = findCookiesFile(service);
  if (!cookiesPath) {
    throw new Error(
      `${service} cookies file not found. Run \`npm run ${service}:login\` to create ${service}-cookies.json.`,
    );
  }

  const raw = fs.readFileSync(cookiesPath, 'utf8');
  const cookies: Protocol.Network.CookieParam[] = JSON.parse(raw);
  await page.setCookie(...cookies);
}

/** Pause with optional random jitter (ms) so actions are not perfectly periodic. */
export function humanPause(baseMs: number, jitterMs = 0): Promise<void> {
  const extra = jitterMs > 0 ? Math.floor(Math.random() * (jitterMs + 1)) : 0;
  return new Promise((r) => setTimeout(r, baseMs + extra));
}

export type ScrollPageOptions = {
  /** Uniform random extra delay 0..jitterMs after each scroll step */
  jitterMs?: number;
  /** Fixed pause once after the last scroll (e.g. let lazy content settle) */
  settleMs?: number;
};

/** Generic infinite-scroll helper to load more content in a feed/search UI. */
export async function scrollPage(
  page: Page,
  maxScrolls: number,
  delayMs: number,
  options?: ScrollPageOptions,
) {
  const jitter = options?.jitterMs ?? 0;
  for (let i = 0; i < maxScrolls; i++) {
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });
    const extra = jitter > 0 ? Math.floor(Math.random() * (jitter + 1)) : 0;
    await new Promise((r) => setTimeout(r, delayMs + extra));
  }
  const settle = options?.settleMs ?? 0;
  if (settle > 0) {
    await new Promise((r) => setTimeout(r, settle));
  }
}

