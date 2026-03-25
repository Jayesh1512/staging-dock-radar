/**
 * DRY RUN v2: Import Netherlands all-sources Excel into source_candidates.
 * No DB writes — outputs what WOULD be imported + flags gaps/concerns.
 *
 * Fixes applied:
 *  1. ILT OA dual-auth rows → merge auth numbers into array
 *  2. Process high-score sources first (DCRO→ILT STS→ILT OA) so best record wins
 *  3. Drones.nl T2 false positive → only check Operations Type + Notes for BVLOS, not Category
 *  4. Drones.nl domain → set null (all point to drones.nl, would falsely merge)
 *
 * Run: node scripts/import-nl-all-sources-dryrun.mjs
 */

import XLSX from 'xlsx';

const FILE = 'data/Netherlands_NL_DSP_SI_All_Sources-except-google-search-25Mar1251.xlsx';
const COUNTRY = 'NL';

// ═══════════════════════════════════════════
// Source → enum mapping + processing priority (lower = processed first)
// ═══════════════════════════════════════════
const SOURCE_MAP = {
  'Comet Browser':          { source_type: 'comet',              default_evidence: null,                                                       priority: 1 },
  'DJI Enterprise Website': { source_type: 'dji_reseller_list',  default_evidence: 'https://store.dji.com/nl/pages/enterprise-dealer',          priority: 2 },
  'ILT STS Register':       { source_type: 'aviation_authority', default_evidence: 'https://www.ilent.nl/onderwerpen/drones/drone-operatoren',  priority: 3 },
  'DCRO':                   { source_type: 'aviation_authority', default_evidence: 'https://www.dcro.nl/gecertificeerde-operators',              priority: 4 },
  'Drones.nl Directory':    { source_type: 'public_directory',   default_evidence: 'https://www.drones.nl/bedrijven',                           priority: 5 },
  'ILT OA Register':        { source_type: 'aviation_authority', default_evidence: 'https://www.ilent.nl/onderwerpen/drones/drone-operatoren',  priority: 6 },
};

// ═══════════════════════════════════════════
// Scoring logic per source
// ═══════════════════════════════════════════
function scoreRow(row, excelSource) {
  const ops = (row['Operations Type'] || '').toLowerCase();
  const cat = (row['Category'] || '').toLowerCase();
  const notes = (row['Notes'] || '').toLowerCase();
  const combined = `${ops} ${cat} ${notes}`;

  const hasDock = combined.includes('dji dock') || combined.includes('dock 2') || combined.includes('dock 3');
  const hasBVLOS = combined.includes('bvlos');
  const hasLUC = /\bluc\b/.test(combined);  // word-boundary to avoid luchtvaart/luchtfotografie
  const hasDIAB = combined.includes('drone-in-a-box') || combined.includes('drone in a box');

  switch (excelSource) {
    case 'Comet Browser': {
      if (hasDock) return { score: 85, confidence: 'high', entity_type: 'operator' };
      if (hasBVLOS || hasLUC || hasDIAB) return { score: 70, confidence: 'high', entity_type: 'operator' };
      if (cat.includes('reseller') || cat.includes('dealer')) return { score: 65, confidence: 'medium', entity_type: 'reseller' };
      return { score: 60, confidence: 'medium', entity_type: 'operator' };
    }
    case 'DJI Enterprise Website': {
      const isDockInstaller = combined.includes('dock installer') || combined.includes('dock authorized');
      if (isDockInstaller) return { score: 85, confidence: 'high', entity_type: 'reseller' };
      if (cat.includes('enterprise dealer') || ops.includes('enterprise dealer') || ops.includes('high priority'))
        return { score: 80, confidence: 'high', entity_type: 'reseller' };
      return { score: 65, confidence: 'medium', entity_type: 'reseller' };
    }
    case 'ILT STS Register':
      return { score: 65, confidence: 'medium', entity_type: 'operator' };
    case 'DCRO':
      return { score: 50, confidence: 'medium', entity_type: 'operator' };
    case 'ILT OA Register':
      return { score: 30, confidence: 'low', entity_type: 'operator' };
    case 'Drones.nl Directory': {
      const industrial = cat.includes('inspectie') || cat.includes('agrarisch');
      if (industrial) return { score: 40, confidence: 'low', entity_type: 'operator' };
      if (cat.includes('droneshops')) return { score: 35, confidence: 'low', entity_type: 'reseller' };
      return { score: 25, confidence: 'low', entity_type: 'unknown' };
    }
    default:
      return { score: 20, confidence: 'low', entity_type: 'unknown' };
  }
}

