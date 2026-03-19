#!/usr/bin/env node
/**
 * Patch discovered_companies — clean corrupted arrays + apply country/industry fixes.
 *
 * WHY: The backfill/scoring pipeline stored JSON.stringify(array) as a string into
 * the JSONB column. This caused arrays to be stored as individual characters:
 *   ["[", "\"", "S", "o", "u", ...] instead of ["South Africa"]
 * This script:
 *   Phase 0 — Clean all corrupted country/industry arrays (remove char artifacts)
 *   Phase 1 — Apply country patches (empty + wrong value rows)
 *   Phase 2 — Apply industry patches (all blank rows)
 *   Phase 3 — Insert missing company stubs not yet in discovered_companies
 *
 * Usage:
 *   node scripts/patch-tab2-data.mjs            # apply all changes
 *   node scripts/patch-tab2-data.mjs --dry-run  # preview only
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');

// ── Load .env.local ──────────────────────────────────────────────────────────
try {
  const envContent = readFileSync(resolve(__dirname, '../.env.local'), 'utf8');
  for (const line of envContent.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (k && !process.env[k]) process.env[k] = v;
  }
} catch { /* ignore */ }

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// ── Valid value sets ──────────────────────────────────────────────────────────

const VALID_COUNTRIES = new Set([
  'US', 'Canada', 'Brazil', 'Mexico',
  'UK', 'Germany', 'France', 'Italy', 'Spain', 'Austria', 'Belgium', 'Ireland', 'Netherlands',
  'India', 'Singapore', 'Japan', 'Australia', 'South Korea', 'Malaysia', 'Indonesia',
  'UAE', 'Saudi Arabia', 'Turkey',
  'South Africa', 'China', 'Chile', 'Lithuania',
]);

const VALID_INDUSTRIES = new Set([
  'Energy & Utilities',
  'Public Safety & Emergency Response',
  'Oil & Gas / Industrial Assets',
  'Mining & Natural Resources',
  'Construction & Infrastructure',
  'Ports, Maritime & Logistics Hubs',
  'Agriculture & Forestry',
  'Perimeter Security & Smart Facilities',
  'Water & Environmental Utilities',
]);

