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
console.log(dryRun ? '=== DRY RUN ===' : '=== EXECUTING ===');

const dockKws = ['dji dock', 'dock 2', 'dock 3', 'drone-in-a-box'];
const hasDock = (text) => dockKws.some(kw => (text || '').toLowerCase().includes(kw));

// ── BEFORE STATE ──
const { count: beforeArticles } = await db.from('articles').select('id', { count: 'exact', head: true });
const { count: beforeScored } = await db.from('scored_articles').select('id', { count: 'exact', head: true });
const { count: beforeCompanies } = await db.from('discovered_companies').select('normalized_name', { count: 'exact', head: true }).eq('status', 'active');
const { count: beforeContacts } = await db.from('discovered_contacts').select('id', { count: 'exact', head: true });

console.log(`\nBEFORE: ${beforeArticles} articles, ${beforeScored} scored, ${beforeCompanies} active companies, ${beforeContacts} contacts`);

// ── LAYER 1a: Delete articles from pure other-keyword runs ──
console.log('\n--- LAYER 1a: Pure other-keyword runs ---');

const { data: allRuns } = await db.from('runs').select('id, keywords');
const pureOtherRunIds = [];
for (const r of allRuns || []) {
  const kws = Array.isArray(r.keywords) ? r.keywords : [];
  const hasDjiDock = kws.some(k => k.toLowerCase() === 'dji dock');
  const hasCompany = kws.some(k => k.startsWith('company:'));
  if (!hasDjiDock && !hasCompany && kws.length > 0) {
    pureOtherRunIds.push(r.id);
  }
}

// Count articles in these runs
let layer1aArticleIds = [];
for (let i = 0; i < pureOtherRunIds.length; i += 50) {
  const batch = pureOtherRunIds.slice(i, i + 50);
  const { data } = await db.from('articles').select('id').in('run_id', batch);
  if (data) layer1aArticleIds.push(...data.map(a => a.id));
}
console.log(`  Runs to clean: ${pureOtherRunIds.length}`);
console.log(`  Articles to delete: ${layer1aArticleIds.length}`);

if (!dryRun && layer1aArticleIds.length > 0) {
  for (let i = 0; i < layer1aArticleIds.length; i += 100) {
    const batch = layer1aArticleIds.slice(i, i + 100);
    const { error } = await db.from('articles').delete().in('id', batch);
    if (error) console.error(`  Error:`, error.message);
  }
  console.log(`  DELETED ${layer1aArticleIds.length} articles (scored_articles cascade)`);
}

// ── LAYER 1b: Delete non-Dock articles from mixed runs ──
console.log('\n--- LAYER 1b: Non-Dock articles from mixed runs ---');

const mixedRunIds = [];
for (const r of allRuns || []) {
  const kws = Array.isArray(r.keywords) ? r.keywords : [];
  const hasDjiDockKw = kws.some(k => k.toLowerCase() === 'dji dock');
  const hasCompany = kws.some(k => k.startsWith('company:'));
  const hasOther = kws.some(k => !['dji dock'].includes(k.toLowerCase()) && !k.startsWith('company:'));
  if (hasDjiDockKw && hasOther && !hasCompany) {
    mixedRunIds.push(r.id);
  }
}

// Get all articles from mixed runs
const mixedArticles = [];
for (let i = 0; i < mixedRunIds.length; i += 50) {
  const batch = mixedRunIds.slice(i, i + 50);
  const { data } = await db.from('articles').select('id, title, snippet').in('run_id', batch);
  if (data) mixedArticles.push(...data);
}

// Get scored summaries for these articles
const mixedArtIds = mixedArticles.map(a => a.id);
const scoredMap = new Map();
for (let i = 0; i < mixedArtIds.length; i += 200) {
  const batch = mixedArtIds.slice(i, i + 200);
  const { data } = await db.from('scored_articles').select('article_id, summary').in('article_id', batch);
  if (data) data.forEach(s => scoredMap.set(s.article_id, s.summary));
}

// Identify non-Dock articles (check title + snippet + summary)
const layer1bDeleteIds = [];
const layer1bKeepIds = [];
for (const art of mixedArticles) {
  const summary = scoredMap.get(art.id) || '';
  if (hasDock(art.title) || hasDock(art.snippet) || hasDock(summary)) {
    layer1bKeepIds.push(art.id);
  } else {
    layer1bDeleteIds.push(art.id);
  }
}

