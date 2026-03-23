import { NextRequest, NextResponse } from 'next/server';
import { searchGoogle, type SerperResult } from '@/lib/google-search/serper';
import { classifyResults, groupByCompany, type GroupedCompany } from '@/lib/google-search/extract-domains';
import { scoreDomain, type DomainScore } from '@/lib/google-search/score-domain';
import { crawlUrl, type CrawlResult } from '@/lib/google-search/crawl-homepage';

export const maxDuration = 120; // allow up to 2 min for crawling

interface CrawledCompany {
  group: GroupedCompany;
  snippetScore: DomainScore;
  crawlResults: CrawlResult[];
  finalScore: DomainScore;
}

/**
 * POST /api/google-dock-crawler
 * Body: { keyword: string, country: string, pages: number }
 *
 * Returns a streaming NDJSON response with log lines and final results.
 * Each line is JSON: { type: 'log' | 'result', data: ... }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const keyword: string = body.keyword ?? 'DJI Dock';
  const country: string = body.country ?? 'FR';
  const pages: number = Math.min(body.pages ?? 5, 10);

  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'SERPER_API_KEY not set' }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function log(message: string) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'log', data: message }) + '\n'));
      }

      function emit(type: string, data: unknown) {
        controller.enqueue(encoder.encode(JSON.stringify({ type, data }) + '\n'));
      }

      try {
        // ── Phase 1: Google Search ──
        log(`══ GOOGLE DOCK CRAWLER v0.1 ══`);
        log(`Keyword: "${keyword}" | Country: ${country} | Pages: ${pages}`);
        log(``);
        log(`── Phase 1: Google Search ──`);

        const searchResults = await searchGoogle(
          {
            keyword,
            country,
            pages,
            onPageDone: (page, results) => {
              log(`  [${page}/${pages}] "${keyword}" ${country} p${page} → ${results.length} results`);
            },
          },
          apiKey,
        );

        log(`  Total: ${searchResults.length} raw results`);
        log(``);

        // ── Phase 2: Domain Extraction ──
        log(`── Phase 2: Domain Extraction & Classification ──`);
        const classified = classifyResults(searchResults);

        const excluded = classified.filter(r => r.type === 'excluded');
        const social = classified.filter(r => r.type === 'social');
        const direct = classified.filter(r => r.type === 'direct');

        log(`  ${searchResults.length} results → ${direct.length} direct + ${social.length} social + ${excluded.length} excluded`);

        // Show excluded domains
        const excludedDomains = [...new Set(excluded.map(r => r.domain))];
        if (excludedDomains.length > 0) {
          log(`  Excluded: ${excludedDomains.join(', ')}`);
        }

        // Show social results
        for (const s of social) {
          const slug = s.companySlug ? ` → company: "${s.companySlug}"` : '';
          log(`  Social: ${s.socialPlatform} — ${s.link.substring(0, 80)}${slug}`);
        }

        // Group by company
        const groups = groupByCompany(classified);
        log(`  Grouped into ${groups.length} unique entities`);
        log(``);

        // ── Phase 3: Snippet Pre-Score ──
        log(`── Phase 3: Snippet Pre-Score ──`);
        const snippetScores: { group: GroupedCompany; score: DomainScore }[] = [];

        for (const group of groups) {
          const score = scoreDomain(group.slug, group.snippetText);
          snippetScores.push({ group, score });

          if (score.totalScore > 0) {
            const tier1 = score.tier1Hit ? ' [T1]' : '';
            const signals = score.signals.map(s => `${s.keyword}(×${s.count})`).join(', ');
            log(`  ✓ ${group.slug} — score: ${score.totalScore}${tier1} — ${signals}`);
          }
        }

        const withSignals = snippetScores.filter(s => s.score.totalScore > 0);
        const noSignals = snippetScores.filter(s => s.score.totalScore === 0);
        log(`  ${withSignals.length} with snippet signals, ${noSignals.length} without`);
        log(``);

        // ── Phase 4: Waterfall Crawl ──
        log(`── Phase 4: Waterfall Crawl ──`);

        // Only crawl entities with snippet signals
        const toCrawl = withSignals;
        log(`  Crawling ${toCrawl.length} entities with signals...`);

        const crawledCompanies: CrawledCompany[] = [];

        for (let i = 0; i < toCrawl.length; i++) {
          const { group, score: snippetScore } = toCrawl[i];

          // Pick URLs to crawl: prefer direct domain results, then the Google result URLs
          const crawlUrls: string[] = [];

          // Add direct domain homepages
          for (const domain of group.domains) {
            if (!domain.includes('linkedin.com') && !domain.includes('facebook.com') &&
                !domain.includes('instagram.com') && !domain.includes('youtube.com') &&
                !domain.includes('reddit.com')) {
              const homepage = `https://${domain.startsWith('www.') ? '' : 'www.'}${domain}/`;
              if (!crawlUrls.includes(homepage)) crawlUrls.push(homepage);
            }
          }

          // Also crawl the specific Google result URLs (where the signal was found)
          for (const r of group.results) {
            if (r.type === 'direct' && !crawlUrls.includes(r.link)) {
              crawlUrls.push(r.link);
            }
          }

          // Cap at 3 URLs per entity
          const urlsToCrawl = crawlUrls.slice(0, 3);
          const crawlResults: CrawlResult[] = [];

          for (const url of urlsToCrawl) {
            const result = await crawlUrl(url);
            crawlResults.push(result);

            const status = result.ok
              ? `✓ (${result.timeMs}ms, ${result.charCount} chars)`
              : `✗ (${result.error})`;
            log(`  [${i + 1}/${toCrawl.length}] ${group.slug} — ${url.substring(0, 60)} ${status}`);
          }

          // Combine all crawled text + snippet text for final scoring
          const allText = [
            group.snippetText,
            ...crawlResults.filter(r => r.ok).map(r => r.text),
          ].join(' ');

          const finalScore = scoreDomain(group.slug, allText);

          crawledCompanies.push({
            group,
            snippetScore,
            crawlResults,
            finalScore,
          });
        }

        // Also include non-crawled entities (social-only, no direct domain)
        for (const { group, score } of noSignals) {
          crawledCompanies.push({
            group,
            snippetScore: score,
            crawlResults: [],
            finalScore: score,
          });
        }

        log(``);

        // ── Phase 5: Final Results ──
        log(`── Phase 5: Final Results ──`);

        // Sort by final score descending
        crawledCompanies.sort((a, b) => b.finalScore.totalScore - a.finalScore.totalScore);

        const scored = crawledCompanies.filter(c => c.finalScore.totalScore > 0);
        log(`  ${scored.length} entities with signals | ${crawledCompanies.length - scored.length} with no signals`);
        log(``);

        // Litmus test
        const instadrone = crawledCompanies.find(c => c.group.slug.includes('instadrone'));
        if (instadrone) {
          const rank = crawledCompanies.indexOf(instadrone) + 1;
          log(`  ✓ LITMUS PASS: instadrone found at rank #${rank} (score: ${instadrone.finalScore.totalScore})`);
        } else {
          log(`  ✗ LITMUS FAIL: instadrone not found in results`);
        }

        // Emit final results
        const resultData = crawledCompanies.map((c, i) => ({
          rank: i + 1,
          slug: c.group.slug,
          domains: c.group.domains,
          totalScore: c.finalScore.totalScore,
          snippetScore: c.snippetScore.totalScore,
          tier1Hit: c.finalScore.tier1Hit,
          tier2Hit: c.finalScore.tier2Hit,
          topSignal: c.finalScore.topSignal,
          signalCount: c.finalScore.signalCount,
          signals: c.finalScore.signals,
          resultCount: c.group.resultCount,
          sourceUrls: c.group.results.map(r => ({
            link: r.link,
            title: r.title,
            snippet: r.snippet,
            type: r.type,
            socialPlatform: r.socialPlatform,
          })),
          crawlResults: c.crawlResults.map(cr => ({
            url: cr.url,
            ok: cr.ok,
            charCount: cr.charCount,
            timeMs: cr.timeMs,
            error: cr.error,
            textPreview: cr.text.substring(0, 200),
          })),
        }));

        emit('results', {
          keyword,
          country,
          pages,
          totalRawResults: searchResults.length,
          totalEntities: groups.length,
          scoredEntities: scored.length,
          litmusPass: !!instadrone,
          companies: resultData,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        log(`ERROR: ${message}`);
        emit('error', { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  });
}
