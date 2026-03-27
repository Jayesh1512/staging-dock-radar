import fs from 'fs';
import path from 'path';
import type { QACompanyOutput, QASummary } from './types';
import { CONFIDENCE_FORMULA_NOTE } from './confidence';

/* ─── Color constants ─── */

const SRC_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  dji_dealer: { bg: '#DBEAFE', text: '#1E40AF', label: 'DJI Dealer' },
  google_search: { bg: '#FEF3C7', text: '#92400E', label: 'Google Search' },
  comet: { bg: '#F3E8FF', text: '#7C3AED', label: 'Comet' },
  chatgpt: { bg: '#FEE2E2', text: '#991B1B', label: 'ChatGPT' },
  serper_website: { bg: '#ECFDF5', text: '#065F46', label: 'Serper' },
  linkedin_posts: { bg: '#E0F2FE', text: '#0369A1', label: 'LinkedIn' },
};

const CONF_COLORS: Record<string, { bg: string; text: string }> = {
  high: { bg: '#DCFCE7', text: '#059669' },
  medium: { bg: '#FEF3C7', text: '#D97706' },
  low: { bg: '#FEE2E2', text: '#DC2626' },
  none: { bg: '#F3F4F6', text: '#6B7280' },
};

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  Operator: { bg: '#DCFCE7', text: '#166534' },
  'Operator (end-user)': { bg: '#D1FAE5', text: '#065F46' },
  'System Integrator': { bg: '#DBEAFE', text: '#1E40AF' },
  'Solution Provider': { bg: '#F3E8FF', text: '#7C3AED' },
  Dealer: { bg: '#FEF3C7', text: '#92400E' },
  Media: { bg: '#E0E7FF', text: '#3730A3' },
  unknown: { bg: '#F3F4F6', text: '#6B7280' },
};

/* ─── Helpers ─── */

function badge(label: string, bg: string, color: string, extra = ''): string {
  return `<span style="padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;background:${bg};color:${color};display:inline-block;margin:1px${extra}">${label}</span>`;
}

