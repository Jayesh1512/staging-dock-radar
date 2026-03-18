/**
 * One-time script: re-classify scored_articles rows where industry = 'Unknown' or starts with 'Other:'.
 *
 * Strategy:
 *   1. LLM classifies the article into a sector name.
 *   2. If LLM returns "Unknown", keep the existing value (don't overwrite with "Unknown").
 *   3. Dry-run shows the analysis before any writes.
 *
 * Usage:
 *   node scripts/reclassify-industry.mjs --dry-run   (preview — no DB writes)
 *   node scripts/reclassify-industry.mjs             (live run)
 *
 * Requires .env.local: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Load env from .env.local ─────────────────────────────────────────────────
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
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

/**
 * Broad classification prompt — covers deployment verticals AND cross-cutting topics
 * (regulatory, defense, automotive R&D, general drone industry, etc.)
 */
const SYSTEM_PROMPT = `You are a data classification assistant for a drone industry intelligence tool.

Given a news article title and snippet, classify the primary industry or topic sector.

Examples of sector names (use these as formatting guidance — you are NOT restricted to them):
DEPLOYMENT VERTICALS: Energy & Utilities | Public Safety & Emergency Response | Oil & Gas / Industrial Assets | Mining & Natural Resources | Construction & Infrastructure | Ports, Maritime & Logistics Hubs | Agriculture & Forestry | Perimeter Security & Smart Facilities | Water & Environmental Utilities
CROSS-CUTTING TOPICS: Regulatory & Policy | Defense & Security | Research & Development | Drone Technology | Automotive | Training & Certification | Logistics & Delivery | Market Analysis | Consumer Electronics | Municipal Services

Rules:
- Reply with ONLY the sector name — no explanation, no punctuation at the end.
- Choose the most specific label that fits.
- Use "Unknown" ONLY if the article has absolutely no industry context at all (e.g. empty or completely off-topic content).
- For regulatory/policy articles, use "Regulatory & Policy".
- For defense/military articles, use "Defense & Security".`;

async function classifyIndustry(title, snippet) {
  const userContent = [
    `Title: ${title}`,
    snippet ? `Snippet: ${snippet.slice(0, 500)}` : '',
  ].filter(Boolean).join('\n');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    temperature: 0,
    max_tokens: 30,
  });

  return response.choices[0]?.message?.content?.trim() ?? 'Unknown';
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}\n`);

  // ── Fetch rows where industry is 'Unknown' OR starts with 'Other:' ───────
  const { data: unknownRows, error: e1 } = await db
    .from('scored_articles')
    .select('id, article_id, industry')
    .eq('industry', 'Unknown');

  const { data: otherRows, error: e2 } = await db
    .from('scored_articles')
    .select('id, article_id, industry')
    .like('industry', 'Other:%');

  if (e1 || e2) { console.error('Fetch failed:', e1?.message ?? e2?.message); process.exit(1); }

  const rows = [...(unknownRows ?? []), ...(otherRows ?? [])];
  if (rows.length === 0) { console.log('No rows to re-classify — all clean.'); return; }

  console.log(`Found ${rows.length} rows to process (${unknownRows?.length ?? 0} Unknown + ${otherRows?.length ?? 0} Other:*)\n`);

  // ── Fetch article titles + snippets ──────────────────────────────────────
  const articleIds = rows.map(r => r.article_id);
  const { data: articles, error: artErr } = await db
    .from('articles')
    .select('id, title, snippet')
    .in('id', articleIds);

  if (artErr) { console.error('Article fetch failed:', artErr.message); process.exit(1); }
  const articleMap = new Map((articles ?? []).map(a => [a.id, a]));

  // ── Process each row ─────────────────────────────────────────────────────
  const results = { improved: [], kept_old: [], no_article: [] };

  for (const row of rows) {
    const article = articleMap.get(row.article_id);
    if (!article) {
      console.log(`  [SKIP] ${row.id} — article not found`);
      results.no_article.push(row.id);
      continue;
    }

    const newIndustry = await classifyIndustry(article.title, article.snippet);
    const oldIndustry = row.industry;

    // Fallback: if LLM returns Unknown, keep existing value (don't downgrade)
    const finalIndustry = newIndustry === 'Unknown' ? oldIndustry : newIndustry;
    const action = newIndustry === 'Unknown' ? 'KEEP_OLD' : 'IMPROVE';

    const icon = action === 'IMPROVE' ? '✓' : '~';
    console.log(`  [${icon} ${action}] ${row.id.slice(-30)}`);
    console.log(`    Title : ${article.title.slice(0, 90)}`);
    console.log(`    Old   : ${oldIndustry}`);
    console.log(`    LLM   : ${newIndustry}`);
    if (action === 'KEEP_OLD') {
      console.log(`    Final : ${finalIndustry}  (LLM returned Unknown — keeping old)`);
    } else {
      console.log(`    Final : ${finalIndustry}`);
    }

    if (!DRY_RUN && finalIndustry !== oldIndustry) {
      const { error: updateErr } = await db
        .from('scored_articles')
        .update({ industry: finalIndustry })
        .eq('id', row.id);

      if (updateErr) {
        console.log(`    [DB ERROR] ${updateErr.message}`);
      }
    }

    if (action === 'IMPROVE') results.improved.push({ id: row.id, old: oldIndustry, new: finalIndustry });
    else results.kept_old.push({ id: row.id, old: oldIndustry });

    console.log('');
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('═'.repeat(60));
  console.log(`SUMMARY (${DRY_RUN ? 'DRY RUN' : 'LIVE'})`);
  console.log('─'.repeat(60));
  console.log(`  ✓ Improved  : ${results.improved.length} rows got a better classification`);
  console.log(`  ~ Kept old  : ${results.kept_old.length} rows — LLM returned Unknown, kept existing value`);
  console.log(`  ✗ No article: ${results.no_article.length} rows had no matching article`);
  console.log('');

  if (results.improved.length > 0) {
    console.log('Improved rows:');
    for (const r of results.improved) {
      console.log(`  ${r.old.padEnd(35)} → ${r.new}`);
    }
  }

  if (results.kept_old.length > 0) {
    console.log('\nKept-old rows (LLM could not improve — consider manual review):');
    for (const r of results.kept_old) {
      console.log(`  ${r.old}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
