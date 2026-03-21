#!/usr/bin/env node
/**
 * Seed dji_resellers table from cleaned JSON data.
 * Prerequisites: Run the CREATE TABLE migration first via Supabase SQL Editor.
 * Usage: node scripts/seed-dji-resellers.mjs
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.SUPABASE_URL || 'https://lxubuceipdmpovtbukmb.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4dWJ1Y2VpcGRtcG92dGJ1a21iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQ3NTMxNiwiZXhwIjoyMDg5MDUxMzE2fQ.X7j1G7JX3YtXNWTCJQpjCTVJrp81cIAvoLf-vCefrss';

const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function seed() {
  console.log('Loading cleaned DJI reseller data...');
  const dataPath = path.join(decodeURIComponent(path.dirname(new URL(import.meta.url).pathname)), '../data/dji-resellers-cleaned.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`Found ${data.length} records to seed.\n`);

  // Check if table already has data
  const { count } = await db.from('dji_resellers').select('id', { count: 'exact', head: true });
  if (count && count > 0) {
    console.log(`Table already has ${count} rows. Skipping seed to avoid duplicates.`);
    console.log('To re-seed, truncate the table first via SQL Editor: TRUNCATE dji_resellers RESTART IDENTITY;');
    return;
  }

  // Insert in batches of 200
  const batchSize = 200;
  let inserted = 0;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize).map(v => ({
      name: v.name,
      dealer_type: v.dealer_type,
      priority: v.priority,
      address: v.address,
      city: v.city,
      state: v.state,
      country: v.country,
      country_code: v.country_code,
      continent: v.continent,
      phone: v.phone,
      email: v.email,
      website: v.website,
      latitude: v.latitude,
      longitude: v.longitude,
    }));

    const { error } = await db.from('dji_resellers').insert(batch);
    if (error) {
      console.error(`Error inserting batch at row ${i}:`, error.message);
      if (error.message.includes('does not exist')) {
        console.error('\nTable does not exist. Apply the migration first:');
        console.error('  1. Open Supabase SQL Editor');
        console.error('  2. Paste contents of supabase/migrations/20260321000001_create_dji_resellers.sql');
        console.error('  3. Run, then re-run this script');
        return;
      }
      continue;
    }
    inserted += batch.length;
    if (inserted % 1000 === 0 || inserted === data.length) {
      console.log(`  Inserted ${inserted} / ${data.length}`);
    }
  }

  // Verify
  const { count: finalCount } = await db.from('dji_resellers').select('id', { count: 'exact', head: true });
  console.log(`\nDone! Total rows in dji_resellers: ${finalCount}`);

  // Priority breakdown
  for (const p of ['high', 'medium', 'low']) {
    const { count: c } = await db.from('dji_resellers').select('id', { count: 'exact', head: true }).eq('priority', p);
    console.log(`  ${p}: ${c}`);
  }
}

seed().catch(console.error);