// Filter an array to only valid country/industry strings (removes char artifacts)
function clean(arr, validSet) {
  if (!arr || !Array.isArray(arr)) return [];
  return arr.filter(v => typeof v === 'string' && validSet.has(v));
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function fmt(arr) {
  if (!arr || arr.length === 0) return '(empty)';
  return arr.join('; ');
}

/** Mirrors src/lib/company-normalize.ts */
function normalizeCompanyName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(inc|ltd|llc|gmbh|corp|co|company|limited|incorporated|plc|ag|bv|srl|sas|sa|nv|fzco|fze|pvt|private|public|international)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Country patches ───────────────────────────────────────────────────────────
// Applied after cleanup. Only sets countries if still empty after cleanup,
// unless force=true (for wrong-value rows).

const COUNTRY_PATCHES = [
  // Empty → set from enrichment CSV / domain knowledge
  { displayName: 'Falcon Unmanned Systems',    countries: ['US'],           note: 'Enrichment CSV: Dyer, Indiana, USA' },
  { displayName: 'Terra Drone Arabia',         countries: ['Saudi Arabia'], note: 'Enrichment CSV: Al Khobar, Saudi Arabia' },
  { displayName: 'Eye-bot Aerial Solutions',   countries: ['South Africa'], note: 'Known South African drone company' },
  { displayName: 'GNSS AE',                    countries: ['UAE'],          note: 'Company .ae suffix + renewable energy article' },
  { displayName: 'Planai-Hochwurzen-Bahnen',   countries: ['Austria'],      note: 'Planai ski resort, Schladming, Austria' },
  { displayName: 'GÜRİŞ',                      countries: ['Turkey'],       note: 'Güriş Holding: Turkish construction group' },
  { displayName: 'ITG Technology Center',      countries: ['UAE'],          note: 'LinkedIn article origin; UAE context' },
  // Wrong value → force overwrite
  { displayName: 'Volatus Aerospace',          countries: ['Canada'],       force: true, note: 'Enrichment CSV: Mirabel, Quebec, Canada' },
];

// ── Industry patches ──────────────────────────────────────────────────────────

const INDUSTRY_PATCHES = [
  { displayName: '24/7 Drone Force',                industries: ['Perimeter Security & Smart Facilities'], note: 'SA security surveillance DSP' },
  { displayName: 'AERONEX',                         industries: ['Energy & Utilities'],                    note: 'DJI ME reseller; infrastructure/energy deployment' },
  { displayName: 'Aeronex FZCO',                    industries: ['Energy & Utilities'],                    note: 'Same as AERONEX, FZCO entity' },
  { displayName: 'Agridrone (PTY) Ltd',             industries: ['Agriculture & Forestry'],                note: '"Agri" in company name' },
  { displayName: 'Cannon Dynamics',                 industries: ['Perimeter Security & Smart Facilities'], note: 'Anti-poaching UAV payload article' },
  { displayName: 'Changsha City Authorities',       industries: ['Construction & Infrastructure'],         note: 'Urban governance / highway patrol' },
  { displayName: 'Dubai Holding',                   industries: ['Construction & Infrastructure'],         note: 'Real estate & infrastructure conglomerate' },
  { displayName: 'Eye-bot Aerial Solutions',        industries: ['Perimeter Security & Smart Facilities'], note: 'SA security surveillance DSP' },
  { displayName: 'Falcon Unmanned Systems',         industries: ['Perimeter Security & Smart Facilities'], note: 'Enrichment: "Small DSP", DEPLOYMENT signal' },
  { displayName: 'Fidelity Services Group',         industries: ['Perimeter Security & Smart Facilities'], note: 'Major SA security services company' },
  { displayName: 'GNSS AE',                         industries: ['Energy & Utilities'],                    note: 'Article: Transforming Renewable Energy Operations' },
  { displayName: 'GS5 Systems',                     industries: ['Perimeter Security & Smart Facilities'], note: 'Enrichment notes: "Security"' },
  { displayName: 'GÜRİŞ',                           industries: ['Construction & Infrastructure'],         note: 'Güriş Holding: Turkish construction/infrastructure group' },
  { displayName: 'ITG Technology Center',           industries: ['Construction & Infrastructure'],         note: 'Infrastructure context from article' },
  { displayName: 'Jiliao Expressway',               industries: ['Construction & Infrastructure'],         note: 'Highway expressway operator' },
  { displayName: 'Nokia',                           industries: ['Construction & Infrastructure'],         note: 'Telecom infrastructure deployment' },
  { displayName: 'PHOTOSOL',                        industries: ['Energy & Utilities'],                    note: 'French solar energy company' },
  { displayName: 'Planai-Hochwurzen-Bahnen',        industries: ['Perimeter Security & Smart Facilities'], note: 'Ski resort safety/surveillance operations' },
  { displayName: 'SkyVisor',                        industries: ['Energy & Utilities'],                    note: 'Same solar operations article as PHOTOSOL (France)' },
  { displayName: 'Team UAV',                        industries: ['Construction & Infrastructure'],         note: 'Enrichment: "Infrastructure/Inspection UK DSP"' },
  { displayName: 'Terra Drone Arabia',              industries: ['Oil & Gas / Industrial Assets'],         note: 'Enrichment: "Oil & Gas/Infra, Terra Drone subsidiary"' },
  { displayName: 'Unnamed Client Solar PV Facility',industries: ['Energy & Utilities'],                    note: 'Name says "Solar PV Facility"' },
];

// ── Missing companies to insert ───────────────────────────────────────────────
// These appear in the hitlist (Tab 2) but were never backfilled into discovered_companies.

const INSERTS = [
  {
    display_name: 'BlackSea Technologies',
    countries: ['US'],
    industries: ['Perimeter Security & Smart Facilities'],
    note: 'Enrichment CSV: Annapolis, Maryland, USA; Defense/Maritime autonomy',
  },
  {
    display_name: 'NPAS',
    countries: ['UK'],
    industries: ['Public Safety & Emergency Response'],
    note: 'National Police Air Service, UK; Enrichment CSV: Wakefield, UK',
  },
  {
    display_name: 'Drone Force',
    countries: ['US'],
    industries: ['Public Safety & Emergency Response'],
    note: 'Enrichment notes: Americas HQ, Public Safety',
  },
  {
    display_name: 'Heliboss Chile',
    countries: ['Chile'],
    industries: ['Construction & Infrastructure'],
    note: 'DJI Enterprise ASC for Chile/LATAM; Enrichment CSV: Santiago, Chile',
  },
  {
    display_name: 'Heliboss México',
    countries: ['Mexico'],
    industries: ['Construction & Infrastructure'],
    note: 'México entity of Heliboss group',
  },
  {
    display_name: 'Importadora Lillo SpA',
    countries: ['Chile'],
    industries: ['Construction & Infrastructure'],
    note: 'Same entity as Heliboss Chile; Santiago, Chile',
  },
  {
    display_name: 'Anji County',
    countries: ['China'],
    industries: ['Agriculture & Forestry'],
    note: 'Anji County, Zhejiang — bamboo/tea agriculture region; EXPANSION signal',
  },
  {
    display_name: 'Austintown Fire Department',
    countries: ['US'],
    industries: ['Public Safety & Emergency Response'],
    note: 'Fire department, Austintown, Ohio, USA',
  },
  {
    display_name: 'Dexa',
    countries: ['US'],
    industries: ['Ports, Maritime & Logistics Hubs'],
    note: 'Drone delivery (Grubhub), Dayton, Ohio; last-mile logistics',
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(DRY_RUN
  ? '\n[DRY RUN] No changes will be written.\n'
  : '\n[LIVE] Applying changes to discovered_companies.\n'
);

// Fetch all current rows
const { data: allRows, error: fetchErr } = await db
  .from('discovered_companies')
  .select('normalized_name, display_name, countries, industries');

if (fetchErr) {
  console.error('Failed to fetch rows:', fetchErr.message);
  process.exit(1);
}

const rowMap = new Map(allRows.map(r => [r.normalized_name, r]));
const displayMap = new Map(allRows.map(r => [r.display_name.toLowerCase(), r]));

const now = new Date().toISOString();
let p0Updated = 0, p1Updated = 0, p2Updated = 0, p3Inserted = 0;
let skipped = 0;

// ── Phase 0: Clean corrupted arrays on ALL rows ───────────────────────────────

console.log('─── Phase 0: Clean corrupted arrays ───────────────────────────────────────\n');

for (const row of allRows) {
  const cleanCountries = clean(row.countries, VALID_COUNTRIES);
  const cleanIndustries = clean(row.industries, VALID_INDUSTRIES);

  const countriesChanged = !arraysEqual(cleanCountries, row.countries ?? []) &&
    (row.countries?.length ?? 0) > cleanCountries.length; // only if we're removing artifacts
  const industriesChanged = !arraysEqual(cleanIndustries, row.industries ?? []) &&
    (row.industries?.length ?? 0) > cleanIndustries.length;

  if (!countriesChanged && !industriesChanged) continue;

  const changes = [];
  if (countriesChanged) changes.push(`countries: [${fmt(row.countries)}] → [${fmt(cleanCountries)}]`);
  if (industriesChanged) changes.push(`industries: [${fmt(row.industries)}] → [${fmt(cleanIndustries)}]`);

  console.log(`  → "${row.display_name}"`);
  for (const c of changes) console.log(`     ${c}`);

  if (!DRY_RUN) {
    const updates = { updated_at: now };
    if (countriesChanged)  updates.countries  = cleanCountries;
    if (industriesChanged) updates.industries = cleanIndustries;

    const { error } = await db
      .from('discovered_companies')
      .update(updates)
      .eq('normalized_name', row.normalized_name);

    if (error) {
      console.error(`     ✗ FAILED: ${error.message}`);
    } else {
      // Update in-memory map so phases 1+2 see clean values
      row.countries  = cleanCountries;
      row.industries = cleanIndustries;
      console.log('     ✓ cleaned');
      p0Updated++;
    }
  } else {
    // Simulate clean for subsequent phases
    row.countries  = cleanCountries;
    row.industries = cleanIndustries;
    p0Updated++;
  }
}

if (p0Updated === 0) console.log('  (no corrupted arrays found)\n');
else console.log(`\n  → ${p0Updated} rows cleaned\n`);

// ── Phase 1: Country patches ──────────────────────────────────────────────────

console.log('─── Phase 1: Country patches ───────────────────────────────────────────────\n');

for (const patch of COUNTRY_PATCHES) {
  const row = displayMap.get(patch.displayName.toLowerCase());

  if (!row) {
    console.log(`  ⚪ NOT FOUND  "${patch.displayName}"`);
    continue;
  }

  const currentCountries = row.countries ?? [];
  const isEmpty = currentCountries.length === 0;
  const shouldUpdate = patch.force || isEmpty;

  if (!shouldUpdate) {
    console.log(`  ↷  SKIP      "${row.display_name}" — countries already set: [${fmt(currentCountries)}]`);
    skipped++;
    continue;
  }

  if (arraysEqual(currentCountries, patch.countries)) {
    console.log(`  ↷  SKIP      "${row.display_name}" — already correct`);
    skipped++;
    continue;
  }

  console.log(`  → "${row.display_name}"`);
  console.log(`     countries: [${fmt(currentCountries)}] → [${fmt(patch.countries)}]`);
  console.log(`     note: ${patch.note}`);

  if (!DRY_RUN) {
    const { error } = await db
      .from('discovered_companies')
      .update({ countries: patch.countries, updated_at: now, enriched_at: now, enriched_by: 'manual' })
      .eq('normalized_name', row.normalized_name);

    if (error) {
      console.error(`     ✗ FAILED: ${error.message}`);
    } else {
      row.countries = patch.countries;
      console.log('     ✓ updated');
      p1Updated++;
    }
  } else {
    row.countries = patch.countries;
    console.log('     [dry-run] would update');
    p1Updated++;
  }
}
console.log('');

// ── Phase 2: Industry patches ─────────────────────────────────────────────────

console.log('─── Phase 2: Industry patches ──────────────────────────────────────────────\n');

for (const patch of INDUSTRY_PATCHES) {
  const row = displayMap.get(patch.displayName.toLowerCase());

  if (!row) {
    console.log(`  ⚪ NOT FOUND  "${patch.displayName}"`);
    continue;
  }

  const currentIndustries = row.industries ?? [];
  if (currentIndustries.length > 0 && arraysEqual(currentIndustries, patch.industries)) {
    console.log(`  ↷  SKIP      "${row.display_name}" — already correct`);
    skipped++;
    continue;
  }

  // Only overwrite if blank (don't clobber existing valid industry data)
  if (currentIndustries.length > 0 && !patch.force) {
    console.log(`  ↷  SKIP      "${row.display_name}" — industries already set: [${fmt(currentIndustries)}]`);
    skipped++;
    continue;
  }

  console.log(`  → "${row.display_name}"`);
  console.log(`     industries: [${fmt(currentIndustries)}] → [${fmt(patch.industries)}]`);
  console.log(`     note: ${patch.note}`);

  if (!DRY_RUN) {
    const { error } = await db
      .from('discovered_companies')
      .update({ industries: patch.industries, updated_at: now, enriched_at: now, enriched_by: 'manual' })
      .eq('normalized_name', row.normalized_name);

    if (error) {
      console.error(`     ✗ FAILED: ${error.message}`);
    } else {
      row.industries = patch.industries;
      console.log('     ✓ updated');
      p2Updated++;
    }
  } else {
    row.industries = patch.industries;
    console.log('     [dry-run] would update');
    p2Updated++;
  }
}
console.log('');

// ── Phase 3: Insert missing companies ────────────────────────────────────────

console.log('─── Phase 3: Insert missing companies ──────────────────────────────────────\n');

for (const stub of INSERTS) {
  const norm = normalizeCompanyName(stub.display_name);
  if (rowMap.has(norm)) {
    console.log(`  ↷  EXISTS    "${stub.display_name}" (norm: ${norm}) — skipping insert`);
    skipped++;
    continue;
  }

  console.log(`  + INSERT   "${stub.display_name}"`);
  console.log(`     countries: [${fmt(stub.countries)}]`);
  console.log(`     industries: [${fmt(stub.industries)}]`);
  console.log(`     note: ${stub.note}`);

  if (!DRY_RUN) {
    const { error } = await db
      .from('discovered_companies')
      .insert({
        normalized_name: norm,
        display_name: stub.display_name,
        types: [],
        countries: stub.countries,
        industries: stub.industries,
        signal_types: [],
        mention_count: 0,
        first_seen_at: now,
        last_seen_at: now,
        enriched_at: now,
        enriched_by: 'manual',
        created_at: now,
        updated_at: now,
      });

    if (error) {
      console.error(`     ✗ FAILED: ${error.message}`);
    } else {
      console.log('     ✓ inserted');
      p3Inserted++;
    }
  } else {
    console.log('     [dry-run] would insert');
    p3Inserted++;
  }
}
console.log('');

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log(DRY_RUN ? 'DRY RUN SUMMARY (no changes written):' : 'DONE:');
console.log(`  Phase 0 — Corrupted arrays cleaned : ${p0Updated}`);
console.log(`  Phase 1 — Country patches applied  : ${p1Updated}`);
console.log(`  Phase 2 — Industry patches applied : ${p2Updated}`);
console.log(`  Phase 3 — Missing companies inserted: ${p3Inserted}`);
console.log(`  Skipped (already correct)          : ${skipped}`);
