/**
 * Dry-run test: scrape 3 known-good + 1 bad slug via updated collectCompanyPostsCore.
 * Uses tsx to import the TS module directly.
 *
 * Run: npx tsx scripts/test-linkedin-core-3companies.mjs
 *
 * Expected:
 *   abot-fr          → posts + OK
 *   flyingeye        → posts + OK
 *   escadrone        → posts + OK
 *   capture-solution123 → 0 posts + NOT_FOUND
 */

import { collectLinkedInCompanyPostsFromSlugs } from '../src/lib/linkedin/collectCompanyPostsCore.js';

const testSlugs = ['abot-fr', 'flyingeye', 'escadrone', 'capture-solution123'];

async function main() {
  console.log('=== LinkedIn Core Test ===\n');
  console.log('Slugs:', testSlugs.join(', '));
  console.log('Single browser session, 12-25s inter-company pauses.');
  console.log('Estimated time: ~3-4 minutes.\n');

  const result = await collectLinkedInCompanyPostsFromSlugs({
    companySlugs: testSlugs,
    filterDays: 0,
    maxArticles: 120,
    maxPostsPerCompany: 15,
    scrollSeconds: 15,
    headless: false,
    runId: `test_core_${Date.now()}`,
  });

  console.log('\n=== RESULTS ===\n');
  console.log(`Run ID: ${result.runId}`);
  console.log(`Total articles: ${result.articles.length}`);
  console.log(`Stats:`, JSON.stringify(result.stats, null, 2));

  console.log('\n=== PER COMPANY ===\n');
  console.log('Slug                     | Posts | State          | DJI | Dock | DJI Dock | DIAB');
  console.log('-'.repeat(85));
  for (const pc of result.perCompany) {
    console.log(
      `${pc.slug.padEnd(25)}| ${String(pc.postsFound).padStart(5)} | ${(pc.state || '?').padEnd(15)}| ${String(pc.djiCount).padStart(3)} | ${String(pc.dockCount).padStart(4)} | ${String(pc.dockMatches).padStart(8)} | ${String(pc.diabCount).padStart(4)}`
    );
  }

  // Show sample posts from first successful company
  const firstOk = result.perCompany.find(pc => pc.state === 'OK' && pc.postsFound > 0);
  if (firstOk) {
    const companyPosts = result.articles.filter(a => a.url.includes(firstOk.slug) || a.publisher_url?.includes(firstOk.slug));
    console.log(`\n=== SAMPLE POSTS from ${firstOk.slug} (first 3) ===\n`);
    companyPosts.slice(0, 3).forEach((a, i) => {
      console.log(`[${i+1}] ${a.title}`);
      console.log(`    URL: ${a.url}`);
      console.log(`    Published: ${a.published_at}`);
      console.log('');
    });
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
