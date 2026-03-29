/**
 * Import Google Search FR data from source_candidates into multi_sources_companies_import
 * Source: source_candidates table, source_type='google_search', country_code='FR'
 *
 * All 16 records go in — no filtering. Google Search was region=France.
 *
 * Run: node scripts/import-google-search-france.mjs
 */

import { createClient } from '@supabase/supabase-js';

const DRY_RUN = false;

const db = createClient(
  'https://lxubuceipdmpovtbukmb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4dWJ1Y2VpcGRtcG92dGJ1a21iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQ3NTMxNiwiZXhwIjoyMDg5MDUxMzE2fQ.X7j1G7JX3YtXNWTCJQpjCTVJrp81cIAvoLf-vCefrss'
);

// ── Manual overrides ──

// Proper display names for companies (source_candidates stores lowercased slugs)
const NAME_OVERRIDES = {
  'djifr': null,         // SKIP — merged into DJI France below
  'djlfrance': 'DJI France',
  'dronenerds': 'DroneNerds',
  'hpdrones': 'HP Drones',
  'takeoffformation': 'TakeOff Formation',
  'aptella': 'Aptella',
  'advexure': 'Advexure',
};

// DJI FR (facebook) merges INTO DJL France (has website)
// We'll combine both evidence URLs into the DJL France record
const MERGE_DJIFR_INTO_DJLFRANCE = true;

// ── Helpers ──

function normalizeCompanyName(name) {
  if (!name) return '';
  let n = name.toLowerCase().trim();
  n = n.replace(/\(.*?\)/g, '');
  const suffixes = ['sas','sarl','sa','eurl','sasu','sci','inc','ltd','llc','gmbh','corp','corporation','limited','co','plc','b.v.','bv','n.v.','nv','ag','srl','spa','sl','se'];
  for (const s of suffixes) {
    const escaped = s.replace(/\./g, '\\.');
    n = n.replace(new RegExp(`(?:^|\\s)${escaped}(?:\\s|,|$)`, 'gi'), ' ');
  }
  n = n.replace(/[–—]/g, '-');
  n = n.replace(/[^\w\s\u00C0-\u024F-]/g, '');
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

function extractDomain(url) {
  if (!url || url === 'Unknown') return null;
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    return hostname.replace(/^www\./, '');
  } catch { return null; }
}

function cleanUrl(url) {
  if (!url || url === 'Unknown' || url.trim() === '') return null;
  return url.trim();
}

/** Parse signal keywords from snippet to extract dock model references */
function parseDockModelsFromSnippet(snippet, evidenceUrl) {
  const text = (snippet || '') + ' ' + (evidenceUrl || '');
  const keywords = [];
  if (/dock[\s-]*1/i.test(text)) keywords.push('DJI Dock 1');
  if (/dock[\s-]*2/i.test(text)) keywords.push('DJI Dock 2');
  if (/dock[\s-]*3/i.test(text)) keywords.push('DJI Dock 3');
  if (keywords.length === 0 && /dji[\s-]*dock/i.test(text)) keywords.push('DJI Dock');
  return keywords;
}

/** Map entity_type from source_candidates to role for new table */
function mapRole(entityType) {
  const map = {
    'operator': 'System Integrator',
    'reseller': 'Authorized Dealer',
    'unknown': null,
  };
  return map[entityType] || null;
}

// ── Main ──

