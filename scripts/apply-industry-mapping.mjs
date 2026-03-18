/**
 * One-time script: apply the reviewed & confirmed industry mapping to scored_articles.
 * Mappings were manually reviewed from the reclassify dry-run output (2026-03-18).
 * No LLM calls — fully deterministic.
 *
 * Usage:
 *   node scripts/apply-industry-mapping.mjs --dry-run
 *   node scripts/apply-industry-mapping.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(line => line.includes('=') && !line.startsWith('#') && !line.startsWith('##'))
    .map(line => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim().replace(/^"|"$/g, '')];
    })
);

const DRY_RUN = process.argv.includes('--dry-run');
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const MAPPING = [
  { id: 'scored_article_1773764127831_2_1773764216340',  industry: 'Other: Regulatory & Policy' },
  { id: 'scored_article_1773764127831_0_1773764216340',  industry: 'Other: Regulatory & Policy' },
  { id: 'scored_article_1773764127831_1_1773764216340',  industry: 'Other: Regulatory & Policy' },
  { id: 'scored_article_1773764127831_27_1773764312143', industry: 'Other: Regulatory & Policy' },
  { id: 'scored_article_1773764127831_37_1773764354555', industry: 'Other: Regulatory & Policy' },
  { id: 'scored_article_1773765627386_15_1773765760942', industry: 'Other: Regulatory & Policy' },
  { id: 'scored_article_1773765627386_33_1773765822776', industry: 'Other: Regulatory & Policy' },
  { id: 'scored_article_1773767630449_2_1773767963185',  industry: 'Other: Regulatory & Policy' },
  { id: 'scored_article_1773767630449_23_1773768055257', industry: 'Other: Regulatory & Policy' },
  { id: 'scored_article_1773764127831_24_1773764312143', industry: 'Defense & Security' },
  { id: 'scored_article_1773764127831_33_1773764354555', industry: 'Defense & Security' },
  { id: 'scored_article_1773764127831_35_1773764354555', industry: 'Defense & Security' },
  { id: 'scored_article_1773764127831_38_1773764354555', industry: 'Defense & Security' },
  { id: 'scored_article_1773764127831_31_1773764354555', industry: 'Defense & Security' },
  { id: 'scored_article_1773765627386_4_1773765716465',  industry: 'Defense & Security' },
  { id: 'scored_article_1773767630449_15_1773767999369', industry: 'Logistics & Delivery' },
  { id: 'scored_article_1773766244736_12_1773766516274', industry: 'Logistics & Delivery' },
  { id: 'scored_article_1773765627386_23_1773765807139', industry: 'Other: Drone Technology' },
  { id: 'scored_article_1773767630449_18_1773767999369', industry: 'Other: Drone Technology' },
  { id: 'scored_article_1773767630449_27_1773768055257', industry: 'Other: Drone Technology' },
  { id: 'scored_article_1773765627386_6_1773765716465',  industry: 'Other: Drone Technology' },
  { id: 'scored_article_1773765627386_27_1773765807139', industry: 'Other: Research & Development' },
  { id: 'scored_article_1773765627386_0_1773765716465',  industry: 'Other: Drone Distribution' },
  { id: 'scored_article_1773764127831_7_1773764216340',  industry: 'Other: Market Analysis' },
  { id: 'scored_article_1773766244736_13_1773766516274', industry: 'Other: Industry News' },
  { id: 'scored_article_1773766244736_19_1773766516274', industry: 'Other: Automotive' },
  { id: 'scored_article_1773769043059_9_1773769088150',  industry: 'Other: Automotive' },
  { id: 'scored_article_1773767630449_4_1773767963185',  industry: 'Other: Training & Certification' },
  { id: 'scored_article_1773764127831_13_1773764260017', industry: 'Other: Municipal Asset Management' },
  { id: 'scored_article_1773764127831_19_1773764260017', industry: 'Other: Law Enforcement' },
  { id: 'scored_article_1773764127831_29_1773764312143', industry: 'Other: Consumer Electronics' },
  { id: 'scored_article_1773766244736_25_1773766563632', industry: 'Other: Sustainability' },
];

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}\n`);
  console.log(`Applying ${MAPPING.length} confirmed mappings...\n`);

  const ids = MAPPING.map(m => m.id);
  const { data: current, error } = await db
    .from('scored_articles')
    .select('id, industry')
    .in('id', ids);

  if (error) { console.error('Fetch failed:', error.message); process.exit(1); }

  const currentMap = new Map((current ?? []).map(r => [r.id, r.industry]));
  const stats = { applied: 0, skipped_same: 0, not_found: 0 };

  for (const { id, industry: newIndustry } of MAPPING) {
    const existing = currentMap.get(id);

    if (existing === undefined) {
      console.log(`  [NOT FOUND] ${id.slice(-40)}\n`);
      stats.not_found++;
      continue;
    }

    if (existing === newIndustry) {
      console.log(`  [SAME] ${id.slice(-40)} — ${newIndustry}`);
      stats.skipped_same++;
      continue;
    }

    console.log(`  [${DRY_RUN ? 'DRY RUN' : 'OK'}] ${id.slice(-40)}`);
    console.log(`    Old : ${existing}`);
    console.log(`    New : ${newIndustry}\n`);

    if (!DRY_RUN) {
      const { error: updateErr } = await db
        .from('scored_articles')
        .update({ industry: newIndustry })
        .eq('id', id);
      if (updateErr) console.log(`    [DB ERROR] ${updateErr.message}`);
      else stats.applied++;
    } else {
      stats.applied++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`SUMMARY - ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('-'.repeat(60));
  console.log(`  Applied   : ${stats.applied}`);
  console.log(`  Same val  : ${stats.skipped_same}  (already correct)`);
  console.log(`  Not found : ${stats.not_found}  (ID missing from DB)`);
  if (DRY_RUN) console.log('\nRun without --dry-run to apply changes.');
}

main().catch(err => { console.error(err); process.exit(1); });
