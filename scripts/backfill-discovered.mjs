#!/usr/bin/env node
/**
 * Backfill discovered_companies + discovered_contacts from existing scored_articles.
 * Run once after applying the 20260319000001 migration.
 *
 * Usage: node scripts/backfill-discovered.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

// ── Load .env.local ──
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const envContent = readFileSync(resolve(__dirname, '../.env.local'), 'utf8');
  for (const line of envContent.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('##')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (k && !process.env[k]) process.env[k] = v;
  }
} catch { /* fall through */ }

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── Constants (mirrored from src/lib) ──

const OEM_NAMES = new Set([
  'dji', 'skydio', 'autel', 'autel robotics', 'parrot', 'sensefly',
  'zipline', 'wing', 'joby', 'joby aviation', 'manna', 'matternet',
  'ehang', 'flytrex', 'elbit systems', 'aerovironment',
]);

const COUNTRY_MAP = {
  'united states': 'US', 'usa': 'US', 'u.s.': 'US', 'us': 'US', 'america': 'US',
  'north america': 'US',
  'canada': 'Canada',
  'brazil': 'Brazil', 'brasil': 'Brazil',
  'mexico': 'Mexico',
  'united kingdom': 'UK', 'uk': 'UK', 'england': 'UK', 'britain': 'UK', 'great britain': 'UK',
  'germany': 'Germany', 'deutschland': 'Germany',
  'france': 'France',
  'italy': 'Italy',
  'india': 'India',
  'singapore': 'Singapore',
  'japan': 'Japan',
  'australia': 'Australia',
  'south korea': 'South Korea', 'korea': 'South Korea',
  'united arab emirates': 'UAE', 'uae': 'UAE', 'emirates': 'UAE',
  'saudi arabia': 'Saudi Arabia', 'ksa': 'Saudi Arabia',
  'south africa': 'South Africa',
  'multiple': 'Multiple', 'global': 'Multiple',
};

function normalizeCountry(c) {
  if (!c) return c;
  return COUNTRY_MAP[c.toLowerCase().trim()] ?? c;
}

const LEGAL_SUFFIXES = [
  'inc', 'ltd', 'llc', 'gmbh', 'corp', 'corporation',
  'solutions', 'services', 'technologies', 'technology',
  'systems', 'group', 'limited', 'co', 'plc', 'pty',
];

function normalizeCompanyName(name) {
  if (!name) return '';
  let n = name.toLowerCase().trim();
  for (const s of LEGAL_SUFFIXES) {
    n = n.replace(new RegExp(`\\b${s}\\b`, 'g'), '');
  }
  n = n.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  return n;
}

// ── Main ──

