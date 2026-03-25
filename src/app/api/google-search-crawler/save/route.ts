import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

/* ─── Types (mirror page.tsx) ─── */

interface SourceUrl {
  link: string;
  title: string;
  snippet: string;
  type: 'direct' | 'social';
  socialPlatform?: string;
}

interface CrawlResultItem {
  url: string;
  ok: boolean;
  charCount: number;
  timeMs: number;
  error?: string;
  textPreview: string;
}

interface Signal {
  tier: string;
  keyword: string;
  count: number;
  points: number;
}

interface CompanyResult {
  rank: number;
  slug: string;
  companyName: string;
  domains: string[];
  entityType: string;
  fence: string | null;
  lastSeen: string | null;
  totalScore: number;
  normalizedScore: number;
  freshnessBand: string;
  freshnessLabel: string;
  snippetScore: number;
  tier1Hit: boolean;
  tier2Hit: boolean;
  topSignal: string;
  signalCount: number;
  signals: Signal[];
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  resultCount: number;
  sourceUrls: SourceUrl[];
  crawlResults: CrawlResultItem[];
}

interface FinalResults {
  keyword: string;
  country: string;
  pages: number;
  totalRawResults: number;
  totalEntities: number;
  scoredEntities: number;
  litmusCompany: string | null;
  litmusPass: boolean | null;
  companies: CompanyResult[];
}

/* ─── HTML generator ─── */

function entityBadge(type: string): string {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    operator: { bg: '#DCFCE7', color: '#166534', label: 'DSP/SI' },
    reseller: { bg: '#FEF3C7', color: '#92400E', label: 'Reseller' },
    media:    { bg: '#E0E7FF', color: '#3730A3', label: 'Media' },
  };
  const s = map[type] ?? { bg: '#F3F4F6', color: '#6B7280', label: '—' };
  return `<span style="padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;background:${s.bg};color:${s.color}">${s.label}</span>`;
}

function scoreColor(n: number): string {
  if (n >= 70) return '#DC2626';
  if (n >= 30) return '#D97706';
  return '#6B7280';
}

