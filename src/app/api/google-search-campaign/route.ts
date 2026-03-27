import { NextRequest } from 'next/server';
import { searchGoogle, type SerperResult } from '@/lib/google-search/serper';
import { classifyResults, groupByCompany, type GroupedCompany } from '@/lib/google-search/extract-domains';
import { scoreDomain, getFreshnessBand, type DomainScore } from '@/lib/google-search/score-domain';
import fs from 'fs';
import path from 'path';

export const maxDuration = 300; // 5 min

const COUNTRY_NAMES: Record<string, string> = {
  DE: 'Germany', UK: 'United Kingdom', AU: 'Australia', US: 'United States',
  IN: 'India', AE: 'UAE', SA: 'Saudi Arabia', JP: 'Japan', KR: 'South Korea',
  BR: 'Brazil', IT: 'Italy', ES: 'Spain', SG: 'Singapore', CA: 'Canada',
  ZA: 'South Africa', TH: 'Thailand', PL: 'Poland', TR: 'Turkey',
  FR: 'France', NL: 'Netherlands',
};

interface CountryResult {
  country: string;
  countryName: string;
  rawResults: number;
  entities: number;
  scored: number;
  dspSi: number;
  resellers: number;
  media: number;
  tier1Entities: number;
  topCompanies: Array<{ name: string; score: number; type: string; domains: string[]; tier1: boolean }>;
  error: string | null;
}