// ═══════════════════════════════════════════
// Normalization
// ═══════════════════════════════════════════
function normalizeCompanyName(name) {
  if (!name) return '';
  let n = name.toLowerCase().trim();
  n = n.replace(/\(.*?\)/g, '');
  for (const s of ['sas','sarl','sa','eurl','sasu','sci','inc','ltd','llc','gmbh','corp','corporation','limited','co','plc','bv','nv','ag','srl','spa','sl','vof','v.o.f.','b.v.','n.v.']) {
    n = n.replace(new RegExp(`\\b${s.replace(/\./g, '\\.')}\\s*$`), '');
  }
  for (const s of ['solutions','services','technologies','technology','systems','group']) {
    n = n.replace(new RegExp(`\\b${s}\\s*$`), '');
  }
  n = n.replace(/[^\w\s]/g, '');
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

function extractDomain(url, excelSource) {
  // Fix 4: Drones.nl URLs all resolve to drones.nl — skip domain extraction
  if (excelSource === 'Drones.nl Directory') return null;
  if (!url) return null;
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    return hostname.replace(/^www\./, '');
  } catch { return null; }
}

function extractLinkedIn(url) {
  if (!url) return null;
  let u = url.trim();
  if (!u.startsWith('http')) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    if (parsed.hostname.includes('linkedin.com')) return u;
  } catch {}
  return null;
}

function getAuthType(excelSource) {
  if (excelSource === 'ILT OA Register') return 'OA';
  if (excelSource === 'ILT STS Register') return 'STS';
  if (excelSource === 'DCRO') return 'DCRO';
  return null;
}

// ═══════════════════════════════════════════
// Main
// ═══════════════════════════════════════════
const wb = XLSX.readFile(FILE);
const rawData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

// Fix 2: Sort rows by source priority (high-value sources first)
const data = [...rawData].sort((a, b) => {
  const srcA = String(a['Source'] || '').trim();
  const srcB = String(b['Source'] || '').trim();
  const priA = SOURCE_MAP[srcA]?.priority ?? 99;
  const priB = SOURCE_MAP[srcB]?.priority ?? 99;
  return priA - priB;
});

console.log(`\n${'═'.repeat(60)}`);
console.log(`DRY RUN v2: NL All-Sources Import`);
console.log(`File: ${FILE}`);
console.log(`Total rows in Excel: ${data.length}`);
console.log(`Processing order: Comet → DJI → ILT STS → DCRO → Drones.nl → ILT OA`);
console.log(`${'═'.repeat(60)}\n`);

const records = [];
const gaps = [];
const seenKeys = new Map();     // "source_type|normalized_name" → record object
const nameToSources = {};       // normalized_name → Set of excel source names

let skippedEmpty = 0;
let skippedDupLowerScore = 0;
let mergedAuthNumbers = 0;

for (const row of data) {
  const name = String(row['Company Name'] || '').trim();
  if (!name) { skippedEmpty++; continue; }

  const excelSource = String(row['Source'] || '').trim();
  const mapping = SOURCE_MAP[excelSource];
  if (!mapping) {
    gaps.push({ type: 'UNKNOWN_SOURCE', name, source: excelSource });
    continue;
  }

  const normalized = normalizeCompanyName(name);
  const { source_type, default_evidence } = mapping;
  const dedupKey = `${source_type}|${normalized}`;

  // Track cross-source appearances (all excel sources, not just source_type)
  if (!nameToSources[normalized]) nameToSources[normalized] = new Set();
  nameToSources[normalized].add(excelSource);

  const { score, confidence, entity_type } = scoreRow(row, excelSource);

  // Within-source-type dedup
  if (seenKeys.has(dedupKey)) {
    const existing = seenKeys.get(dedupKey);

    // Fix 1: If same source (ILT OA + ILT OA), merge auth numbers
    const authNum = String(row['ILT Auth #'] || '').trim();
    if (source_type === 'aviation_authority' && authNum && existing.source_meta.auth_type === getAuthType(excelSource)) {
      // Same sub-source, different auth number → merge
      if (!existing.source_meta.auth_numbers) {
        existing.source_meta.auth_numbers = existing.source_meta.auth_number ? [existing.source_meta.auth_number] : [];
      }
      if (!existing.source_meta.auth_numbers.includes(authNum)) {
        existing.source_meta.auth_numbers.push(authNum);
        mergedAuthNumbers++;
      }
      continue;
    }

    // Different sub-source within aviation_authority (e.g. DCRO already in, ILT OA arriving)
    // Keep higher score (already in since we process high-score first)
    skippedDupLowerScore++;
    gaps.push({
      type: 'SKIPPED_LOWER_SCORE',
      name,
      normalized,
      source_type,
      kept: `${existing.source_meta.source_name} (score ${existing.raw_score})`,
      dropped: `${excelSource} (score ${score})`,
    });
    continue;
  }

  const website = String(row['Website'] || '').trim() || null;
  const linkedin = extractLinkedIn(row['LinkedIn']);
  const sourceUrl = String(row['Source URL'] || '').trim() || null;

  const rec = {
    source_type,
    country_code: COUNTRY,
    company_name: name,
    normalized_name: normalized,
    normalized_domain: extractDomain(website, excelSource),
    website,
    linkedin_url: linkedin,
    city: null,
    employee_count: null,
    raw_score: score,
    confidence,
    entity_type,
    signal_keyword: String(row['Category'] || '').trim() || null,
    evidence_url: sourceUrl || default_evidence,
    snippet: String(row['Operations Type'] || '').trim() || null,
    detected_at: new Date().toISOString(),
    source_meta: {
      source_name: excelSource,
      auth_type: getAuthType(excelSource),
      auth_number: String(row['ILT Auth #'] || '').trim() || null,
      military_ctr: String(row['ILT Military CTR'] || '').trim() || null,
      civil_ctr: String(row['ILT Civil CTR'] || '').trim() || null,
      expiry_date: String(row['ILT Expiry'] || '').trim() || null,
      udp_exemption: String(row['ILT UDP Exemption'] || '').trim() || null,
      notes: String(row['Notes'] || '').trim() || null,
    },
    status: 'imported',
  };

  // Flag gaps
  if (!website && !linkedin) {
    gaps.push({ type: 'NO_CONTACT_SURFACE', name, source_type, excelSource });
  }
  if (normalized.length <= 3) {
    gaps.push({ type: 'SHORT_NAME', name, normalized, source_type });
  }

  records.push(rec);
  seenKeys.set(dedupKey, rec);
}