function signalBadge(s: Signal): string {
  const bg    = s.tier === 'tier1' ? '#FEE2E2' : s.tier === 'tier2' ? '#FEF3C7' : '#DBEAFE';
  const color = s.tier === 'tier1' ? '#991B1B' : s.tier === 'tier2' ? '#92400E' : '#1E40AF';
  return `<span style="padding:2px 8px;border-radius:12px;font-size:11px;background:${bg};color:${color};display:inline-block;margin:2px">${s.keyword} ×${s.count} (${s.points}pts)</span>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateHtml(data: FinalResults, timestamp: string): string {
  const scored  = data.companies.filter(c => c.normalizedScore > 0).sort((a, b) => b.normalizedScore - a.normalizedScore);
  const unscored = data.companies.filter(c => c.normalizedScore === 0);

  const dspCount      = scored.filter(c => c.entityType === 'operator').length;
  const resellerCount = scored.filter(c => c.entityType === 'reseller').length;
  const tier1Count    = scored.filter(c => c.tier1Hit).length;

  const kpiCards = [
    { label: 'Raw Results',   value: data.totalRawResults,                              color: '#6B7280' },
    { label: 'Entities',      value: data.totalEntities,                                color: '#2563EB' },
    { label: 'Scored',        value: scored.length,                                     color: '#7C3AED' },
    { label: 'DSP / SI',      value: dspCount,                                          color: '#059669' },
    { label: 'Resellers',     value: resellerCount,                                     color: '#D97706' },
    { label: 'Tier 1 Hits',   value: tier1Count,                                        color: '#DC2626' },
    ...(data.litmusPass !== null ? [{
      label: `Litmus: ${data.litmusCompany ?? ''}`,
      value: data.litmusPass ? 'PASS' : 'FAIL',
      color: data.litmusPass ? '#059669' : '#DC2626',
    }] : []),
  ].map(k => `
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:14px 18px;text-align:center;min-width:110px">
      <div style="font-size:26px;font-weight:800;color:${k.color}">${k.value}</div>
      <div style="font-size:11px;color:#6B7280;margin-top:2px">${k.label}</div>
    </div>`).join('');

  const tableRows = scored.map(c => {
    const signalBadges = c.signals.map(signalBadge).join('');

    const sourceRows = c.sourceUrls.map(u => {
      const tag = u.type === 'social'
        ? `<span style="padding:1px 5px;border-radius:4px;font-size:10px;background:#EDE9FE;color:#5B21B6;margin-right:6px">${esc(u.socialPlatform ?? '')}</span>`
        : `<span style="padding:1px 5px;border-radius:4px;font-size:10px;background:#ECFDF5;color:#065F46;margin-right:6px">web</span>`;
      return `<div style="margin-bottom:4px;font-size:11px">${tag}<a href="${esc(u.link)}" target="_blank" style="color:#2563EB">${esc(u.link.substring(0, 100))}</a>
        <div style="color:#9CA3AF;font-size:10px;margin-left:48px">${esc(u.snippet.substring(0, 160))}</div></div>`;
    }).join('');

    const crawlRows = c.crawlResults.map(cr =>
      `<div style="font-size:11px;color:${cr.ok ? '#065F46' : '#991B1B'};margin-bottom:3px">
        ${cr.ok ? '✓' : '✗'} ${esc(cr.url.substring(0, 80))} ${cr.ok ? `(${cr.charCount} chars, ${cr.timeMs}ms)` : esc(cr.error ?? '')}
        ${cr.ok && cr.textPreview ? `<div style="color:#9CA3AF;font-size:10px;margin-left:16px;white-space:pre-wrap">${esc(cr.textPreview)}</div>` : ''}
      </div>`).join('');

    const rowBg = c.tier1Hit ? '#FEF2F2' : '#fff';

    const freshIcon = c.freshnessBand === 'fresh' ? '⚡' : c.freshnessBand === 'warm' ? '<span style="opacity:0.5">⚡</span>' : '';
    const titlePreview = c.sourceUrls[0]?.title ? `<div style="font-size:10px;color:#9CA3AF;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px">${esc(c.sourceUrls[0].title)}</div>` : '';

    return `
    <tr style="background:${rowBg}">
      <td style="${TD}">${c.rank}</td>
      <td style="${TD};text-align:left"><div style="font-weight:700">${esc(c.companyName)}</div>${titlePreview}</td>
      <td style="${TD}">${entityBadge(c.entityType)}${c.fence ? ' <span title="' + esc(c.fence) + '" style="font-size:10px;cursor:help">🔶</span>' : ''}</td>
      <td style="${TD};font-weight:800;color:${scoreColor(c.normalizedScore)}">${c.normalizedScore}</td>
      <td style="${TD}">${c.tier1Hit ? '✓' : ''}</td>
      <td style="${TD}">${c.tier2Hit ? '✓' : ''}</td>
      <td style="${TD};text-align:left">${esc(c.topSignal)}</td>
      <td style="${TD}">${c.signalCount}</td>
      <td style="${TD};font-size:11px">${freshIcon}${esc(c.lastSeen ?? '—')}</td>
      <td style="${TD};font-size:11px;text-align:left;color:#6B7280">${esc(c.domains.join(', '))}</td>
      <td style="${TD}">${c.resultCount}</td>
    </tr>
    <tr>
      <td colspan="11" style="padding:10px 16px;background:#F9FAFB;border-bottom:2px solid #E5E7EB">
        <div style="margin-bottom:8px">
          <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:4px">Signals</div>
          <div>${signalBadges}</div>
        </div>
        ${sourceRows ? `<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:4px">Source URLs</div>${sourceRows}</div>` : ''}
        ${crawlRows ? `<div><div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:4px">Crawled Pages</div>${crawlRows}</div>` : ''}
      </td>
    </tr>`;
  }).join('');

  const unscoredList = unscored.map(c =>
    `<div style="font-size:11px;color:#9CA3AF;padding:4px 0;border-bottom:1px solid #F3F4F6">
      <span style="font-weight:600;color:#6B7280">${esc(c.companyName)}</span> <span style="color:#D1D5DB">(${esc(c.slug)})</span>
      — ${esc(c.domains.join(', '))} — ${c.resultCount} result(s)
      ${c.sourceUrls.map(u => `<div style="margin-left:16px;font-size:10px;color:#D1D5DB">${u.type === 'social' ? `[${esc(u.socialPlatform ?? '')}]` : '[web]'} ${esc(u.link.substring(0, 90))}</div>`).join('')}
    </div>`).join('');

  const COUNTRY_LABELS: Record<string, string> = {
    FR:'France',DE:'Germany',UK:'United Kingdom',AU:'Australia',US:'United States',
    IN:'India',AE:'UAE',SA:'Saudi Arabia',NL:'Netherlands',IT:'Italy',
    ES:'Spain',SG:'Singapore',JP:'Japan',KR:'South Korea',BR:'Brazil',
  };
  const countryLabel = COUNTRY_LABELS[data.country] ?? data.country;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Google Search Crawler — ${esc(data.keyword)} / ${esc(countryLabel)} — ${timestamp}</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F8FAFC; color: #111827; }
    .wrap { max-width: 1200px; margin: 0 auto; padding: 32px 24px 64px; }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 9px 10px; font-size: 11px; font-weight: 600; color: #6B7280; background: #F9FAFB; border-bottom: 2px solid #E5E7EB; text-align: center; white-space: nowrap; }
    tr:hover td { background: #F0F9FF !important; }
    a { color: #2563EB; }
  </style>
</head>
<body>
  <div style="background:#fff;border-bottom:1px solid #E5E7EB;padding:0 24px">
    <div style="max-width:1200px;margin:0 auto;height:53px;display:flex;align-items:center;gap:10px">
      <div style="width:28px;height:28px;background:#2563EB;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700">DR</div>
      <span style="font-size:15px;font-weight:700;color:#2563EB">Dock Radar</span>
      <span style="font-size:11px;color:#9CA3AF">Google Search Crawler — Saved Report</span>
    </div>
  </div>

  <div class="wrap">
    <!-- Header -->
    <div style="margin-bottom:24px">
      <h1 style="font-size:22px;font-weight:800;color:#111827;margin:0 0 6px">
        ${esc(data.keyword)} — ${esc(countryLabel)} (${esc(data.country)})
      </h1>
      <div style="font-size:13px;color:#6B7280">
        ${data.pages} pages · ~${data.pages * 10} results queried · Generated ${timestamp}
      </div>
    </div>

    <!-- KPI cards -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px">
      ${kpiCards}
    </div>

    <!-- Scored table -->
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;margin-bottom:20px">
      <div style="padding:12px 16px;border-bottom:1px solid #E5E7EB;font-size:14px;font-weight:700;color:#111827">
        Scored Entities (${scored.length})
        <span style="font-size:11px;font-weight:400;color:#9CA3AF;margin-left:8px">sorted by score desc</span>
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th style="text-align:left">Entity</th>
              <th>Type</th>
              <th>Score</th>
              <th title="Tier 1: DJI Dock">Dock</th>
              <th title="Tier 2: BVLOS/SORA">BVLOS</th>
              <th style="text-align:left">Top Signal</th>
              <th>Signals</th>
              <th>Last Seen</th>
              <th style="text-align:left">Domains</th>
              <th>Sources</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Unscored -->
    ${unscored.length > 0 ? `
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:14px 16px;margin-bottom:20px">
      <div style="font-size:13px;font-weight:700;color:#6B7280;margin-bottom:10px">
        Unscored Entities (${unscored.length}) — no keyword matches in snippets or crawled pages
      </div>
      ${unscoredList}
    </div>` : ''}

    <!-- Footer -->
    <div style="font-size:11px;color:#9CA3AF;text-align:center;margin-top:32px">
      Dock Radar — Google Search Crawler · ${timestamp} · keyword: "${esc(data.keyword)}" · country: ${esc(data.country)} · pages: ${data.pages}
    </div>
  </div>
</body>
</html>`;
}

const TD = 'padding:8px 10px;text-align:center;border-bottom:1px solid #F3F4F6;font-size:12px';

/* ─── Route ─── */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { results: FinalResults };
    const data = body.results;

    if (!data || !data.keyword) {
      return NextResponse.json({ error: 'Missing results payload' }, { status: 400 });
    }

    const now = new Date();
    const datePart = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const timePart = now.toTimeString().slice(0, 5).replace(':', '-'); // HH-MM
    const kwSlug = data.keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filename = `${datePart}_${timePart}_${kwSlug}_${data.country.toUpperCase()}.html`;

    const timestamp = now.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    });

    const html = generateHtml(data, timestamp);

    // Resolve docs/Google Search relative to project root (two levels up from src/app/api/...)
    const docsDir = path.join(process.cwd(), 'docs', 'Google Search Output');
    fs.mkdirSync(docsDir, { recursive: true });

    const filePath = path.join(docsDir, filename);
    fs.writeFileSync(filePath, html, 'utf8');

    return NextResponse.json({ ok: true, filename, path: `docs/Google Search/${filename}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
