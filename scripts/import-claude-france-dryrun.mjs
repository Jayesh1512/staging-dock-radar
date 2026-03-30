/**
 * DRY RUN: Import Claude France CSV into multi_sources_companies_import
 * Source: data/Data dumps/Raw country wise data/France/France Claude 29Mar1411.csv
 *
 * Run: node scripts/import-claude-france-dryrun.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const DRY_RUN = false;

const db = createClient(
  'https://lxubuceipdmpovtbukmb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4dWJ1Y2VpcGRtcG92dGJ1a21iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQ3NTMxNiwiZXhwIjoyMDg5MDUxMzE2fQ.X7j1G7JX3YtXNWTCJQpjCTVJrp81cIAvoLf-vCefrss'
);

// ── Helpers ──

function normalizeCompanyName(name) {
  if (!name) return '';
  let n = name.toLowerCase().trim();
  // Strip parenthetical content
  n = n.replace(/\(.*?\)/g, '');
  // Strip legal suffixes
  const suffixes = ['sas','sarl','sa','eurl','sasu','sci','inc','ltd','llc','gmbh','corp','corporation','limited','co','plc','b.v.','bv','n.v.','nv','ag','srl','spa','sl','se'];
  for (const s of suffixes) {
    const escaped = s.replace(/\./g, '\\.');
    n = n.replace(new RegExp(`(?:^|\\s)${escaped}(?:\\s|,|$)`, 'gi'), ' ');
  }
  // Normalize dashes/special chars
  n = n.replace(/[–—]/g, '-');  // normalize en-dash, em-dash to hyphen
  n = n.replace(/[^\w\s\u00C0-\u024F-]/g, '');  // keep accented chars and hyphens
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

/** Parse dock_models string like "Dock 1, Dock 2, Dock 3" into keywords_matched array */
function parseDockModels(models) {
  if (!models) return [];
  const keywords = [];
  if (/dock\s*1/i.test(models)) keywords.push('DJI Dock 1');
  if (/dock\s*2/i.test(models)) keywords.push('DJI Dock 2');
  if (/dock\s*3/i.test(models)) keywords.push('DJI Dock 3');
  if (keywords.length === 0 && /dock/i.test(models)) keywords.push('DJI Dock');
  return keywords;
}

/** Build a verification entry from an evidence URL */
function buildVerification(url, sourceType, dockModels, note) {
  return {
    method: 'claude',
    hits: 1,
    url: url,
    relevance: 'direct',
    at: new Date().toISOString(),
    keywords_matched: parseDockModels(dockModels),
    post_date: null,
    note: note || null,
  };
}

// ── Parse CSV ──

function readCSV(filepath) {
  const text = readFileSync(filepath, 'utf-8');
  const allRows = [];
  let current = '';
  let fields = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current || fields.length > 0) {
        fields.push(current);
        allRows.push(fields);
        fields = [];
        current = '';
      }
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      current += ch;
    }
  }
  if (current || fields.length > 0) {
    fields.push(current);
    allRows.push(fields);
  }

  if (allRows.length === 0) return [];
  const headers = allRows[0].map(h => h.trim());
  const rows = [];
  for (let r = 1; r < allRows.length; r++) {
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = (allRows[r][i] || '').trim();
    }
    rows.push(obj);
  }
  return rows;
}

// ── Main ──