async function main() {
  console.log(`═══ Google Search France Import — ${DRY_RUN ? 'DRY RUN' : 'LIVE'} ═══\n`);

  // 1. Fetch Google Search FR from source_candidates
  const { data: srcRows, error: srcErr } = await db
    .from('source_candidates')
    .select('*')
    .eq('country_code', 'FR')
    .eq('source_type', 'google_search')
    .order('raw_score', { ascending: false });

  if (srcErr) { console.error('Fetch error:', srcErr.message); return; }
  console.log(`Google Search FR records in source_candidates: ${srcRows.length}\n`);

  // 2. Fetch existing records for matching
  const { data: existing, error: fetchErr } = await db
    .from('multi_sources_companies_import')
    .select('id,company_name,normalized_name,normalized_domain,website,linkedin,source_types,dock_verified,dock_models,verifications,role,notes')
    .eq('country_code', 'FR');

  if (fetchErr) { console.error('Fetch error:', fetchErr.message); return; }
  console.log(`Existing FR records in new table: ${existing.length}\n`);

  // Build lookup maps
  const byName = new Map();
  const byDomain = new Map();
  for (const r of existing) {
    byName.set(r.normalized_name, r);
    if (r.normalized_domain) byDomain.set(r.normalized_domain, r);
  }

  // 3. Process each record
  const results = { merge: [], insert: [] };

  // Pre-process: collect DJI FR evidence to merge into DJL France
  let djiFrEvidence = null;
  if (MERGE_DJIFR_INTO_DJLFRANCE) {
    const djiFrRow = srcRows.find(r => normalizeCompanyName(r.company_name) === 'djifr');
    if (djiFrRow && djiFrRow.evidence_url) {
      djiFrEvidence = {
        method: 'google_search',
        hits: 1,
        url: cleanUrl(djiFrRow.evidence_url),
        relevance: 'direct',
        at: djiFrRow.detected_at || new Date().toISOString(),
        keywords_matched: parseDockModelsFromSnippet(djiFrRow.snippet, djiFrRow.evidence_url),
        post_date: null,
        note: 'DJI France Facebook video — DJI Dock 3 showcase',
      };
    }
  }

  for (const row of srcRows) {
    const rawName = row.company_name;
    const normName = normalizeCompanyName(rawName);

    // Skip DJI FR — merged into DJL France
    if (NAME_OVERRIDES[normName] === null) {
      console.log(`SKIP: ${rawName} (merged into DJI France)`);
      continue;
    }

    // Apply display name override
    const displayName = NAME_OVERRIDES[normName] || (row.source_meta?.google_title || rawName);

    const website = cleanUrl(row.website);
    const domain = row.normalized_domain || extractDomain(website);
    const evidenceUrl = cleanUrl(row.evidence_url);
    const snippet = row.snippet || '';
    const dockKeywords = parseDockModelsFromSnippet(snippet, evidenceUrl);
    const role = mapRole(row.entity_type);

    // Build verification entry from evidence
    const verification = evidenceUrl ? {
      method: 'google_search',
      hits: 1,
      url: evidenceUrl,
      relevance: 'direct',
      at: row.detected_at || new Date().toISOString(),
      keywords_matched: dockKeywords,
      post_date: null,
      note: snippet ? snippet.substring(0, 200) : null,
    } : null;

    // Match: 1) normalized_name, 2) domain fallback
    let match = byName.get(normName);
    let matchMethod = 'name';

    if (!match && domain) {
      match = byDomain.get(domain);
      matchMethod = 'domain';
    }

    // Also check if domain matches with different subdomain patterns
    // e.g., "shop.prodrones.fr" should match "prodrones.fr"
    if (!match && domain) {
      for (const [existingDomain, existingRec] of byDomain.entries()) {
        if (domain.endsWith(existingDomain) || existingDomain.endsWith(domain)) {
          match = existingRec;
          matchMethod = 'domain-suffix';
          break;
        }
        // Strip subdomains and compare base
        const domainBase = domain.split('.').slice(-2).join('.');
        const existingBase = existingDomain.split('.').slice(-2).join('.');
        if (domainBase === existingBase) {
          match = existingRec;
          matchMethod = 'domain-base';
          break;
        }
      }
    }

    if (match) {
      // ── MERGE ──
      const existingSources = match.source_types || [];
      const mergedSources = [...new Set([...existingSources, 'google_search'])];

      const existingVerifications = Array.isArray(match.verifications) ? match.verifications : [];
      const mergedVerifications = verification
        ? [...existingVerifications, verification]
        : existingVerifications;

      // Merge dock_models
      const existingKw = (match.dock_models || '').split(',').map(s => s.trim()).filter(Boolean);
      const allKw = [...new Set([...existingKw, ...dockKeywords])].sort();
      const dockModelsStr = allKw.length > 0 ? allKw.join(', ') : match.dock_models;

      const dockVerified = match.dock_verified === true ? true : (verification ? true : match.dock_verified);
      const mergedWebsite = match.website || website;

      results.merge.push({
        existing: match.company_name,
        csv: rawName,
        normName,
        matchMethod,
        changes: {
          source_types: `${existingSources.join(',')} → ${mergedSources.join(',')}`,
          verifications: `${existingVerifications.length} → ${mergedVerifications.length} (+${verification ? 1 : 0})`,
          dock_verified: `${match.dock_verified} → ${dockVerified}`,
          dock_models: `${match.dock_models || 'null'} → ${dockModelsStr}`,
          website: match.website ? '(kept)' : (website || '(both null)'),
        },
        evidenceUrl: evidenceUrl,
        updatePayload: {
          source_types: mergedSources,
          verifications: mergedVerifications,
          dock_verified: dockVerified,
          dock_models: dockModelsStr || null,
          website: mergedWebsite,
          role: match.role || role || null,
          updated_at: new Date().toISOString(),
        },
        id: match.id,
      });
    } else {
      // ── NEW INSERT ──
      // For DJL France: also attach DJI FR Facebook evidence
      const verifications = verification ? [verification] : [];
      if (normName === 'djlfrance' && djiFrEvidence) {
        verifications.push(djiFrEvidence);
      }

      results.insert.push({
        company_name: displayName,
        normName: normName === 'djlfrance' ? 'dji france' : normName,
        domain,
        website,
        role,
        dockModels: dockKeywords.join(', ') || null,
        verifications,
        evidenceUrl,
        snippet,
        entityType: row.entity_type,
      });
    }
  }

  // ── Report ──
  console.log('═══════════════════════════════════');
  console.log(`MERGES: ${results.merge.length}`);
  console.log(`NEW INSERTS: ${results.insert.length}`);
  console.log('═══════════════════════════════════\n');

  console.log('── MERGES ──');
  for (const m of results.merge) {
    console.log(`\n${m.csv} → "${m.existing}" (${m.matchMethod})`);
    console.log(`  source_types: ${m.changes.source_types}`);
    console.log(`  verifications: ${m.changes.verifications}`);
    console.log(`  dock_verified: ${m.changes.dock_verified}`);
    console.log(`  dock_models: ${m.changes.dock_models}`);
    console.log(`  website: ${m.changes.website}`);
    if (m.evidenceUrl) console.log(`  + evidence: ${m.evidenceUrl}`);
  }

  if (results.insert.length > 0) {
    console.log('\n── NEW INSERTS ──');
    for (const ins of results.insert) {
      console.log(`\n${ins.company_name} (norm: "${ins.normName}")`);
      console.log(`  domain: ${ins.domain || 'null'} | website: ${ins.website || 'null'} | type: ${ins.entityType}`);
      console.log(`  dock_models: ${ins.dockModels || 'null'} | role: ${ins.role || 'null'}`);
      console.log(`  verifications: ${ins.verifications.length} entries`);
      for (const v of ins.verifications) {
        console.log(`  + evidence: ${v.url}`);
        if (v.note) console.log(`    note: ${v.note}`);
      }
    }
  }

  // ── Execute if not dry run ──
  if (!DRY_RUN) {
    console.log('\n\n═══ EXECUTING WRITES ═══');
    let updated = 0, inserted = 0, errors = 0;

    for (const m of results.merge) {
      const { error } = await db.from('multi_sources_companies_import')
        .update(m.updatePayload)
        .eq('id', m.id);
      if (error) {
        console.error(`  ✗ UPDATE ${m.existing}: ${error.message}`);
        errors++;
      } else {
        console.log(`  ✓ MERGED: ${m.existing}`);
        updated++;
      }
    }

    for (const ins of results.insert) {
      const { error } = await db.from('multi_sources_companies_import').insert({
        company_name: ins.company_name,
        country_code: 'FR',
        normalized_name: ins.normName,
        normalized_domain: ins.domain,
        website: ins.website,
        linkedin: null,
        role: ins.role,
        imported_via: 'google_search',
        import_batch: 'google-search-fr-29Mar',
        source_types: ['google_search'],
        dock_verified: ins.verifications.length > 0 ? true : null,
        dock_models: ins.dockModels,
        verifications: ins.verifications,
        notes: null,
      });
      if (error) {
        console.error(`  ✗ INSERT ${ins.company_name}: ${error.message}`);
        errors++;
      } else {
        console.log(`  ✓ INSERTED: ${ins.company_name}`);
        inserted++;
      }
    }

    console.log(`\n═══ RESULT: ${updated} merged, ${inserted} inserted, ${errors} errors ═══`);
  } else {
    console.log('\n[DRY RUN — no writes made]');
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