async function backfill() {
  console.log('\n🔄 BACKFILL: discovered_companies + discovered_contacts\n');

  // Load qualified scored articles
  const { data, error } = await db.from('scored_articles')
    .select('id, article_id, company, country, industry, signal_type, entities, persons, relevance_score')
    .gte('relevance_score', 50)
    .is('drop_reason', null)
    .eq('is_duplicate', false);

  if (error) { console.error('Failed to load scored_articles:', error.message); process.exit(1); }

  const articles = data || [];
  console.log(`📄 Loaded ${articles.length} qualified articles\n`);

  // ── Aggregate companies ──
  const companyAgg = new Map();
  const contactAgg = new Map();

  for (const article of articles) {
    // Within-article entity dedup
    const articleEntities = new Map();

    for (const entity of (article.entities || [])) {
      if (!entity.name) continue;
      const norm = normalizeCompanyName(entity.name);
      if (!norm) continue;

      const entityType = OEM_NAMES.has(norm) ? 'oem' : (entity.type || 'operator');

      const existing = articleEntities.get(norm);
      if (existing) {
        existing.types.add(entityType);
      } else {
        articleEntities.set(norm, { display_name: entity.name, types: new Set([entityType]) });
      }
    }

    // If no entities, fallback to company field
    if (articleEntities.size === 0 && article.company) {
      const norm = normalizeCompanyName(article.company);
      if (norm) {
        const entityType = OEM_NAMES.has(norm) ? 'oem' : 'operator';
        articleEntities.set(norm, { display_name: article.company, types: new Set([entityType]) });
      }
    }

    const normalizedCountry = normalizeCountry(article.country);

    for (const [norm, entry] of articleEntities) {
      const existing = companyAgg.get(norm);
      if (existing) {
        entry.types.forEach(t => existing.types.add(t));
        if (normalizedCountry) existing.countries.add(normalizedCountry);
        if (article.industry) existing.industries.add(article.industry);
        existing.signal_types.add(article.signal_type);
        existing.article_ids.add(article.article_id);
      } else {
        companyAgg.set(norm, {
          display_name: entry.display_name,
          types: new Set(entry.types),
          countries: new Set(normalizedCountry ? [normalizedCountry] : []),
          industries: new Set(article.industry ? [article.industry] : []),
          signal_types: new Set([article.signal_type]),
          article_ids: new Set([article.article_id]),
        });
      }
    }

    // Persons → contacts
    for (const person of (article.persons || [])) {
      if (!person.name) continue;
      const nameNorm = person.name.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
      if (!nameNorm) continue;

      let companyNorm = null;
      if (person.organization) {
        const orgNorm = normalizeCompanyName(person.organization);
        if (orgNorm && companyAgg.has(orgNorm)) companyNorm = orgNorm;
      }

      const key = `${nameNorm}|${companyNorm ?? ''}`;
      if (!contactAgg.has(key)) {
        contactAgg.set(key, {
          name: person.name,
          name_normalized: nameNorm,
          role: person.role || '',
          organization: person.organization || '',
          company_normalized_name: companyNorm,
          source_article_id: article.article_id,
        });
      }
    }
  }

  console.log(`🏢 Companies aggregated: ${companyAgg.size}`);
  console.log(`👤 Contacts aggregated: ${contactAgg.size}\n`);

  // ── Upsert companies ──
  const now = new Date().toISOString();
  let companyOk = 0, companyFail = 0;

  for (const [norm, entry] of companyAgg) {
    const row = {
      normalized_name: norm,
      display_name: entry.display_name,
      types: Array.from(entry.types),
      countries: Array.from(entry.countries),
      industries: Array.from(entry.industries),
      signal_types: Array.from(entry.signal_types),
      mention_count: entry.article_ids.size,
      first_seen_at: now,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
    };

    const { error: uErr } = await db.from('discovered_companies').upsert(row, {
      onConflict: 'normalized_name',
    });

    if (uErr) {
      console.error(`  ✗ ${norm}: ${uErr.message}`);
      companyFail++;
    } else {
      companyOk++;
    }
  }

  console.log(`✅ Companies upserted: ${companyOk} (${companyFail} failed)`);

  // ── Upsert contacts ──
  let contactOk = 0, contactFail = 0;

  for (const [, contact] of contactAgg) {
    const row = {
      company_normalized_name: contact.company_normalized_name,
      name: contact.name,
      name_normalized: contact.name_normalized,
      role: contact.role,
      organization: contact.organization,
      source_article_id: contact.source_article_id,
      enriched_by: 'backfill',
      created_at: now,
      updated_at: now,
    };

    const { error: cErr } = await db.from('discovered_contacts').insert(row);
    if (cErr) {
      // Likely duplicate — skip silently
      if (!cErr.message.includes('duplicate')) {
        console.error(`  ✗ contact ${contact.name}: ${cErr.message}`);
      }
      contactFail++;
    } else {
      contactOk++;
    }
  }

  console.log(`✅ Contacts inserted: ${contactOk} (${contactFail} skipped/failed)`);

  // ── Summary ──
  console.log('\n📊 BACKFILL COMPLETE');
  console.log(`   Companies: ${companyOk}/${companyAgg.size}`);
  console.log(`   Contacts:  ${contactOk}/${contactAgg.size}`);

  // Show top 10 companies
  const sorted = [...companyAgg.entries()]
    .sort((a, b) => b[1].article_ids.size - a[1].article_ids.size)
    .slice(0, 10);
  console.log('\n🏆 Top 10 by mentions:');
  for (const [norm, e] of sorted) {
    console.log(`   ${e.article_ids.size}x ${e.display_name} [${Array.from(e.types).join(',')}] — ${Array.from(e.countries).join(', ') || 'no country'}`);
  }
  console.log();
}

backfill().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