console.log(`  Mixed run articles total: ${mixedArticles.length}`);
console.log(`  Dock found (KEEP): ${layer1bKeepIds.length}`);
console.log(`  No Dock (DELETE): ${layer1bDeleteIds.length}`);

if (!dryRun && layer1bDeleteIds.length > 0) {
  for (let i = 0; i < layer1bDeleteIds.length; i += 100) {
    const batch = layer1bDeleteIds.slice(i, i + 100);
    const { error } = await db.from('articles').delete().in('id', batch);
    if (error) console.error(`  Error:`, error.message);
  }
  console.log(`  DELETED ${layer1bDeleteIds.length} articles`);
}

// ── CLEANUP: Orphaned contacts ──
console.log('\n--- Orphaned contacts cleanup ---');
const { data: allContacts } = await db.from('discovered_contacts')
  .select('id, source_article_id')
  .not('source_article_id', 'is', null);

let orphanCount = 0;
const orphanIds = [];
if (allContacts && allContacts.length > 0) {
  // Check in batches
  const contactArtIds = [...new Set(allContacts.map(c => c.source_article_id))];
  const existingArtIds = new Set();
  for (let i = 0; i < contactArtIds.length; i += 200) {
    const batch = contactArtIds.slice(i, i + 200);
    const { data } = await db.from('articles').select('id').in('id', batch);
    if (data) data.forEach(a => existingArtIds.add(a.id));
  }
  for (const ct of allContacts) {
    if (!existingArtIds.has(ct.source_article_id)) {
      orphanIds.push(ct.id);
      orphanCount++;
    }
  }
}
console.log(`  Orphaned contacts found: ${orphanCount}`);

if (!dryRun && orphanIds.length > 0) {
  for (let i = 0; i < orphanIds.length; i += 100) {
    await db.from('discovered_contacts').delete().in('id', orphanIds.slice(i, i + 100));
  }
  console.log(`  DELETED ${orphanIds.length} orphaned contacts`);
}

// ── CLEANUP: Recount discovered_companies ──
console.log('\n--- Recount discovered_companies ---');
const { data: companies } = await db.from('discovered_companies').select('normalized_name, mention_count, status');
let recounted = 0, dismissed = 0, staleCount = 0;

for (const dc of companies || []) {
  // Count remaining scored articles for this company
  const { count } = await db.from('scored_articles')
    .select('id', { count: 'exact', head: true })
    .ilike('company', dc.normalized_name)
    .gte('relevance_score', 25)
    .is('drop_reason', null)
    .eq('is_duplicate', false);

  const newCount = count || 0;
  const wasStale = newCount !== dc.mention_count;
  
  if (dryRun) {
    if (wasStale) staleCount++;
    if (newCount === 0 && dc.status === 'active') dismissed++;
    recounted++;
  } else {
    if (wasStale || newCount === 0) {
      const update = { mention_count: newCount, updated_at: new Date().toISOString() };
      if (newCount === 0 && dc.status === 'active') {
        Object.assign(update, { status: 'dismissed' });
        dismissed++;
      }
      await db.from('discovered_companies').update(update).eq('normalized_name', dc.normalized_name);
      if (wasStale) staleCount++;
    }
    recounted++;
  }
}
console.log(`  Companies checked: ${recounted}`);
console.log(`  Stale counts to update: ${staleCount}`);
console.log(`  Companies to dismiss (0 mentions): ${dismissed}`);

// ── PIPELINE LEADS CHECK ──
console.log('\n--- Pipeline leads safety check ---');
const totalDeleted = [...layer1aArticleIds, ...layer1bDeleteIds];
if (totalDeleted.length > 0) {
  const { data: affectedLeads } = await db.from('pipeline_leads')
    .select('id, company_name, source_article_id')
    .in('source_article_id', totalDeleted.slice(0, 200));
  console.log(`  Pipeline leads referencing deleted articles: ${affectedLeads?.length || 0}`);
  if (affectedLeads?.length) {
    for (const p of affectedLeads) {
      console.log(`    ⚠ ${p.company_name} (lead ${p.id})`);
    }
  }
} else {
  console.log(`  No articles deleted (dry run), skipping check`);
}

// ── AFTER STATE (projected for dry run) ──
const totalDeleteCount = layer1aArticleIds.length + layer1bDeleteIds.length;
console.log(`\n=== SUMMARY ===`);
console.log(`  Layer 1a (pure other-keyword runs): ${layer1aArticleIds.length} articles`);
console.log(`  Layer 1b (non-Dock from mixed runs): ${layer1bDeleteIds.length} articles`);
console.log(`  Total articles to delete: ${totalDeleteCount}`);
console.log(`  Orphaned contacts to clean: ${orphanCount}`);
console.log(`  Companies to dismiss: ${dismissed}`);
console.log(`  Stale mention counts to fix: ${staleCount}`);
console.log(`  Pipeline leads affected: checked above`);