/**
 * POST /api/google-search-campaign
 * Body: { countries: string[], keyword?: string, pages?: number }
 *
 * Runs Google Search Crawler for each country sequentially.
 * Streams NDJSON progress. Generates single HTML report at the end.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const countries: string[] = body.countries ?? [];
  const keyword: string = body.keyword ?? 'DJI Dock';
  const pages: number = Math.min(body.pages ?? 7, 10);

  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'SERPER_API_KEY not set' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (countries.length === 0) {
    return new Response(JSON.stringify({ error: 'No countries provided' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function emit(type: string, data: unknown) {
        controller.enqueue(encoder.encode(JSON.stringify({ type, data }) + '\n'));
      }

      try {
        emit('log', `══ BATCH 2 — GLOBAL DJI DOCK GOOGLE SEARCH ══`);
        emit('log', `Keyword: "${keyword}" | Countries: ${countries.length} | Pages/country: ${pages}`);
        emit('log', `Estimated Serper credits: ${countries.length * pages}`);
        emit('log', '');

        const allCountryResults: CountryResult[] = [];
        let totalCredits = 0;

        for (let ci = 0; ci < countries.length; ci++) {
          const cc = countries[ci];
          const countryName = COUNTRY_NAMES[cc] ?? cc;
          emit('country_start', { index: ci + 1, total: countries.length, country: cc, countryName });
          emit('log', `── [${ci + 1}/${countries.length}] ${countryName} (${cc}) ──`);

          try {
            // Phase 1: Google Search
            const searchResults: SerperResult[] = await searchGoogle(
              {
                keyword,
                country: cc,
                pages,
                onPageDone: (page, results) => {
                  emit('log', `  [${page}/${pages}] ${results.length} results`);
                },
              },
              apiKey,
            );
            totalCredits += pages;

            // Phase 2: Classify & Group
            const classified = classifyResults(searchResults);
            const nonExcluded = classified.filter(r => r.type !== 'excluded');
            const groups = groupByCompany(nonExcluded);

            // Phase 3: Score
            const scored: Array<{ group: GroupedCompany; score: DomainScore }> = [];
            for (const group of groups) {
              const s = scoreDomain(group.slug, group.snippetText);
              scored.push({ group, score: s });
            }

            // Filter: only Tier 1 hits (DJI Dock gate)
            const tier1Entities = scored.filter(s => s.score.tier1Hit);

            // Classify counts
            const dspSi = tier1Entities.filter(s => s.group.entityType === 'operator').length;
            const resellers = tier1Entities.filter(s => s.group.entityType === 'reseller').length;
            const media = tier1Entities.filter(s => s.group.entityType === 'media').length;

            // Top companies (sorted by score)
            // Use domain-derived name instead of Google page title
            const top = tier1Entities
              .sort((a, b) => b.score.normalizedScore - a.score.normalizedScore)
              .slice(0, 10)
              .map(s => {
                // Prefer non-social domain as display name, fallback to slug
                const nonSocial = s.group.domains.filter(d =>
                  !['linkedin.com','facebook.com','youtube.com','instagram.com','twitter.com','x.com','reddit.com','tiktok.com'].some(sd => d.endsWith(sd))
                );
                const displayDomain = nonSocial[0] || s.group.domains[0] || s.group.slug;
                // Convert domain to title case: geo-konzept.de → Geo Konzept
                const domainName = displayDomain.split('.')[0].split(/[-_]/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                return {
                  name: domainName,
                  score: s.score.normalizedScore,
                  type: s.group.entityType,
                  domains: s.group.domains.slice(0, 3),
                  tier1: s.score.tier1Hit,
                };
              });

            const cr: CountryResult = {
              country: cc,
              countryName,
              rawResults: searchResults.length,
              entities: groups.length,
              scored: scored.length,
              dspSi,
              resellers,
              media,
              tier1Entities: tier1Entities.length,
              topCompanies: top,
              error: null,
            };
            allCountryResults.push(cr);

            emit('country_done', cr);
            emit('log', `  → ${searchResults.length} raw, ${groups.length} entities, ${tier1Entities.length} with DJI Dock (${dspSi} DSP/SI, ${resellers} resellers)`);

            // Store results JSON for later import
            const resultsDir = path.join(process.cwd(), 'data', 'Campaign Results');
            if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
            fs.writeFileSync(
              path.join(resultsDir, `batch2-${cc.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`),
              JSON.stringify({ country: cc, keyword, pages, timestamp: new Date().toISOString(), entities: tier1Entities.map(s => ({ ...s.group, score: s.score })) }, null, 2),
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            emit('log', `  ✗ ERROR: ${msg}`);
            allCountryResults.push({
              country: cc, countryName, rawResults: 0, entities: 0, scored: 0,
              dspSi: 0, resellers: 0, media: 0, tier1Entities: 0, topCompanies: [], error: msg,
            });
          }

          emit('log', '');
          // Delay between countries
          if (ci < countries.length - 1) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }

        // ── Summary ──
        const summary = {
          countriesSearched: allCountryResults.length,
          countriesWithResults: allCountryResults.filter(c => c.tier1Entities > 0).length,
          countriesWithErrors: allCountryResults.filter(c => c.error).length,
          totalRawResults: allCountryResults.reduce((s, c) => s + c.rawResults, 0),
          totalEntities: allCountryResults.reduce((s, c) => s + c.entities, 0),
          totalTier1: allCountryResults.reduce((s, c) => s + c.tier1Entities, 0),
          totalDspSi: allCountryResults.reduce((s, c) => s + c.dspSi, 0),
          totalResellers: allCountryResults.reduce((s, c) => s + c.resellers, 0),
          totalMedia: allCountryResults.reduce((s, c) => s + c.media, 0),
          serperCredits: totalCredits,
          countries: allCountryResults,
        };
        emit('summary', summary);

        // ── Generate HTML report ──
        try {
          const reportPath = generateCampaignReport(allCountryResults, summary, keyword, pages);
          emit('report', { path: reportPath });
          emit('log', `Report: ${reportPath}`);
        } catch (err) {
          emit('log', `Report generation failed: ${err instanceof Error ? err.message : 'unknown'}`);
        }

        emit('done', null);
      } catch (err) {
        emit('error', err instanceof Error ? err.message : 'Campaign failed');
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' },
  });
}

/* ─── HTML Report Generator ─── */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function generateCampaignReport(
  results: CountryResult[],
  summary: Record<string, unknown>,
  keyword: string,
  pages: number,
): string {
  const now = new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

  const kpi = (label: string, value: number, color: string) =>
    `<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:14px 18px;text-align:center;min-width:100px"><div style="font-size:26px;font-weight:800;color:${color}">${value}</div><div style="font-size:11px;color:#6B7280;margin-top:2px">${label}</div></div>`;

  const typeBadge = (type: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      operator: { bg: '#DCFCE7', text: '#166534' },
      reseller: { bg: '#FEF3C7', text: '#92400E' },
      media: { bg: '#E0E7FF', text: '#3730A3' },
      unknown: { bg: '#F3F4F6', text: '#6B7280' },
    };
    const c = colors[type] ?? colors.unknown;
    return `<span style="padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;background:${c.bg};color:${c.text}">${type}</span>`;
  };

  // Country rows
  const countryRows = results.map((cr, i) => {
    const bg = cr.error ? '#FEF2F2' : cr.tier1Entities > 0 ? '#F0FDF4' : '#FAFAFA';
    const topNames = cr.topCompanies.slice(0, 5).map(t => `${esc(t.name)} (${t.score})`).join(', ');
    return `<tr style="background:${bg}">
      <td style="padding:8px 10px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:12px">${i + 1}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #E5E7EB;font-size:12px;font-weight:700">${esc(cr.countryName)} (${cr.country})</td>
      <td style="padding:8px 10px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:12px">${cr.rawResults}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:12px">${cr.entities}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:12px;font-weight:700;color:#059669">${cr.tier1Entities}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:12px">${cr.dspSi}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:12px">${cr.resellers}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:12px">${cr.media}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #E5E7EB;font-size:10px;color:#6B7280;max-width:300px">${topNames || (cr.error ? '<span style="color:#DC2626">Error: ' + esc(cr.error) + '</span>' : '—')}</td>
    </tr>`;
  }).join('\n');

  // Top companies across all countries
  const allTop = results
    .flatMap(cr => cr.topCompanies.map(t => ({ ...t, country: cr.country })))
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  const topRows = allTop.map((t, i) =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #F3F4F6;font-size:12px;text-align:center">${i + 1}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #F3F4F6;font-size:12px;font-weight:700">${esc(t.name)}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #F3F4F6;font-size:12px;text-align:center">${t.country}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #F3F4F6;font-size:12px;text-align:center">${typeBadge(t.type)}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #F3F4F6;font-size:12px;text-align:center;font-weight:700">${t.score}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #F3F4F6;font-size:11px;color:#6B7280">${t.domains.join(', ')}</td></tr>`
  ).join('\n');

  const s = summary as { totalRawResults: number; totalEntities: number; totalTier1: number; totalDspSi: number; totalResellers: number; totalMedia: number; serperCredits: number; countriesSearched: number; countriesWithResults: number };

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<title>Dock Radar — Batch 2 Global Google Search Campaign — ${now}</title>
<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#F8FAFC;color:#111827}.wrap{max-width:1400px;margin:0 auto;padding:32px 24px 64px}table{width:100%;border-collapse:collapse}th{padding:9px 10px;font-size:11px;font-weight:600;color:#6B7280;background:#F9FAFB;border-bottom:2px solid #E5E7EB;text-align:center;white-space:nowrap}a{color:#2563EB;text-decoration:none}</style>
</head><body>
<div style="background:#fff;border-bottom:1px solid #E5E7EB;padding:0 24px"><div style="max-width:1400px;margin:0 auto;height:53px;display:flex;align-items:center;gap:10px"><div style="width:28px;height:28px;background:#2563EB;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700">DR</div><span style="font-size:15px;font-weight:700;color:#2563EB">Dock Radar</span><span style="font-size:11px;color:#9CA3AF">Batch 2 — Global Google Search Campaign</span></div></div>
<div class="wrap">
<h1 style="font-size:22px;font-weight:800;margin:0 0 6px">Batch 2 — Global DJI Dock Google Search</h1>
<div style="font-size:13px;color:#6B7280;margin-bottom:24px">${s.countriesSearched} countries · Keyword: "${keyword}" · ${pages} pages/country · ${now}</div>

