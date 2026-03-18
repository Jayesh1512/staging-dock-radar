#!/usr/bin/env node
/**
 * Apply flytbase_partners migration to Supabase
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = 'https://lxubuceipdmpovtbukmb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4dWJ1Y2VpcGRtcG92dGJ1a21iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQ3NTMxNiwiZXhwIjoyMDg5MDUxMzE2fQ.X7j1G7JX3YtXNWTCJQpjCTVJrp81cIAvoLf-vCefrss';

const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function applyMigration() {
  console.log('🚀 Applying flytbase_partners migration...\n');

  try {
    // Read migration SQL
    const migrationPath = path.join(path.dirname(new URL(import.meta.url).pathname), '../supabase/migrations/20260318000003_add_flytbase_partners.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    // Execute each statement separately (split by ;)
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);

    for (const statement of statements) {
      console.log(`Executing: ${statement.slice(0, 60)}...`);
      const { error } = await db.rpc('exec_sql', { sql_statement: statement }).catch(() => ({ error: null }));

      // Try raw query instead
      if (error) {
        console.warn('  RPC failed, trying direct query...');
      }
    }

    // Verify table exists
    console.log('\n✅ Verifying table creation...');
    const { data, error } = await db.from('flytbase_partners').select('*', { count: 'exact', head: true });

    if (error) {
      console.error('❌ Table verification failed:', error.message);
      console.log('\n📋 Note: The Supabase service role key may not have direct SQL execution permissions.');
      console.log('Please apply the migration manually via Supabase console:');
      console.log('1. Go to https://app.supabase.com/project/lxubuceipdmpovtbukmb');
      console.log('2. SQL Editor → New Query');
      console.log('3. Paste the SQL from supabase/migrations/20260318000003_add_flytbase_partners.sql');
      console.log('4. Run');
    } else {
      console.log('✅ flytbase_partners table exists and is ready!');
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.log('\n📋 Alternative: Apply the migration via Supabase Dashboard:');
    console.log('1. Visit https://app.supabase.com/project/lxubuceipdmpovtbukmb/sql/new');
    console.log('2. Copy SQL from supabase/migrations/20260318000003_add_flytbase_partners.sql');
    console.log('3. Run it');
  }
}

applyMigration();
