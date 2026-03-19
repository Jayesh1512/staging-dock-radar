#!/usr/bin/env node
/**
 * Quick database analysis script.
 * Run: node scripts/analyze-db.mjs
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function analyze() {
  console.log('\n📊 DATABASE ANALYSIS\n');

  try {
    // ── Total & Qualified Articles ──
    const { data: allStats } = await db.from('scored_articles')
      .select('relevance_score, company, entities, industry, country, signal_type', { count: 'exact' });

    const all = allStats || [];
    const qualified = all.filter(a => a.relevance_score >= 50 && a.company);

    console.log(`📈 Volume:`);
    console.log(`   Total articles: ${all.length}`);
    console.log(`   Score >= 50 with company: ${qualified.length}`);
    console.log();

    // ── Industry Coverage ──
    const withIndustry = all.filter(a => a.industry);
    console.log(`🏭 Industry Coverage:`);
    console.log(`   With industry data: ${withIndustry.length}/${all.length} (${Math.round(withIndustry.length / all.length * 100)}%)`);

    const industryBreakdown = {};
    withIndustry.forEach(a => {
      industryBreakdown[a.industry] = (industryBreakdown[a.industry] || 0) + 1;
    });
    console.log(`   Breakdown:`, Object.entries(industryBreakdown)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ind, count]) => `${ind} (${count})`)
      .join(', '));
    console.log();

    // ── Company Field Coverage ──
    const withCompany = all.filter(a => a.company);
    console.log(`🏢 Company Field Coverage:`);
    console.log(`   With company value: ${withCompany.length}/${all.length} (${Math.round(withCompany.length / all.length * 100)}%)`);
    console.log(`   Sample companies (first 10 unique):`, [...new Set(all.filter(a => a.company).map(a => a.company))].slice(0, 10));
    console.log();

    // ── Entities Analysis ──
    const entityTypeCount = {};
    const withEntities = all.filter(a => Array.isArray(a.entities) && a.entities.length > 0);

    all.forEach(a => {
      if (Array.isArray(a.entities)) {
        a.entities.forEach(e => {
          const type = e.type || 'unknown';
          entityTypeCount[type] = (entityTypeCount[type] || 0) + 1;
        });
      }
    });

    console.log(`🏷️  Entity Types Distribution:`);
    console.log(`   Articles with 1+ entities: ${withEntities.length}/${all.length}`);
    console.log(`   Type breakdown:`, Object.entries(entityTypeCount)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `${type} (${count})`)
      .join(', '));
    console.log();

    // ── Qualified (score>=50) Deep Dive ──
    const qualifiedEntities = {};
    qualified.forEach(a => {
      if (Array.isArray(a.entities)) {
        a.entities.forEach(e => {
          const type = e.type || 'unknown';
          qualifiedEntities[type] = (qualifiedEntities[type] || 0) + 1;
        });
      }
    });

    console.log(`✅ For Qualified Articles (score >= 50):`);
    console.log(`   Total qualified: ${qualified.length}`);
    console.log(`   With entities: ${qualified.filter(a => Array.isArray(a.entities) && a.entities.length > 0).length}`);
    console.log(`   Entity type breakdown:`, Object.entries(qualifiedEntities)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `${type} (${count})`)
      .join(', ') || 'None');
    console.log();

    // ── Regional Distribution ──
    const countryCount = {};
    qualified.forEach(a => {
      if (a.country) {
        countryCount[a.country] = (countryCount[a.country] || 0) + 1;
      }
    });

    console.log(`🌍 Regional Distribution (qualified only):`);
    console.log(`   Countries: ${Object.keys(countryCount).length}`);
    console.log(`   Top 5:`, Object.entries(countryCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([c, n]) => `${c} (${n})`)
      .join(', '));
    console.log();

    // ── Signal Types ──
    const signalCount = {};
    qualified.forEach(a => {
      const sig = a.signal_type || 'OTHER';
      signalCount[sig] = (signalCount[sig] || 0) + 1;
    });

    console.log(`📡 Signal Types (qualified only):`);
    console.log(`   Distribution:`, Object.entries(signalCount)
      .sort((a, b) => b[1] - a[1])
      .map(([sig, count]) => `${sig} (${count})`)
      .join(', '));
    console.log();

    // ── Check for dsp_companies field ──
    const { data: checkDsp } = await db.from('scored_articles').select('dsp_companies', { head: true });
    console.log(`⚠️  dsp_companies field exists?`, checkDsp !== null ? '✅ YES' : '❌ NO');
    console.log();

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

analyze();
