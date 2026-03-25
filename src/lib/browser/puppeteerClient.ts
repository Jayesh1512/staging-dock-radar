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
];

/**
 * Generic helper to run a Puppeteer task with automatic browser startup + teardown.
 * Reusable across LinkedIn and any other cookie-based scrapers.
 */
export async function withBrowserPage<T>(
  task: BrowserTask<T>,
  options: BrowserOptions = {},
): Promise<T> {
  const { headless = false, args = [] } = options;
  const browser = await puppeteer.launch({
    headless,
    args: [...DEFAULT_ARGS, ...args],
  });

  try {
    const page = await browser.newPage();
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

/** Random delay to simulate human browsing behavior. */
export async function humanPause(minMs = 500, maxMs = 2000) {
  const ms = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
  await new Promise((r) => setTimeout(r, ms));
}

/** Configure a page for interactive (non-headless) debugging. */
export async function preparePageForHumanUse(page: Page) {
  await page.setViewport({ width: 1280, height: 900 });
}

/** Generic infinite-scroll helper to load more content in a feed/search UI. */
export async function scrollPage(page: Page, maxScrolls: number, delayMs: number) {
  for (let i = 0; i < maxScrolls; i++) {
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

