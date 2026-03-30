import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const vars = {};
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=["']?(.+?)["']?\s*$/);
  if (m) vars[m[1]] = m[2];
}
const db = createClient(vars.SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY);

const dryRun = process.argv.includes('--dry-run');
console.log(dryRun ? '=== DRY RUN (no changes) ===' : '=== EXECUTING CLEANUP ===');

// Step 1: Find junk scored_articles (score >= 25, no DJI Dock in title or summary)
const { data: scored } = await db.from('scored_articles')
  .select('id, article_id, relevance_score, company, summary, drop_reason, is_duplicate')
  .gte('relevance_score', 25)
  .is('drop_reason', null)
  .eq('is_duplicate', false);

// Get article titles
const artIds = (scored || []).map(s => s.article_id);
const artMap = new Map();
for (let i = 0; i < artIds.length; i += 200) {
  const batch = artIds.slice(i, i + 200);
  const { data } = await db.from('articles').select('id, title').in('id', batch);
  if (data) data.forEach(a => artMap.set(a.id, a));
}

const dockKws = ['dji dock', 'dock 2', 'dock 3', 'drone-in-a-box'];
const hasDock = (text) => dockKws.some(kw => (text || '').toLowerCase().includes(kw));

const junkScored = (scored || []).filter(s => {
  const title = artMap.get(s.article_id)?.title || '';
  return !hasDock(title) && !hasDock(s.summary);
});

const junkArticleIds = junkScored.map(s => s.article_id);
console.log(`\nStep 1: Junk scored_articles (25+, no DJI Dock): ${junkScored.length}`);
console.log(`  Article IDs to delete: ${junkArticleIds.length}`);

// Step 2: Also find ALL scored_articles with score 0-24 (noise, never surfaces)
const { data: noiseScored } = await db.from('scored_articles')
  .select('article_id')
  .lt('relevance_score', 25);
const noiseArticleIds = (noiseScored || []).map(s => s.article_id);
console.log(`\nStep 2: Noise scored_articles (score < 25): ${noiseArticleIds.length}`);

// Combine all article IDs to delete
const allDeleteIds = [...new Set([...junkArticleIds, ...noiseArticleIds])];
console.log(`\nTotal articles to delete: ${allDeleteIds.length}`);

// Step 3: Check discovered_contacts that will be orphaned
const { data: orphanContacts } = await db.from('discovered_contacts')
  .select('id, source_article_id')
  .in('source_article_id', allDeleteIds.slice(0, 200));
console.log(`\nStep 3: Discovered contacts to be orphaned: ${orphanContacts?.length || 0}`);

// Step 4: Check pipeline_leads referencing these articles
const { data: pipelineOrphans } = await db.from('pipeline_leads')
  .select('id, company_name, source_article_id')
  .in('source_article_id', allDeleteIds.slice(0, 200));
console.log(`Step 4: Pipeline leads referencing deleted articles: ${pipelineOrphans?.length || 0}`);
if (pipelineOrphans?.length) {
  for (const p of pipelineOrphans) console.log(`  → ${p.company_name} (${p.id})`);
}

if (dryRun) {
  console.log('\n=== DRY RUN COMPLETE — no changes made ===');
  console.log('Run without --dry-run to execute.');
  process.exit(0);
}

// Execute cleanup
console.log('\n--- Executing ---');

// Delete articles (scored_articles cascade-delete via FK)
let deleted = 0;
for (let i = 0; i < allDeleteIds.length; i += 100) {
  const batch = allDeleteIds.slice(i, i + 100);
  const { error } = await db.from('articles').delete().in('id', batch);
  if (error) console.error(`  Batch ${i} error:`, error.message);
  else deleted += batch.length;
}
console.log(`Step A: Deleted ${deleted} articles (+ scored_articles via cascade)`);

// Clean orphaned discovered_contacts
const { data: allContacts } = await db.from('discovered_contacts')
  .select('id, source_article_id')
  .not('source_article_id', 'is', null);

const orphanIds = [];
for (const ct of allContacts || []) {
  const { count } = await db.from('articles').select('id', { count: 'exact', head: true }).eq('id', ct.source_article_id);
  if (count === 0) orphanIds.push(ct.id);
}

if (orphanIds.length > 0) {
  for (let i = 0; i < orphanIds.length; i += 100) {
    await db.from('discovered_contacts').delete().in('id', orphanIds.slice(i, i + 100));
  }
}
console.log(`Step B: Cleaned ${orphanIds.length} orphaned discovered_contacts`);

// Recount discovered_companies mention_count
const { data: companies } = await db.from('discovered_companies').select('normalized_name');
let recounted = 0, dismissed = 0;
for (const dc of companies || []) {
  const { count } = await db.from('scored_articles')
    .select('id', { count: 'exact', head: true })
    .ilike('company', dc.normalized_name)
    .gte('relevance_score', 25)
    .is('drop_reason', null)
    .eq('is_duplicate', false);

  const newCount = count || 0;
  await db.from('discovered_companies')
    .update({ mention_count: newCount, updated_at: new Date().toISOString() })
    .eq('normalized_name', dc.normalized_name);
  
  if (newCount === 0) {
    await db.from('discovered_companies')
      .update({ status: 'dismissed', updated_at: new Date().toISOString() })
      .eq('normalized_name', dc.normalized_name);
    dismissed++;
  }
  recounted++;
}
console.log(`Step C: Recounted ${recounted} companies, dismissed ${dismissed} with 0 mentions`);

// Final stats
const { count: finalArticles } = await db.from('articles').select('id', { count: 'exact', head: true });
const { count: finalScored } = await db.from('scored_articles').select('id', { count: 'exact', head: true });
const { count: finalCompanies } = await db.from('discovered_companies').select('normalized_name', { count: 'exact', head: true }).eq('status', 'active');

console.log(`\n=== CLEANUP COMPLETE ===`);
console.log(`  Articles remaining: ${finalArticles}`);
console.log(`  Scored remaining: ${finalScored}`);
console.log(`  Active companies: ${finalCompanies}`);