<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px">
${kpi('Countries', s.countriesSearched, '#111827')}
${kpi('With Results', s.countriesWithResults, '#059669')}
${kpi('Raw Results', s.totalRawResults, '#6B7280')}
${kpi('Total Entities', s.totalEntities, '#2563EB')}
${kpi('DJI Dock Entities', s.totalTier1, '#059669')}
${kpi('DSP / SI', s.totalDspSi, '#166534')}
${kpi('Resellers', s.totalResellers, '#92400E')}
${kpi('Serper Credits', s.serperCredits, '#6B7280')}
</div>

<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;margin-bottom:24px">
<div style="padding:12px 16px;border-bottom:1px solid #E5E7EB;font-size:14px;font-weight:700">Per-Country Breakdown</div>
<div style="overflow-x:auto"><table><thead><tr>
<th>#</th><th style="text-align:left">Country</th><th>Raw Results</th><th>Entities</th><th>DJI Dock</th><th>DSP/SI</th><th>Resellers</th><th>Media</th><th style="text-align:left">Top Companies</th>
</tr></thead><tbody>${countryRows}</tbody></table></div></div>

<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;margin-bottom:24px">
<div style="padding:12px 16px;border-bottom:1px solid #E5E7EB;font-size:14px;font-weight:700">Top 30 Companies (Global)</div>
<div style="overflow-x:auto"><table><thead><tr>
<th>#</th><th style="text-align:left">Company</th><th>Country</th><th>Type</th><th>Score</th><th style="text-align:left">Domains</th>
</tr></thead><tbody>${topRows}</tbody></table></div></div>

<div style="text-align:center;font-size:11px;color:#9CA3AF;margin-top:32px">Generated by Dock Radar · ${now} · Batch 2 Global Campaign</div>
</div></body></html>`;

  const reportsDir = path.join(process.cwd(), 'docs', 'Google Search Output');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const filename = `batch2-global-dji-dock-search-${new Date().toISOString().slice(0, 10)}.html`;
  const filePath = path.join(reportsDir, filename);
  fs.writeFileSync(filePath, html, 'utf8');
  return `docs/Google Search Output/${filename}`;
}
