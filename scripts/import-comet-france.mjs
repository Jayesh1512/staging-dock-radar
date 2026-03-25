/**
 * One-shot script: Import both Comet France Excel files into source_candidates.
 * Run: node scripts/import-comet-france.mjs
 */

import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { readFileSync } from 'fs';

const db = createClient(
  'https://lxubuceipdmpovtbukmb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4dWJ1Y2VpcGRtcG92dGJ1a21iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQ3NTMxNiwiZXhwIjoyMDg5MDUxMzE2fQ.X7j1G7JX3YtXNWTCJQpjCTVJrp81cIAvoLf-vCefrss'
);

function normalizeCompanyName(name) {
  if (!name) return '';
  let n = name.toLowerCase().trim();
  n = n.replace(/\(.*?\)/g, '');
  for (const s of ['sas','sarl','sa','eurl','sasu','sci','inc','ltd','llc','gmbh','corp','corporation','limited','co','plc','bv','nv','ag','srl','spa','sl']) {
    n = n.replace(new RegExp(`\\b${s}\\s*$`), '');
  }
  for (const s of ['solutions','services','technologies','technology','systems','group']) {
    n = n.replace(new RegExp(`\\b${s}\\s*$`), '');
  }
  n = n.replace(/[^\w\s]/g, '');
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

function extractDomain(url) {
  if (!url) return null;
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    return hostname.replace(/^www\./, '');
  } catch { return null; }
}

async function main() {
  // 1. Create import run
  const { data: run, error: runErr } = await db
    .from('source_import_runs')
    .insert({
      source_type: 'comet',
      country_code: 'FR',
      run_label: 'FR Comet BVLOS + Dealers (2 files)',
      status: 'running',
    })
    .select().single();

  if (runErr) { console.error('Run create failed:', runErr.message); process.exit(1); }
  console.log('Run ID:', run.id);

  const records = [];
  const seenNames = new Set();

  // ═══════════════════════════════════
  // FILE 1: DJI France Operations (7 BVLOS operators)
  // ═══════════════════════════════════
  console.log('\n── File 1: DJI France Operations ──');
  const wb1 = XLSX.readFile('data/DJI France Operations by Comet-23Mar1423.xlsx');
  const ws1 = wb1.Sheets[wb1.SheetNames[0]];
  const rows1 = XLSX.utils.sheet_to_json(ws1);

  for (const row of rows1) {
    const name = String(row['Company Name'] || '').trim();
    if (!name) continue;
    const normalized = normalizeCompanyName(name);

    if (seenNames.has(normalized)) {
      console.log(`  SKIP (dup): ${name}`);
      continue;
    }
    seenNames.add(normalized);

    records.push({
      source_type: 'comet',
      source_run_id: run.id,
      country_code: 'FR',
      company_name: name,
      normalized_name: normalized,
      normalized_domain: null,
      website: null,
      linkedin_url: null,
      city: String(row['Location'] || '').trim() || null,
      employee_count: null,
      raw_score: 60,
      confidence: 'medium',
      entity_type: 'operator',
      signal_keyword: String(row['Technology/Operation Type'] || '').trim() || null,
      evidence_url: null,
      snippet: `${String(row['Status'] || '')} — ${String(row['Details'] || '').substring(0, 200)}`,
      detected_at: new Date().toISOString(),
      source_meta: {
        sector: String(row['Sector'] || ''),
        partner: String(row['Partner/Contact'] || ''),
        comet_file: 'DJI France Operations by Comet-23Mar1423.xlsx',
      },
      status: 'imported',
    });
    console.log(`  ✓ ${name} → "${normalized}" [operator, medium]`);
  }

  // ═══════════════════════════════════
  // FILE 2: France DSP and SI list (11 dealers)
  // ═══════════════════════════════════
  console.log('\n── File 2: France DSP and SI list ──');
  const wb2 = XLSX.readFile('data/France DSP and SI list by Comet_24Mar1840.xlsx');
  const ws2 = wb2.Sheets[wb2.SheetNames[0]];
  const rows2 = XLSX.utils.sheet_to_json(ws2);

  for (const row of rows2) {
    const name = String(row['Company Name'] || '').trim();
    if (!name) continue;
    const normalized = normalizeCompanyName(name);
    const website = String(row['Website'] || '').trim() || null;
    const dock3 = String(row['DJI Dock 3 Authorized'] || '').trim();

    if (seenNames.has(normalized)) {
      console.log(`  SKIP (dup): ${name}`);
      continue;
    }
    seenNames.add(normalized);

    records.push({
      source_type: 'comet',
      source_run_id: run.id,
      country_code: 'FR',
      company_name: name,
      normalized_name: normalized,
      normalized_domain: extractDomain(website),
      website: website,
      linkedin_url: null,
      city: String(row['City'] || '').trim() || null,
      employee_count: null,
      raw_score: dock3 === 'Yes' ? 85 : 65,
      confidence: dock3 === 'Yes' ? 'high' : 'medium',
      entity_type: 'reseller',
      signal_keyword: dock3 ? `DJI Dock 3 Authorized: ${dock3}` : String(row['Notes'] || '').trim(),
      evidence_url: null,
      snippet: String(row['Notes'] || '').trim(),
      detected_at: new Date().toISOString(),
      source_meta: {
        address: String(row['Address'] || ''),
        phone: String(row['Phone'] || ''),
        email: String(row['Email'] || ''),
        dock3_authorized: dock3,
        comet_file: 'France DSP and SI list by Comet_24Mar1840.xlsx',
      },
      status: 'imported',
    });

    const dock3Flag = dock3 === 'Yes' ? ' ★ DOCK 3 AUTHORIZED' : '';
    console.log(`  ✓ ${name} → "${normalized}" [reseller, ${dock3 === 'Yes' ? 'high' : 'medium'}]${dock3Flag}`);
  }

  // ═══════════════════════════════════
  // UPSERT ALL
  // ═══════════════════════════════════
  console.log(`\n── Upserting ${records.length} records ──`);

  let imported = 0;
  let errors = 0;

  for (const rec of records) {
    const { error } = await db
      .from('source_candidates')
      .upsert(rec, { onConflict: 'source_type,normalized_name,country_code' });

    if (error) {
      console.error(`  ✗ ${rec.company_name}: ${error.message}`);
      errors++;
    } else {
      imported++;
    }
  }

  // Update run
  await db.from('source_import_runs').update({
    total_input: records.length,
    after_dedup: records.length,
    imported,
    errors,
    status: errors > 0 && imported === 0 ? 'failed' : 'completed',
    completed_at: new Date().toISOString(),
  }).eq('id', run.id);

  console.log(`\n═══ RESULT ═══`);
  console.log(`Total records: ${records.length}`);
  console.log(`Imported: ${imported}`);
  console.log(`Errors: ${errors}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