// ═══════════════════════════════════════════
// REPORT
// ═══════════════════════════════════════════

console.log('── RECORDS TO IMPORT ──\n');

const byType = {};
records.forEach(r => {
  if (!byType[r.source_type]) byType[r.source_type] = { total: 0, high: 0, medium: 0, low: 0, hasWeb: 0, hasLI: 0 };
  byType[r.source_type].total++;
  byType[r.source_type][r.confidence]++;
  if (r.website) byType[r.source_type].hasWeb++;
  if (r.linkedin_url) byType[r.source_type].hasLI++;
});

console.log('Source Type            | Count | High | Med  | Low  | Web  | LI');
console.log('-'.repeat(75));
let totalRecs = 0;
for (const [type, s] of Object.entries(byType).sort((a,b) => b[1].total - a[1].total)) {
  console.log(`${type.padEnd(23)}| ${String(s.total).padStart(5)} | ${String(s.high).padStart(4)} | ${String(s.medium).padStart(4)} | ${String(s.low).padStart(4)} | ${String(s.hasWeb).padStart(4)} | ${String(s.hasLI).padStart(4)}`);
  totalRecs += s.total;
}
console.log('-'.repeat(75));
console.log(`${'TOTAL'.padEnd(23)}| ${String(totalRecs).padStart(5)} |`);

