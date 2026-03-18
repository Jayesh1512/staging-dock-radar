#!/usr/bin/env node
/**
 * Deep dive: Is the company field duplicate/redundant?
 * Compare company field against entities values
 */

import { createClient } from '@supabase/supabase-js';

const db = createClient(
  'https://lxubuceipdmpovtbukmb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4dWJ1Y2VpcGRtcG92dGJ1a21iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQ3NTMxNiwiZXhwIjoyMDg5MDUxMzE2fQ.X7j1G7JX3YtXNWTCJQpjCTVJrp81cIAvoLf-vCefrss',
  { auth: { persistSession: false } }
);

async function analyze() {
  console.log('\n🔍 COMPANY FIELD ANALYSIS\n');

  const { data } = await db.from('scored_articles')
    .select('id, company, entities, signal_type, relevance_score')
    .gte('relevance_score', 50)
    .limit(100);

  const articles = data || [];

  let duplicateCount = 0;
  let companyOnlyCount = 0;
  let entitiesOnlyCount = 0;
  let bothButDifferent = 0;

  const samples = {
    duplicate: [],
    companyOnly: [],
    entitiesOnly: [],
    bothDifferent: [],
  };

  articles.forEach(article => {
    const company = article.company?.toLowerCase().trim() || '';
    const hasCompany = !!company;

    const entities = article.entities || [];
    const hasEntities = entities.length > 0;
    const entityNames = entities.map(e => e.name?.toLowerCase().trim()).filter(Boolean);

    if (!hasCompany && !hasEntities) {
      // Neither - skip
      return;
    }

    if (hasCompany && hasEntities) {
      // Both present - check if company appears in entities
      const companyInEntities = entityNames.some(en =>
        en === company ||
        company.includes(en) ||
        en.includes(company)
      );

      if (companyInEntities) {
        duplicateCount++;
        if (samples.duplicate.length < 3) {
          samples.duplicate.push({
            company,
            entities: entities.map(e => `${e.name} (${e.type})`),
          });
        }
      } else {
        bothButDifferent++;
        if (samples.bothDifferent.length < 3) {
          samples.bothDifferent.push({
            company,
            entities: entities.map(e => `${e.name} (${e.type})`),
          });
        }
      }
    } else if (hasCompany && !hasEntities) {
      companyOnlyCount++;
      if (samples.companyOnly.length < 3) {
        samples.companyOnly.push({ company });
      }
    } else if (hasEntities && !hasCompany) {
      entitiesOnlyCount++;
      if (samples.entitiesOnly.length < 3) {
        samples.entitiesOnly.push({
          entities: entities.map(e => `${e.name} (${e.type})`),
        });
      }
    }
  });

  const total = duplicateCount + companyOnlyCount + entitiesOnlyCount + bothButDifferent;
  console.log(`📊 Analysis of ${total} qualified articles:\n`);

  console.log(`1️⃣  DUPLICATE (company also appears in entities):`);
  console.log(`   Count: ${duplicateCount}/${total} (${Math.round(duplicateCount/total*100)}%)`);
  console.log(`   Sample:`, samples.duplicate[0]);
  console.log();

  console.log(`2️⃣  BOTH PRESENT BUT DIFFERENT:`);
  console.log(`   Count: ${bothButDifferent}/${total} (${Math.round(bothButDifferent/total*100)}%)`);
  console.log(`   Sample:`, samples.bothDifferent[0]);
  console.log();

  console.log(`3️⃣  COMPANY ONLY (no entities):`);
  console.log(`   Count: ${companyOnlyCount}/${total} (${Math.round(companyOnlyCount/total*100)}%)`);
  console.log(`   Sample:`, samples.companyOnly[0]);
  console.log();

  console.log(`4️⃣  ENTITIES ONLY (no company):`);
  console.log(`   Count: ${entitiesOnlyCount}/${total} (${Math.round(entitiesOnlyCount/total*100)}%)`);
  console.log(`   Sample:`, samples.entitiesOnly[0]);
  console.log();

  // ── Deep Analysis: Where does company field come from? ──
  const { data: allArticles } = await db.from('scored_articles')
    .select('company, entities')
    .limit(424);

  const allArts = allArticles || [];
  const allWithCompany = allArts.filter(a => a.company);
  const allWithEntities = allArts.filter(a => a.entities?.length > 0);

  let allDuplicate = 0;
  allArts.forEach(article => {
    const company = article.company?.toLowerCase().trim() || '';
    const entities = article.entities || [];
    const entityNames = entities.map(e => e.name?.toLowerCase().trim()).filter(Boolean);

    if (company && entityNames.length > 0) {
      const inEntities = entityNames.some(en => en === company || company.includes(en) || en.includes(company));
      if (inEntities) allDuplicate++;
    }
  });

  console.log(`🔬 FULL DATASET (all 424 articles):\n`);
  console.log(`   Articles with company field: ${allWithCompany.length} (${Math.round(allWithCompany.length/424*100)}%)`);
  console.log(`   Articles with entities: ${allWithEntities.length} (${Math.round(allWithEntities.length/424*100)}%)`);
  console.log(`   Company values that DUPLICATE entities: ${allDuplicate}/${allWithCompany.length} (${Math.round(allDuplicate/allWithCompany.length*100)}%)`);
  console.log();

  console.log(`💡 EXPERT PANEL VERDICT:\n`);
  const duplicatePercentage = Math.round(duplicateCount/total*100);
  if (duplicatePercentage > 70) {
    console.log(`   ❌ COMPANY FIELD IS MOSTLY DUPLICATE/NOISE`);
    console.log(`   ${duplicatePercentage}% of qualified articles have company that also appears in entities.`);
    console.log(`   Recommendation: CUT this field, rely on entities instead.`);
  } else if (duplicatePercentage > 50) {
    console.log(`   ⚠️  COMPANY FIELD HAS MIXED VALUE`);
    console.log(`   ${duplicatePercentage}% are duplicates, but ${bothButDifferent} articles have unique company values.`);
    console.log(`   Recommendation: KEEP as fallback, but mark as derived/temp.`);
  } else {
    console.log(`   ✅ COMPANY FIELD HAS UNIQUE VALUE`);
    console.log(`   Only ${duplicatePercentage}% are duplicates. Most have unique data.`);
    console.log(`   Recommendation: KEEP, but understand its role.`);
  }
}

analyze().catch(console.error);