function smallBadge(label: string, bg: string, color: string): string {
  return `<span style="padding:1px 6px;border-radius:4px;font-size:9px;font-weight:700;background:${bg};color:${color};display:inline-block;margin:1px">${label}</span>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function link(url: string, text: string): string {
  return `<a href="${esc(url)}" target="_blank" style="color:#2563EB">${esc(text)}</a>`;
}

/* ─── Row renderer ─── */

function renderRow(c: QACompanyOutput, idx: number): string {
  const rowBg = c.dock_confirmed ? '#F0FDF4' : '#FAFAFA';

  // Source badges
  const srcBadges = c.sources_confirmed.map(s => {
    const sc = SRC_COLORS[s] ?? { bg: '#F3F4F6', text: '#6B7280', label: s };
    let label = sc.label;
    if (s === 'serper_website' && c.serper) label = `Serper (${c.serper.hits})`;
    if (s === 'linkedin_posts' && c.linkedin) label = `LinkedIn (${c.linkedin.mentions})`;
    return smallBadge(label, sc.bg, sc.text);
  }).join('');

  // Role badge
  const rc = ROLE_COLORS[c.role] ?? ROLE_COLORS.unknown;

  // Confidence badge
  const cc = CONF_COLORS[c.confidence];

  // Dock badge
  const dockBadge = c.dock_confirmed
    ? badge(`✓ ${c.dock_models || 'Dock'}`, '#DCFCE7', '#166534')
    : badge('No Dock evidence', '#FEE2E2', '#991B1B');

  // Website
  const ws = c.website ? link(c.website, c.domain) : `<span style="color:#D1D5DB">${esc(c.domain)}</span>`;

  // LinkedIn
  const li = c.linkedin_url ? link(c.linkedin_url, 'LinkedIn') : '<span style="color:#D1D5DB">—</span>';

  // Evidence
  const ev = c.evidence_url ? `<a href="${esc(c.evidence_url)}" target="_blank" style="color:#2563EB;font-size:10px">Evidence ↗</a>` : '<span style="color:#D1D5DB;font-size:10px">—</span>';

  return `<tr style="background:${rowBg}" data-confidence="${c.confidence}" data-country="${c.country}" data-dock="${c.dock_confirmed}">
  <td style="padding:7px 8px;text-align:center;border-bottom:1px solid #E5E7EB;font-size:12px">${idx}</td>
  <td style="padding:7px 8px;text-align:left;border-bottom:1px solid #E5E7EB;font-size:12px;font-weight:700">${esc(c.name)}</td>
  <td style="padding:7px 8px;text-align:center;border-bottom:1px solid #E5E7EB;font-size:12px">${badge(c.country, c.country === 'FR' ? '#DBEAFE' : '#FEF3C7', c.country === 'FR' ? '#1E40AF' : '#92400E')}</td>
  <td style="padding:7px 8px;text-align:center;border-bottom:1px solid #E5E7EB;font-size:12px">${badge(c.role, rc.bg, rc.text)}</td>
  <td style="padding:7px 8px;text-align:center;border-bottom:1px solid #E5E7EB;font-size:12px">${dockBadge}</td>
  <td style="padding:7px 8px;text-align:center;border-bottom:1px solid #E5E7EB;font-size:12px">${badge(c.confidence + ' (' + c.confidence_score + ')', cc.bg, cc.text)}</td>
  <td style="padding:7px 8px;text-align:center;border-bottom:1px solid #E5E7EB;font-size:12px">${srcBadges}</td>
  <td style="padding:7px 8px;text-align:left;border-bottom:1px solid #E5E7EB;font-size:11px">${ws}</td>
  <td style="padding:7px 8px;text-align:center;border-bottom:1px solid #E5E7EB;font-size:11px">${li}</td>
  <td style="padding:7px 8px;text-align:center;border-bottom:1px solid #E5E7EB;font-size:11px">${ev}</td>
</tr>
<tr>
  <td colspan="10" style="padding:4px 8px 8px 40px;border-bottom:2px solid #E5E7EB;font-size:10px;color:#6B7280;background:#FAFAFA">
    <strong>Verified via:</strong> ${esc(c.evidence_summary)}<br/>
    ${c.notes ? `<strong>Notes:</strong> ${esc(c.notes)}` : ''}
  </td>
</tr>`;
}

/* ─── KPI card ─── */

function kpiCard(label: string, value: number, color: string): string {
  return `<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:14px 18px;text-align:center;min-width:100px">
  <div style="font-size:26px;font-weight:800;color:${color}">${value}</div>
  <div style="font-size:11px;color:#6B7280;margin-top:2px">${label}</div>
</div>`;
}

/* ─── Main generator ─── */

export function generateQAReport(
  results: QACompanyOutput[],
  summary: QASummary,
  country: string,
  runLabel: string,
): string {
  const now = new Date().toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });

  // Group by country
  const countries = [...new Set(results.map(r => r.country))].sort();

  const tableHeaders = `<thead><tr>
    <th>#</th>
    <th style="text-align:left">Company</th>
    <th>Country</th>
    <th>Role</th>
    <th>DJI Dock</th>
    <th>Confidence</th>
    <th>Sources</th>
    <th style="text-align:left">Website</th>
    <th>LinkedIn</th>
    <th>Evidence</th>
  </tr></thead>`;

  // Build country sections
  const countrySections = countries.map(cc => {
    const group = results.filter(r => r.country === cc);
    const confirmed = group.filter(r => r.dock_confirmed).length;
    const noEvidence = group.length - confirmed;
    const rows = group.map((r, i) => renderRow(r, i + 1)).join('\n');

    return `<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;margin-bottom:24px">
  <div style="padding:12px 16px;border-bottom:1px solid #E5E7EB;font-size:14px;font-weight:700">
    ${esc(cc)} (${group.length} companies)
    <span style="font-size:11px;font-weight:400;color:#059669;margin-left:8px">${confirmed} confirmed</span>
    <span style="font-size:11px;font-weight:400;color:#DC2626;margin-left:8px">${noEvidence} no evidence</span>
  </div>
  <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse">${tableHeaders}<tbody>${rows}</tbody></table>
  </div>
</div>`;
  }).join('\n');

  // Source legend
  const legendItems = Object.entries(SRC_COLORS).map(([, v]) =>
    `<div>${smallBadge(v.label, v.bg, v.text)} ${v.label === 'Serper' ? 'site:domain "DJI Dock" — pages found on website' : v.label === 'LinkedIn' ? 'site:linkedin.com/company/X "DJI Dock"' : ''}</div>`
  ).join('');

  // Filters (simple JS inline)
  const filterScript = `<script>
function filterRows(){
  var conf=document.getElementById('fConf').value;
  var dock=document.getElementById('fDock').value;
  var country=document.getElementById('fCountry').value;
  var rows=document.querySelectorAll('tr[data-confidence]');
  rows.forEach(function(r){
    var show=true;
    var next=r.nextElementSibling;
    if(conf!=='all'&&r.dataset.confidence!==conf)show=false;
    if(dock==='yes'&&r.dataset.dock!=='true')show=false;
    if(dock==='no'&&r.dataset.dock!=='false')show=false;
    if(country!=='all'&&r.dataset.country!==country)show=false;
    r.style.display=show?'':'none';
    if(next&&!next.dataset.confidence)next.style.display=show?'':'none';
  });
}
</script>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Dock Radar — QA Report — ${esc(runLabel)} — ${now}</title>
  <style>
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F8FAFC;color:#111827}
    .wrap{max-width:1400px;margin:0 auto;padding:32px 24px 64px}
    table{width:100%;border-collapse:collapse}
    th{padding:9px 10px;font-size:11px;font-weight:600;color:#6B7280;background:#F9FAFB;border-bottom:2px solid #E5E7EB;text-align:center;white-space:nowrap}
    tr:hover td{background:#F0F9FF!important}
    a{color:#2563EB;text-decoration:none}a:hover{text-decoration:underline}
    select{padding:6px 12px;border-radius:6px;border:1px solid #D1D5DB;font-size:13px}
  </style>
</head>
<body>
  <div style="background:#fff;border-bottom:1px solid #E5E7EB;padding:0 24px">
    <div style="max-width:1400px;margin:0 auto;height:53px;display:flex;align-items:center;gap:10px">
      <div style="width:28px;height:28px;background:#2563EB;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700">DR</div>
      <span style="font-size:15px;font-weight:700;color:#2563EB">Dock Radar</span>
      <span style="font-size:11px;color:#9CA3AF">QA Agent Verification Report</span>
    </div>
  </div>

  <div class="wrap">
    <div style="margin-bottom:24px">
      <h1 style="font-size:22px;font-weight:800;margin:0 0 6px">${esc(runLabel)}</h1>
      <div style="font-size:13px;color:#6B7280">${summary.total} companies · ${summary.serper_credits_used} Serper credits used · Generated ${now}</div>
    </div>

    <!-- KPIs -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px">
      ${kpiCard('Total', summary.total, '#111827')}
      ${kpiCard('Dock Confirmed', summary.confirmed, '#059669')}
      ${kpiCard('No Evidence', summary.total - summary.confirmed, '#DC2626')}
      ${kpiCard('High', summary.high, '#059669')}
      ${kpiCard('Medium', summary.medium, '#D97706')}
      ${kpiCard('Low', summary.low, '#DC2626')}
    </div>

    <!-- Legend -->
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:16px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;margin-bottom:8px">Verification Sources</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:#6B7280">${legendItems}</div>
    </div>

    <!-- Filters -->
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
      <select id="fCountry" onchange="filterRows()">
        <option value="all">All Countries</option>
        ${countries.map(cc => `<option value="${cc}">${cc}</option>`).join('')}
      </select>
      <select id="fConf" onchange="filterRows()">
        <option value="all">All Confidence</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
        <option value="none">None</option>
      </select>
      <select id="fDock" onchange="filterRows()">
        <option value="all">All Dock Status</option>
        <option value="yes">Dock Confirmed</option>
        <option value="no">No Evidence</option>
      </select>
    </div>

    <!-- Tables -->
    ${countrySections}

    <!-- Scoring footnote -->
    <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:16px;margin-top:24px">
      <div style="font-size:11px;font-weight:700;color:#6B7280;margin-bottom:4px">Confidence Scoring Formula</div>
      <div style="font-size:10px;color:#9CA3AF">${esc(CONFIDENCE_FORMULA_NOTE)}</div>
    </div>

    <div style="text-align:center;font-size:11px;color:#9CA3AF;margin-top:32px">
      Generated by Dock Radar QA Agent · ${now}
    </div>
  </div>
  ${filterScript}
</body>
</html>`;

  // Write to file
  const reportsDir = path.join(process.cwd(), 'docs', 'QA Reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const dateStr = new Date().toISOString().slice(0, 10);
  const timeStr = new Date().toISOString().slice(11, 16).replace(':', '');
  const filename = `qa-${country.toLowerCase()}-${dateStr}-${timeStr}.html`;
  const filePath = path.join(reportsDir, filename);

  fs.writeFileSync(filePath, html, 'utf8');

  return `docs/QA Reports/${filename}`;
}
