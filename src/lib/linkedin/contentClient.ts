import type { Page } from 'puppeteer';
import type { LinkedInContentPost } from './contentTypes';
import { withBrowserPage, loadServiceCookies, scrollPage } from '../browser/puppeteerClient';

type FetchOptions = {
  maxScrolls?: number;
  scrollDelay?: number;
};

const DEFAULT_MAX_SCROLLS = 5;
const DEFAULT_SCROLL_DELAY = 2000;

async function ensureLoggedIn(page: Page) {
  await page.goto('https://www.linkedin.com/feed/', {
    waitUntil: 'networkidle2',
  });

  // Heuristic: if we see "Sign in" in the title or URL, cookies are invalid.
  const url = page.url();
  const title = await page.title();
  if (/login|signin/i.test(url) || /sign in/i.test(title)) {
    throw new Error(
      'LinkedIn session appears to be logged out. Re-run `npm run linkedin:login` to refresh cookies.',
    );
  }
}

function extractPosts(): LinkedInContentPost[] {
  const posts: LinkedInContentPost[] = [];

  const articleNodes = document.querySelectorAll<HTMLElement>('article');
  articleNodes.forEach((article) => {
    // Text content – combine main update text and any "see more" expansions that are already open.
    const textEl = article.querySelector<HTMLElement>('[data-test-id="feed-update-text"], span.break-words, div.break-words');
    const postContent = textEl?.innerText?.trim() ?? '';
    if (!postContent) return;

    // Author name
    const authorEl =
      article.querySelector<HTMLElement>('a[href*="/in/"][data-field="actor-link"]') ??
      article.querySelector<HTMLElement>('span.update-components-actor__name, span.feed-shared-actor__name');
    const authorName = authorEl?.innerText?.trim() ?? null;

    // Timestamp (relative, e.g. "1h", "2d")
    const timeEl =
      article.querySelector<HTMLElement>('time') ??
      article.querySelector<HTMLElement>('span.update-components-actor__sub-description span[aria-hidden="true"]');
    const publishedAt = timeEl?.innerText?.trim() ?? null;

    // Post URL: try permalink anchors, otherwise fallback to article-level link
    let postUrl: string | null = null;
    const permalink =
      article.querySelector<HTMLAnchorElement>('a[href*="activity"]') ??
      article.querySelector<HTMLAnchorElement>('a[href*="/feed/update/"]');
    if (permalink?.href) {
      postUrl = permalink.href.split('?')[0];
    }

    posts.push({
      postUrl,
      postContent,
      authorName,
      publishedAt,
    });
  });

  return posts;
}

export async function fetchContentSearch(
  keyword: string,
  options: FetchOptions = {},
): Promise<{ posts: LinkedInContentPost[] }> {
  const maxScrolls = options.maxScrolls ?? DEFAULT_MAX_SCROLLS;
  const scrollDelay = options.scrollDelay ?? DEFAULT_SCROLL_DELAY;
  return withBrowserPage(async (page) => {
    await loadServiceCookies(page, 'linkedin');
    await ensureLoggedIn(page);

    const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(
      `"${keyword}"`,
    )}&origin=GLOBAL_SEARCH_HEADER`;

    await page.goto(searchUrl, { waitUntil: 'networkidle2' });
    await scrollPage(page, maxScrolls, scrollDelay);
    const posts = await page.evaluate(extractPosts);
    return { posts };
  });
}

