/**
 * Puppeteer-based deep LinkedIn scan for DJI Dock keywords.
 *
 * Uses the existing collectLinkedInCompanyPostsFromSlugs pipeline.
 * Only matches: "DJI Dock", "Dock 1", "Dock 2", "Dock 3".
 * Returns matching post URLs + dates as evidence.
 */

import {
  collectLinkedInCompanyPostsFromSlugs,
  cleanCompanySlugs,
  type CompanyStat,
} from '@/lib/linkedin/collectCompanyPostsCore';

// Strictly DJI Dock keywords — no BVLOS, no drone-in-a-box, no generic "dock"
// "Dock 2" alone is NOT enough — must have "DJI" context nearby
const RE_DJI_DOCK = /dji\s*dock/i;
const RE_DJI_DOCK_1 = /dji\s*dock\s*1|dji[^.]{0,40}dock\s*1/i;
const RE_DJI_DOCK_2 = /dji\s*dock\s*2|dji[^.]{0,40}dock\s*2/i;
const RE_DJI_DOCK_3 = /dji\s*dock\s*3|dji[^.]{0,40}dock\s*3/i;

export interface DockPostMatch {
  postUrl: string;
  snippet: string;       // first 200 chars of matching content
  publishedAt: string;   // ISO date (estimated from relative time)
  dockVariants: string[];  // e.g. ["Dock 2", "Dock 3"]
}

export interface PuppeteerVerifyResult {
  slug: string;
  found: boolean;
  matches: DockPostMatch[];
  totalPosts: number;     // total posts scraped
  pageState: string;      // OK, LOGIN_WALL, CAPTCHA, etc.
  error: string | null;
}

/**
 * Deep-scan a list of LinkedIn company pages for DJI Dock mentions.
 *
 * @param linkedinUrls Array of LinkedIn URLs (or slugs)
 * @param headless Run browser headless (default true)
 * @returns Per-company results with matching post URLs and dates
 */
export async function runPuppeteerVerify(
  linkedinUrls: string[],
  headless = true,
): Promise<PuppeteerVerifyResult[]> {
  const slugs = cleanCompanySlugs(linkedinUrls);
  if (slugs.length === 0) return [];

  const runId = `qa-dock-verify-${Date.now()}`;

  const { articles, perCompany } = await collectLinkedInCompanyPostsFromSlugs({
    companySlugs: slugs,
    filterDays: 365,      // scan last 12 months of posts
    maxArticles: 9999,    // no limit — we want all posts
    maxPostsPerCompany: 50,
    scrollSeconds: 15,
    headless,
    runId,
  });

  // Build per-slug result map
  const statMap = new Map<string, CompanyStat>();
  perCompany.forEach(s => statMap.set(s.slug, s));

  const results: PuppeteerVerifyResult[] = slugs.map(slug => {
    const stat = statMap.get(slug);
    if (!stat || stat.state !== 'OK') {
      return {
        slug,
        found: false,
        matches: [],
        totalPosts: stat?.postsFound ?? 0,
        pageState: stat?.state ?? 'ERROR',
        error: stat?.state !== 'OK' ? `LinkedIn page state: ${stat?.state ?? 'unknown'}` : null,
      };
    }

    // Filter articles for this company that match DJI Dock keywords
    const companyArticles = articles.filter(a => {
      const authorSlug = a.source_url?.match(/company\/([^/?]+)/)?.[1]?.toLowerCase();
      return authorSlug === slug;
    });

    const matches: DockPostMatch[] = [];

    for (const article of companyArticles) {
      const text = `${article.title ?? ''} ${article.body ?? ''}`;

      // Check for DJI Dock keywords
      if (!RE_DJI_DOCK.test(text)) continue;

      const variants: string[] = [];
      if (RE_DJI_DOCK_3.test(text)) variants.push('Dock 3');
      if (RE_DJI_DOCK_2.test(text)) variants.push('Dock 2');
      if (RE_DJI_DOCK_1.test(text)) variants.push('Dock 1');
      if (variants.length === 0) variants.push('DJI Dock');

      matches.push({
        postUrl: article.url || '',
        snippet: text.substring(0, 200),
        publishedAt: article.published_at || new Date().toISOString(),
        dockVariants: variants,
      });
    }

    return {
      slug,
      found: matches.length > 0,
      matches,
      totalPosts: companyArticles.length,
      pageState: stat.state,
      error: null,
    };
  });

  return results;
}