async function main() {
  console.log('═══ Claude France Import — DRY RUN ═══\n');

  // 1. Read CSV
  const rows = readCSV('data/Data dumps/Raw country wise data/France/France Claude 29Mar1411.csv');
  console.log(`CSV rows: ${rows.length}`);

  // 2. Filter: only rows with dji_dock_verified = Yes
  const verified = rows.filter(r => r.dji_dock_verified === 'Yes');
  const skipped = rows.filter(r => r.dji_dock_verified !== 'Yes');

  console.log(`DJI Dock verified: ${verified.length}`);
  console.log(`Skipped (no DJI Dock signal): ${skipped.length}`);
  skipped.forEach(r => console.log(`  SKIP: ${r.company_name} — ${r.waterfall_step || 'no signal'}`));
  console.log('');

  // 3. Fetch existing records for matching
  const { data: existing, error: fetchErr } = await db
    .from('multi_sources_companies_import')
    .select('id,company_name,normalized_name,normalized_domain,website,linkedin,source_types,dock_verified,dock_models,verifications,role,notes')
    .eq('country_code', 'FR');

  if (fetchErr) { console.error('Fetch error:', fetchErr.message); return; }
  console.log(`Existing FR records: ${existing.length}\n`);

  // Build lookup maps
  const byName = new Map();
  const byDomain = new Map();
  for (const r of existing) {
    byName.set(r.normalized_name, r);
    if (r.normalized_domain) byDomain.set(r.normalized_domain, r);
  }

  // 4. Process each verified row
  const results = { merge: [], insert: [], skip: [] };

  for (const row of verified) {
    const rawName = row.company_name;
    const normName = normalizeCompanyName(rawName);
    const website = cleanUrl(row.website);
    const linkedin = cleanUrl(row.linkedin_url);
    const domain = extractDomain(website);
    const dockModels = row.dock_models || '';
    const evidenceUrl1 = cleanUrl(row.evidence_url_1);
    const evidenceUrl2 = cleanUrl(row.evidence_url_2);
    const sourceType1 = row.source_type_1 || '';
    const sourceType2 = row.source_type_2 || '';
    const notes = row.notes || '';
    const role = row.role || '';

    // Build verifications from evidence URLs
    const newVerifications = [];
    if (evidenceUrl1) {
      newVerifications.push(buildVerification(evidenceUrl1, sourceType1, dockModels, sourceType1));
    }
    if (evidenceUrl2) {
      newVerifications.push(buildVerification(evidenceUrl2, sourceType2, dockModels, sourceType2));
    }

    // Match: 1) normalized_name, 2) domain fallback, 3) partial name
    let match = byName.get(normName);
    let matchMethod = 'name';

    if (!match && domain) {
      match = byDomain.get(domain);
      matchMethod = 'domain';
    }

    // Partial name match: check if CSV name contains existing name or vice versa
    if (!match) {
      for (const [existingNorm, existingRec] of byName.entries()) {
        // Check if one contains the other (both ways)
        if (normName.length > 3 && existingNorm.length > 3) {
          if (normName.includes(existingNorm) || existingNorm.includes(normName)) {
            match = existingRec;
            matchMethod = 'partial';
            break;
          }
          // Check for shared significant words (e.g., instadrone)
          // Min 6 chars to avoid generic words like "drone", "group", "store"
          const csvWords = normName.split(/[\s-]+/).filter(w => w.length >= 6);
          const existingWords = existingNorm.split(/[\s-]+/).filter(w => w.length >= 6);
          const shared = csvWords.filter(w => existingWords.includes(w));
          if (shared.length > 0 && shared[0].length >= 6) {
            match = existingRec;
            matchMethod = `partial-word(${shared[0]})`;
            break;
          }
        }
      }
    }

    if (match) {
      // ── MERGE ──
      const existingSources = match.source_types || [];
      const mergedSources = [...new Set([...existingSources, 'claude'])];

      // Merge verifications (append new ones)
      const existingVerifications = Array.isArray(match.verifications) ? match.verifications : [];
      const mergedVerifications = [...existingVerifications, ...newVerifications];

      // Merge dock_models
      const existingModels = parseDockModels(match.dock_models);
      const newModels = parseDockModels(dockModels);
      const allModels = [...new Set([...existingModels, ...newModels])].sort();
      const dockModelsStr = allModels.length > 0 ? allModels.join(', ') : match.dock_models;

      // dock_verified: upgrade only (null→true, never true→false)
      const dockVerified = match.dock_verified === true ? true : (newVerifications.length > 0 ? true : match.dock_verified);

      // Website/LinkedIn: keep existing, fill if null
      const mergedWebsite = match.website || website;
      const mergedLinkedin = match.linkedin || linkedin;

      // Notes: append if new
      const mergedNotes = match.notes
        ? (notes && !match.notes.includes(notes.substring(0, 30)) ? match.notes + ' | Claude: ' + notes : match.notes)
        : (notes || null);

      results.merge.push({
        existing: match.company_name,
        csv: rawName,
        normName,
        matchMethod,
        changes: {
          source_types: `${existingSources.join(',')} → ${mergedSources.join(',')}`,
          verifications: `${existingVerifications.length} → ${mergedVerifications.length} (+${newVerifications.length})`,
          dock_verified: `${match.dock_verified} → ${dockVerified}`,
          dock_models: `${match.dock_models || 'null'} → ${dockModelsStr}`,
          website: match.website ? '(kept)' : (website || '(both null)'),
          linkedin: match.linkedin ? '(kept)' : (linkedin || '(both null)'),
          notes: mergedNotes !== match.notes ? 'updated' : '(kept)',
        },
        newVerifications: newVerifications.map(v => ({ url: v.url, note: v.note })),
        updatePayload: {
          source_types: mergedSources,
          verifications: mergedVerifications,
          dock_verified: dockVerified,
          dock_models: dockModelsStr,
          website: mergedWebsite,
          linkedin: mergedLinkedin,
          notes: mergedNotes,
          role: match.role || role || null,
          updated_at: new Date().toISOString(),
        },
        id: match.id,
      });
    } else {
      // ── NEW INSERT ──
      results.insert.push({
        company_name: rawName,
        normName,
        domain,
        website,
        linkedin,
        dockModels,
        role,
        verifications: newVerifications,
        notes,
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
    console.log(`\n${m.csv} → matches "${m.existing}" (${m.matchMethod})`);
    console.log(`  source_types: ${m.changes.source_types}`);
    console.log(`  verifications: ${m.changes.verifications}`);
    console.log(`  dock_verified: ${m.changes.dock_verified}`);
    console.log(`  dock_models: ${m.changes.dock_models}`);
    console.log(`  website: ${m.changes.website}`);
    console.log(`  linkedin: ${m.changes.linkedin}`);
    for (const v of m.newVerifications) {
      console.log(`  + evidence: ${v.url}`);
      if (v.note) console.log(`    note: ${v.note}`);
    }
  }

  if (results.insert.length > 0) {
    console.log('\n── NEW INSERTS ──');
    for (const ins of results.insert) {
      console.log(`\n${ins.company_name} (${ins.normName})`);
      console.log(`  domain: ${ins.domain}, website: ${ins.website}`);
      console.log(`  dock_models: ${ins.dockModels}, role: ${ins.role}`);
      console.log(`  verifications: ${ins.verifications.length}`);
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
        linkedin: ins.linkedin,
        role: ins.role,
        imported_via: 'claude',
        import_batch: 'claude-fr-29Mar',
        source_types: ['claude'],
        dock_verified: ins.verifications.length > 0 ? true : null,
        dock_models: ins.dockModels,
        verifications: ins.verifications,
        notes: ins.notes || null,
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