// By original source name
console.log('\n── BY ORIGINAL SOURCE NAME (what won per slot) ──\n');
const byOriginal = {};
records.forEach(r => {
  const sn = r.source_meta.source_name;
  if (!byOriginal[sn]) byOriginal[sn] = 0;
  byOriginal[sn]++;
});
Object.entries(byOriginal).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${v.toString().padStart(4)}  ${k}`));

// Dedup stats
console.log('\n── DEDUP ──\n');
console.log(`Skipped empty names: ${skippedEmpty}`);
console.log(`Merged auth numbers (ILT dual-auth): ${mergedAuthNumbers}`);
console.log(`Skipped lower-score dups: ${skippedDupLowerScore}`);

// Show what got dropped
const droppedEntries = gaps.filter(g => g.type === 'SKIPPED_LOWER_SCORE');
if (droppedEntries.length > 0) {
  console.log(`\nKept higher-score record, dropped lower:`);
  droppedEntries.slice(0, 15).forEach(g => {
    console.log(`  "${g.name}" — kept: ${g.kept}, dropped: ${g.dropped}`);
  });
  if (droppedEntries.length > 15) console.log(`  ... and ${droppedEntries.length - 15} more`);
}

// Auth merges
const authMerged = records.filter(r => r.source_meta.auth_numbers && r.source_meta.auth_numbers.length > 1);
if (authMerged.length > 0) {
  console.log(`\nMerged dual-auth records (${authMerged.length}):`);
  authMerged.forEach(r => {
    console.log(`  ${r.company_name}: ${r.source_meta.auth_numbers.join(', ')}`);
  });
}

// Cross-source (by normalized name across different excel sources)
const multiSource = Object.entries(nameToSources).filter(([,s]) => s.size >= 2);
console.log(`\n── MULTI-SOURCE COMPANIES (${multiSource.length}) ──`);
console.log(`(These will merge in the grouped API view)\n`);
multiSource.sort((a,b) => b[1].size - a[1].size).forEach(([name, sources]) => {
  console.log(`  ${sources.size} sources: ${name} — ${[...sources].join(', ')}`);
});

// Gaps
const otherGaps = gaps.filter(g => g.type !== 'SKIPPED_LOWER_SCORE');
console.log(`\n── REMAINING GAPS (${otherGaps.length}) ──\n`);

const gapsByType = {};
otherGaps.forEach(g => { if (!gapsByType[g.type]) gapsByType[g.type] = []; gapsByType[g.type].push(g); });

for (const [type, items] of Object.entries(gapsByType)) {
  console.log(`${type} (${items.length}):`);
  if (type === 'NO_CONTACT_SURFACE') {
    const bySource = {};
    items.forEach(i => { bySource[i.excelSource] = (bySource[i.excelSource]||0)+1; });
    Object.entries(bySource).sort((a,b) => b[1]-a[1]).forEach(([src, cnt]) => {
      console.log(`  ${src}: ${cnt} with no website AND no LinkedIn`);
    });
  } else {
    items.slice(0, 10).forEach(i => console.log(`  ${i.name} | ${i.source_type || ''} | ${i.normalized || i.website || ''}`));
    if (items.length > 10) console.log(`  ... and ${items.length - 10} more`);
  }
  console.log('');
}

// Waterfall tier preview (Fix 3: T2 uses only Operations Type + Notes, not Category)
console.log('── WATERFALL TIER PREVIEW ──\n');

const t1 = records.filter(r => {
  // Only check Operations Type (snippet) + Notes — NOT Category (signal_keyword)
  const text = `${r.snippet || ''} ${r.source_meta?.notes || ''}`.toLowerCase();
  return text.includes('dji dock') || text.includes('dock 2') || text.includes('dock 3') || text.includes('dock installer');
});

const t2 = records.filter(r => {
  if (t1.includes(r)) return false;
  // Fix 3: Only Operations Type + Notes for BVLOS check — NOT Drones.nl category tags
  const text = `${r.snippet || ''} ${r.source_meta?.notes || ''}`.toLowerCase();
  const cat = (r.signal_keyword || '').toLowerCase();
  // Allow category check only for non-public_directory sources
  const catCheck = r.source_type !== 'public_directory' ? cat.includes('bvlos') || cat.includes('luc') : false;
  return text.includes('bvlos') || text.includes('luc') || text.includes('drone-in-a-box') || catCheck;
});

const t3names = new Set(multiSource.map(([n]) => n));
const t3 = records.filter(r => !t1.includes(r) && !t2.includes(r) && t3names.has(r.normalized_name));
const t4 = records.filter(r => !t1.includes(r) && !t2.includes(r) && !t3.includes(r) && r.entity_type === 'reseller');
const t5 = records.filter(r => {
  if (t1.includes(r) || t2.includes(r) || t3.includes(r) || t4.includes(r)) return false;
  const cat = (r.signal_keyword || '').toLowerCase();
  return cat.includes('inspectie') || cat.includes('agrarisch');
});

console.log(`T1 — Dock Signal:         ${t1.length} companies`);
t1.forEach(r => console.log(`     ${r.company_name} [${r.source_meta.source_name}] score=${r.raw_score} ${r.confidence}`));

console.log(`T2 — BVLOS/LUC:           ${t2.length} companies`);
t2.forEach(r => console.log(`     ${r.company_name} [${r.source_meta.source_name}] score=${r.raw_score} ${r.confidence}`));

console.log(`T3 — Multi-Source:        ${t3.length} records (${multiSource.length} unique companies)`);
t3.slice(0, 15).forEach(r => console.log(`     ${r.company_name} [${r.source_meta.source_name}] score=${r.raw_score}`));
if (t3.length > 15) console.log(`     ... and ${t3.length - 15} more`);

console.log(`T4 — DJI/Reseller:        ${t4.length} companies`);
t4.forEach(r => console.log(`     ${r.company_name} [${r.source_meta.source_name}] score=${r.raw_score}`));

console.log(`T5 — Industrial Vertical: ${t5.length} companies`);
t5.forEach(r => console.log(`     ${r.company_name} [${r.source_meta.source_name}] ${r.signal_keyword}`));

const topN = t1.length + t2.length;
const rest = records.length - t1.length - t2.length - t3.length - t4.length - t5.length;
console.log(`\n── SUMMARY ──`);
console.log(`Top targets (T1+T2):    ${topN} — present directly to leadership`);
console.log(`Strong leads (T3+T4):   ${t3.length + t4.length} — multi-source corroborated + dealers`);
console.log(`Potential (T5):         ${t5.length} — industrial vertical match`);
console.log(`Bulk (below T5):        ${rest} — generic operators, low priority\n`);

console.log(`${'═'.repeat(60)}`);
console.log(`DRY RUN v2 COMPLETE — No DB changes made.`);
console.log(`${'═'.repeat(60)}`);
