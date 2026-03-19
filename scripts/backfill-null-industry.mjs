/**
 * Backfill NULL industries for scored_articles in the hitlist pipeline (score >= 50).
 *
 * Targets: scored_articles WHERE industry IS NULL AND relevance_score >= 50
 * Uses LLM to classify industry from article title + snippet.
 * Also updates discovered_companies.industries with new classifications.
 *
 * Usage:
 *   node scripts/backfill-null-industry.mjs --dry-run   (preview — no DB writes)
 *   node scripts/backfill-null-industry.mjs             (live run)
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

const SYSTEM_PROMPT = `You are a data classification assistant for a drone industry intelligence tool.

Given a news article title and snippet, classify the primary industry or topic sector.

Examples of sector names (use these as formatting guidance — you are NOT restricted to them):
DEPLOYMENT VERTICALS: Energy & Utilities | Public Safety & Emergency Response | Oil & Gas / Industrial Assets | Mining & Natural Resources | Construction & Infrastructure | Ports, Maritime & Logistics Hubs | Agriculture & Forestry | Perimeter Security & Smart Facilities | Water & Environmental Utilities
CROSS-CUTTING TOPICS: Regulatory & Policy | Defense & Security | Research & Development | Drone Technology | Training & Certification | Logistics & Delivery | Tourism & Hospitality | Municipal Services

Rules:
- Reply with ONLY the sector name — no explanation, no punctuation at the end.
- Choose the most specific label that fits.
- Use "Unknown" ONLY if the article has absolutely no industry context at all.
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

/** Simple company name normalizer (mirrors company-normalize.ts) */
function normalizeCompanyName(name) {
  if (!name) return '';
  let n = name.toLowerCase().trim();
  const suffixes = ['inc', 'ltd', 'llc', 'gmbh', 'corp', 'corporation',
    'solutions', 'services', 'technologies', 'technology',
    'systems', 'group', 'limited', 'co', 'plc', 'pty'];
  for (const s of suffixes) n = n.replace(new RegExp(`\\b${s}\\b`, 'g'), '');
  n = n.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  return n;
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}\n`);

  // ── Fetch rows where industry IS NULL and score >= 50 ──────────────────────
  const { data: rows, error: e1 } = await db
    .from('scored_articles')
    .select('id, article_id, industry, company, entities')
    .gte('relevance_score', 50)
    .is('drop_reason', null)
    .eq('is_duplicate', false)
    .is('industry', null);

  if (e1) { console.error('Fetch failed:', e1.message); process.exit(1); }
  if (!rows || rows.length === 0) { console.log('No rows with NULL industry — all clean.'); return; }

  console.log(`Found ${rows.length} scored articles with NULL industry (score >= 50)\n`);

  // ── Fetch article titles + snippets ────────────────────────────────────────
  const articleIds = [...new Set(rows.map(r => r.article_id))];
  const { data: articles, error: artErr } = await db
    .from('articles')
    .select('id, title, snippet')
    .in('id', articleIds);

  if (artErr) { console.error('Article fetch failed:', artErr.message); process.exit(1); }
  const articleMap = new Map((articles ?? []).map(a => [a.id, a]));

  // ── Process each row ───────────────────────────────────────────────────────
  const results = { classified: [], unknown: [], no_article: [] };
  // Track industries per company for discovered_companies update
  const companyIndustries = new Map(); // normalized_name → Set<industry>

  for (const row of rows) {
    const article = articleMap.get(row.article_id);
    if (!article) {
      results.no_article.push(row.id);
      continue;
    }

    const newIndustry = await classifyIndustry(article.title, article.snippet);
    const action = newIndustry === 'Unknown' ? 'UNKNOWN' : 'CLASSIFIED';

    const icon = action === 'CLASSIFIED' ? '✓' : '~';
    console.log(`  [${icon}] ${article.title.slice(0, 80)}`);
    console.log(`      → ${newIndustry}`);

    if (!DRY_RUN && action === 'CLASSIFIED') {
      const { error: updateErr } = await db
        .from('scored_articles')
        .update({ industry: newIndustry })
        .eq('id', row.id);

      if (updateErr) console.log(`      [DB ERROR] ${updateErr.message}`);
    }

    if (action === 'CLASSIFIED') {
      results.classified.push({ id: row.id, industry: newIndustry });

      // Track for discovered_companies update
      const companyName = row.company
        || (row.entities ?? []).find(e => e.type === 'si')?.name
        || (row.entities ?? []).find(e => e.type === 'operator')?.name
        || (row.entities ?? []).find(e => e.type === 'partner')?.name;
      if (companyName) {
        const norm = normalizeCompanyName(companyName);
        if (norm) {
          if (!companyIndustries.has(norm)) companyIndustries.set(norm, new Set());
          companyIndustries.get(norm).add(newIndustry);
        }
      }
    } else {
      results.unknown.push(row.id);
    }
    console.log('');
  }

  // ── Update discovered_companies.industries ─────────────────────────────────
  if (!DRY_RUN && companyIndustries.size > 0) {
    console.log(`\nUpdating discovered_companies industries for ${companyIndustries.size} companies...\n`);
    for (const [norm, industries] of companyIndustries) {
      // Fetch existing industries
      const { data: existing } = await db
        .from('discovered_companies')
        .select('industries')
        .eq('normalized_name', norm)
        .single();

      if (!existing) continue;

      const currentIndustries = new Set(existing.industries ?? []);
      for (const ind of industries) currentIndustries.add(ind);
      const merged = Array.from(currentIndustries);

      const { error: dcErr } = await db
        .from('discovered_companies')
        .update({ industries: merged, updated_at: new Date().toISOString() })
        .eq('normalized_name', norm);

      if (dcErr) {
        console.log(`  [DC ERROR] ${norm}: ${dcErr.message}`);
      } else {
        console.log(`  [DC ✓] ${norm} → ${merged.join(', ')}`);
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log(`SUMMARY (${DRY_RUN ? 'DRY RUN' : 'LIVE'})`);
  console.log('─'.repeat(60));
  console.log(`  ✓ Classified : ${results.classified.length} rows got industry`);
  console.log(`  ~ Unknown    : ${results.unknown.length} rows — LLM could not classify`);
  console.log(`  ✗ No article : ${results.no_article.length} rows had no matching article`);
  console.log(`  🏢 Companies : ${companyIndustries.size} discovered_companies to update`);
  console.log('');
}

main().catch(err => { console.error(err); process.exit(1); });
