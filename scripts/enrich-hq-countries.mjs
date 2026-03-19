#!/usr/bin/env node
/**
 * Enrich discovered_companies.countries from HQ location in the enrichment CSV.
 *
 * For rows in the enrichment CSV where the Region column is blank (—) but the
 * "HQ / Office Location" column has a usable city/country string, this script
 * derives the canonical country name and upserts it into discovered_companies.countries.
 *
 * Rules:
 *  - Only touches rows where Region = "—" or empty
 *  - Extracts the last comma-separated token of the HQ field as the country
 *  - If a discovered_companies row already has countries set, it is left unchanged
 *  - If no row exists yet, a minimal stub row is inserted (countries = [derived])
 *
 * Usage:
 *   node scripts/enrich-hq-countries.mjs
 *   node scripts/enrich-hq-countries.mjs --dry-run
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

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Map of HQ last-token (lowercase) → canonical country name */
const HQ_COUNTRY_MAP = {
  'usa': 'USA', 'u.s.a.': 'USA', 'u.s.': 'USA',
  'uk': 'UK', 'england': 'UK', 'wales': 'UK', 'scotland': 'UK', 'northern ireland': 'UK',
  'uae': 'UAE', 'united arab emirates': 'UAE',
  'india': 'India',
  'australia': 'Australia',
  'canada': 'Canada',
  'germany': 'Germany',
  'france': 'France',
  'ireland': 'Ireland',
  'spain': 'Spain',
  'chile': 'Chile',
  'malaysia': 'Malaysia',
  'south africa': 'South Africa',
  'saudi arabia': 'Saudi Arabia',
  'china': 'China',
  'singapore': 'Singapore',
  'japan': 'Japan',
  'brazil': 'Brazil',
  'mexico': 'Mexico',
  'italy': 'Italy',
  'south korea': 'South Korea',
};

function extractCountryFromHq(hq) {
  if (!hq || hq.trim() === '' || hq.trim() === '—' || hq.trim() === '-') return null;
  const parts = hq.split(',').map(p => p.trim()).filter(p => p && p !== '—');
  if (parts.length === 0) return null;
  const lastPart = parts[parts.length - 1].toLowerCase();
  return HQ_COUNTRY_MAP[lastPart] ?? null;
}

/** Minimal company name normalizer — mirrors src/lib/company-normalize.ts */
function normalizeCompanyName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(inc|ltd|llc|gmbh|corp|co|company|limited|incorporated|plc|ag|bv|srl|sas|sa|nv|fzco|fze|pvt|private|public|international)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse one CSV line respecting double-quoted fields with embedded commas */
function parseCSVLine(line) {
  const fields = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      fields.push(field);
      field = '';
    } else {
      field += c;
    }
  }
  fields.push(field);
  return fields;
}

// ── Parse CSV ────────────────────────────────────────────────────────────────

const CSV_PATH = resolve(__dirname, '../docs/Data enrichment files/19Mar-1212-New Partner enrichment.csv');
const csv = readFileSync(CSV_PATH, 'utf8');
const lines = csv.split('\n').map(l => l.trim()).filter(Boolean);

// Header: #,Priority Tier,Company,Score,Region,Industry,Website,HQ / Office Location,...
// Index:   0  1             2       3     4       5         6       7
const dataLines = lines.slice(1);

const enrichments = [];
for (const line of dataLines) {
  const fields = parseCSVLine(line);
  if (fields.length < 8) continue;

  const company = fields[2]?.trim();
  const region  = fields[4]?.trim();
  const hq      = fields[7]?.trim();

  // Only process rows where Region is blank or "—"
  if (!company || company === '' || company === '—') continue;
  if (region && region !== '—' && region !== '' && region !== '-') continue;

  const country = extractCountryFromHq(hq);
  if (!country) {
    console.log(`  ⚠  ${company}: region blank but HQ "${hq}" not parseable — skipping`);
    continue;
  }

  const norm = normalizeCompanyName(company);
  if (!norm) continue;

  enrichments.push({ company, norm, country });
}

if (enrichments.length === 0) {
  console.log('No blank-region rows with parseable HQ found — nothing to do.');
  process.exit(0);
}

console.log(`\nFound ${enrichments.length} companies with blank region + parseable HQ:\n`);
for (const e of enrichments) {
  console.log(`  ${e.company} → ${e.country} (norm: ${e.norm})`);
}

if (DRY_RUN) {
  console.log('\n[dry-run] No changes written.');
  process.exit(0);
}

// ── Fetch existing rows ───────────────────────────────────────────────────────

const norms = enrichments.map(e => e.norm);
const { data: existingRows, error: fetchError } = await db
  .from('discovered_companies')
  .select('normalized_name, countries')
  .in('normalized_name', norms);

if (fetchError) {
  console.error('Failed to fetch existing rows:', fetchError.message);
  process.exit(1);
}

const existingMap = new Map((existingRows ?? []).map(r => [r.normalized_name, r.countries ?? []]));

// ── Apply updates ─────────────────────────────────────────────────────────────

const now = new Date().toISOString();
let updated = 0;
let inserted = 0;
let skipped = 0;

for (const { company, norm, country } of enrichments) {
  if (existingMap.has(norm)) {
    const existingCountries = existingMap.get(norm);
    if (existingCountries && existingCountries.length > 0) {
      console.log(`  → ${company}: already has countries [${existingCountries.join(', ')}] — skipping`);
      skipped++;
      continue;
    }
    // Row exists but countries is empty — update
    const { error } = await db
      .from('discovered_companies')
      .update({
        countries: [country],
        enriched_at: now,
        enriched_by: 'manual',
        updated_at: now,
      })
      .eq('normalized_name', norm);

    if (error) {
      console.error(`  ✗ ${company}: update failed — ${error.message}`);
    } else {
      console.log(`  ✓ ${company}: set countries = [${country}]`);
      updated++;
    }
  } else {
    // Row doesn't exist yet — insert a stub so the hitlist fallback works
    const { error } = await db
      .from('discovered_companies')
      .insert({
        normalized_name: norm,
        display_name: company,
        types: [],
        countries: [country],
        industries: [],
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
      console.error(`  ✗ ${company}: insert failed — ${error.message}`);
    } else {
      console.log(`  ✓ ${company}: inserted stub with countries = [${country}]`);
      inserted++;
    }
  }
}

console.log(`\nDone. ${updated} updated, ${inserted} inserted, ${skipped} skipped (already had countries).`);