if (dryRun) {
  console.log(`\n  PROJECTED AFTER STATE:`);
  console.log(`    Articles: ${beforeArticles} → ${beforeArticles - totalDeleteCount}`);
  console.log(`    Scored: ${beforeScored} → ~${beforeScored - totalDeleteCount} (cascade)`);
  console.log(`    Active companies: ${beforeCompanies} → ${beforeCompanies - dismissed}`);
  console.log(`    Contacts: ${beforeContacts} → ${beforeContacts - orphanCount}`);
} else {
  const { count: afterArticles } = await db.from('articles').select('id', { count: 'exact', head: true });
  const { count: afterScored } = await db.from('scored_articles').select('id', { count: 'exact', head: true });
  const { count: afterCompanies } = await db.from('discovered_companies').select('normalized_name', { count: 'exact', head: true }).eq('status', 'active');
  const { count: afterContacts } = await db.from('discovered_contacts').select('id', { count: 'exact', head: true });
  console.log(`\n  AFTER STATE:`);
  console.log(`    Articles: ${beforeArticles} → ${afterArticles}`);
  console.log(`    Scored: ${beforeScored} → ${afterScored}`);
  console.log(`    Active companies: ${beforeCompanies} → ${afterCompanies}`);
  console.log(`    Contacts: ${beforeContacts} → ${afterContacts}`);
}

// ── VERIFY: What remains on leaderboard after Layer 2 threshold ──
console.log(`\n--- Layer 2 simulation: Leaderboard at threshold >= 50 ---`);
const { data: remainingScored } = await db.from('scored_articles')
  .select('company, relevance_score, summary, article_id')
  .gte('relevance_score', 50)
  .is('drop_reason', null)
  .eq('is_duplicate', false)
  .not('company', 'is', null);

// Group by company
const companyPosts = new Map();
for (const s of remainingScored || []) {
  const name = s.company.toLowerCase().trim();
  if (!companyPosts.has(name)) companyPosts.set(name, { display: s.company, count: 0, scores: [], hasDock: false });
  const entry = companyPosts.get(name);
  entry.count++;
  entry.scores.push(s.relevance_score);
  if (hasDock(s.summary)) entry.hasDock = true;
}

// Get article titles to check dock in title
for (const [name, entry] of companyPosts) {
  if (entry.hasDock) continue;
  const matching = (remainingScored || []).filter(s => s.company.toLowerCase().trim() === name);
  const artIds = matching.map(s => s.article_id);
  if (artIds.length > 0) {
    const { data: arts } = await db.from('articles').select('id, title').in('id', artIds.slice(0, 50));
    if (arts?.some(a => hasDock(a.title))) entry.hasDock = true;
  }
}

const leaderboard = [...companyPosts.values()].sort((a, b) => b.count - a.count || (b.scores.reduce((x,y)=>x+y,0)/b.scores.length) - (a.scores.reduce((x,y)=>x+y,0)/a.scores.length));

console.log(`  Companies on leaderboard (score >= 50): ${leaderboard.length}`);
console.log(`  With DJI Dock: ${leaderboard.filter(c => c.hasDock).length}`);
console.log(`  WITHOUT DJI Dock: ${leaderboard.filter(c => !c.hasDock).length}`);

console.log(`\n  TOP 20 (projected leaderboard):`);
for (const c of leaderboard.slice(0, 20)) {
  const avg = Math.round(c.scores.reduce((a,b) => a+b, 0) / c.scores.length);
  const dock = c.hasDock ? 'DOCK' : 'NO-DOCK';
  console.log(`    ${c.display.padEnd(30)} posts=${c.count}  avg=${avg}  ${dock}`);
}

if (leaderboard.filter(c => !c.hasDock).length > 0) {
  console.log(`\n  ⚠ NO-DOCK companies still on leaderboard (scored 50+ by old prompt):`);
  for (const c of leaderboard.filter(c => !c.hasDock)) {
    const avg = Math.round(c.scores.reduce((a,b) => a+b, 0) / c.scores.length);
    console.log(`    ${c.display.padEnd(30)} posts=${c.count}  avg=${avg}`);
  }
}
