import { withBrowserPage } from './puppeteerClient';

/**
 * Strategy D: Puppeteer headless browser fallback for Google News URLs.
 *
 * Used when the CBMi base64 decode (Strategy A) fails because the URL
 * uses the newer binary protobuf format where the article URL is only
 * available after JavaScript executes and redirects.
 *
 * Navigates to the Google News URL in a real Chromium instance,
 * waits for JS execution + redirect, then returns the final page URL.
 *
 * Note: Launches a fresh browser per call (~3-6s overhead).
 * This is intentional (Option A) — Strategy D only fires as a last
 * resort after A/B/C all fail, so frequency is low.
 */
// Mobile UA: Google News mobile redirects to the real article URL instead of
// rendering the JS SPA that blocks static extraction.
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

export async function resolveWithBrowser(url: string): Promise<string> {
  return withBrowserPage(
    async (page) => {
      await page.setUserAgent(MOBILE_UA);

      // framenavigated fires for every navigation on the main frame regardless
      // of how it is triggered (window.location, meta-refresh, link click, etc.).
      // We register the listener BEFORE goto so no redirect can slip past us.
      // Google domain navigations are filtered out — only the real article URL is kept.
      let capturedUrl = '';
      page.on('framenavigated', (frame) => {
        if (frame !== page.mainFrame()) return;
        const current = frame.url();
        if (current && current.startsWith('http') && !current.includes('google.com') && !current.includes('about:')) {
          capturedUrl = current;
        }
      });

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });

      return capturedUrl || page.url();
    },
    { args: ['--disable-blink-features=AutomationControlled'] },
  );
}
