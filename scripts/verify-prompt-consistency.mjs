/**
 * Dry-run verification: checks ALL LLM prompts for consistency.
 * Run with: node scripts/verify-prompt-consistency.mjs
 */

// Dynamically import the TS module by compiling on the fly
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the raw TS files and extract string content
const scoringPromptTs = readFileSync(resolve(__dirname, '../src/lib/scoring-prompt.ts'), 'utf-8');
const enrichmentPromptTs = readFileSync(resolve(__dirname, '../src/lib/enrichment-prompt.ts'), 'utf-8');
const backfillScript = readFileSync(resolve(__dirname, 'backfill-null-industry.mjs'), 'utf-8');
const reclassifyScript = readFileSync(resolve(__dirname, 'reclassify-industry.mjs'), 'utf-8');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push({ name, detail });
    console.log(`  ✗ ${name}: ${detail}`);
  }
}

console.log('═══════════════════════════════════════════════════════════');
console.log('  PROMPT CONSISTENCY VERIFICATION');
console.log('═══════════════════════════════════════════════════════════\n');

// ── 1. OEM LIST (14 names) ────────────────────────────────────────────────
console.log('1. OEM LIST (should be 14 names everywhere)');
const OEM_14 = ['DJI', 'Skydio', 'Autel', 'Parrot', 'senseFly', 'Zipline', 'Wing', 'Joby', 'Manna', 'Matternet', 'EHang', 'Flytrex', 'Elbit Systems', 'AeroVironment'];

// Check that the canonical OEM_LIST constant contains all 14
for (const oem of OEM_14) {
  check(`OEM_LIST contains "${oem}"`, scoringPromptTs.includes(oem), `Missing from scoring-prompt.ts`);
}

// Check enrichment prompt has all 14
for (const oem of OEM_14) {
  check(`Enrichment has "${oem}"`, enrichmentPromptTs.includes(oem), `Missing from enrichment-prompt.ts`);
}

// Check that LEGACY prompt no longer has the old 8-name list
check('Legacy LI no longer has AgEagle', !scoringPromptTs.includes('AgEagle'), 'Old OEM "AgEagle" still present');
check('Legacy LI no longer has Wingtra', !scoringPromptTs.includes('Wingtra'), 'Old OEM "Wingtra" still present');
check('Legacy LI no longer has Freefly', !scoringPromptTs.includes('Freefly'), 'Old OEM "Freefly" still present');
console.log('');

// ── 2. SCORING BANDS (4-band: 0-24, 25-49, 50-74, 75-100) ──────────────
console.log('2. SCORING BANDS (should be 4-band scale everywhere)');
check('No 5-band scale (90-100)', !scoringPromptTs.includes('90-100'), 'Found old "90-100" band');
check('No 5-band scale (70-89)', !scoringPromptTs.includes('70-89'), 'Found old "70-89" band');
check('No 5-band scale (50-69)', !scoringPromptTs.includes('50-69'), 'Found old "50-69" band');
check('No 5-band scale (30-49)', !scoringPromptTs.includes('30-49'), 'Found old "30-49" band');
check('No 5-band scale (0-29)', !scoringPromptTs.includes('0-29'), 'Found old "0-29" band');
check('Has 75-100 band', scoringPromptTs.includes('75-100'), 'Missing "75-100" band');
check('Has 50-74 band', scoringPromptTs.includes('50-74'), 'Missing "50-74" band');
check('Has 25-49 band', scoringPromptTs.includes('25-49'), 'Missing "25-49" band');
check('Has 0-24 band', scoringPromptTs.includes('0-24'), 'Missing "0-24" band');
console.log('');

// ── 3. DROP THRESHOLD (< 25 everywhere) ──────────────────────────────────
console.log('3. DROP THRESHOLD (should be < 25 everywhere)');
check('No "below 30" in scoring-prompt.ts', !scoringPromptTs.includes('below 30'), 'Found "below 30" threshold');
check('No "score < 30" in formatters', !scoringPromptTs.includes('score < 30'), 'Found "score < 30" in formatter');
// Check all drop_reason references use 25
const dropMatches = scoringPromptTs.match(/score\s*<\s*(\d+)/g) || [];
const allDrop25 = dropMatches.every(m => m.includes('25'));
check(`All formatter drop thresholds use 25 (found: ${dropMatches.join(', ')})`, allDrop25, 'Not all thresholds are 25');
check('SHARED_RULES has "below 25"', scoringPromptTs.includes('below 25'), 'SHARED_RULES missing "below 25"');
console.log('');

// ── 4. SIGNAL TYPES (5 types: DEPLOYMENT, CONTRACT, PARTNERSHIP, EXPANSION, OTHER)
console.log('4. SIGNAL TYPES (should be 5 types only)');
check('No TENDER in prompts', !scoringPromptTs.includes('"TENDER"'), 'Found "TENDER" signal type');
check('No FUNDING in prompts', !scoringPromptTs.includes('"FUNDING"'), 'Found "FUNDING" signal type');
check('No REGULATION in prompts', !scoringPromptTs.includes('"REGULATION"'), 'Found "REGULATION" signal type');
check('SIGNAL_TYPE_ENUM has 5 types', scoringPromptTs.includes('"DEPLOYMENT"|"CONTRACT"|"PARTNERSHIP"|"EXPANSION"|"OTHER"'), 'SIGNAL_TYPE_ENUM wrong');
// Check formatLinkedInBatchPrompt uses the same 5
check('Legacy formatter uses 5 signal types', scoringPromptTs.includes('SIGNAL_TYPE_ENUM'), 'Legacy formatter not using shared constant');
console.log('');

// ── 5. COMPANY FIELD (never buyer) ───────────────────────────────────────
console.log('5. COMPANY FIELD (should say NOT buyer everywhere)');
check('No "set company to the buyer" in P2', !scoringPromptTs.includes('set company to the buyer'), 'P2 still allows buyer in company field');
check('Formatters say NOT buyer/end-client', scoringPromptTs.includes('NOT the buyer/end-client'), 'Formatters missing buyer exclusion');
check('P2 company rule says NOT buyer', scoringPromptTs.includes('NOT the buyer/end-client'), 'P2 missing buyer exclusion');
console.log('');

// ── 6. FLYTBASE RULE ─────────────────────────────────────────────────────
console.log('6. FLYTBASE RULE (should be in all scoring + enrichment prompts)');
// Count FlytBase rule occurrences in scoring-prompt.ts
const flytbaseMatches = (scoringPromptTs.match(/FLYTBASE.*NEVER.*appear|FlytBase must NEVER appear/g) || []).length;
check(`FlytBase rule appears ${flytbaseMatches} times in scoring-prompt.ts (expect >= 4)`, flytbaseMatches >= 4, `Only ${flytbaseMatches} occurrences`);
check('FlytBase rule in enrichment prompt', enrichmentPromptTs.includes('FlytBase must NEVER appear'), 'Missing from enrichment-prompt.ts');
console.log('');

// ── 7. MAKER-OPERATOR HYBRID ─────────────────────────────────────────────
console.log('7. MAKER-OPERATOR HYBRID RULE (should be everywhere)');
check('In scoring-prompt.ts (SHARED_RULES)', scoringPromptTs.includes('MAKER-OPERATOR HYBRID'), 'Missing from scoring-prompt.ts');
check('In enrichment-prompt.ts', enrichmentPromptTs.includes('MAKER-OPERATOR HYBRID') || enrichmentPromptTs.includes('both manufactures drones AND commercially deploys'), 'Missing from enrichment-prompt.ts');
console.log('');

// ── 8. INDUSTRY TAXONOMY ─────────────────────────────────────────────────
console.log('8. INDUSTRY TAXONOMY (should be consistent)');
const canonicalVerticals = ['Energy & Utilities', 'Public Safety & Emergency Response', 'Oil & Gas / Industrial Assets', 'Mining & Natural Resources', 'Construction & Infrastructure', 'Ports, Maritime & Logistics Hubs', 'Agriculture & Forestry', 'Perimeter Security & Smart Facilities', 'Water & Environmental Utilities'];
for (const v of canonicalVerticals) {
  check(`Scoring has "${v}"`, scoringPromptTs.includes(v), `Missing from scoring-prompt.ts`);
}
// Check scripts match
for (const v of canonicalVerticals) {
  check(`Backfill has "${v}"`, backfillScript.includes(v), `Missing from backfill script`);
  check(`Reclassify has "${v}"`, reclassifyScript.includes(v), `Missing from reclassify script`);
}
// Check no "Consumer Electronics" or "Automotive" or "Market Analysis"
check('No "Consumer Electronics" in reclassify', !reclassifyScript.includes('Consumer Electronics'), 'Old taxonomy entry still present');
check('No "Automotive" in scripts', !backfillScript.includes('Automotive') && !reclassifyScript.includes('Automotive'), 'Old taxonomy entry still present');
check('No "Market Analysis" in scripts', !backfillScript.includes('Market Analysis') && !reclassifyScript.includes('Market Analysis'), 'Old taxonomy entry still present');
console.log('');

// ── 9. INDUSTRY FIELD IN ALL FORMATTERS ──────────────────────────────────
console.log('9. INDUSTRY FIELD (should be in all formatters, not conditional)');
check('No campaignMode conditional for industry', !scoringPromptTs.includes("campaignMode\n    ? `\\n    \"industry\""), 'Industry field still conditional on campaignMode');
check('INDUSTRY_JSON_FIELD used in formatBatchScoringPrompt', scoringPromptTs.includes('${INDUSTRY_JSON_FIELD}'), 'formatBatchScoringPrompt missing industry');
check('Industry in SCORING_SYSTEM_PROMPT', scoringPromptTs.includes('${INDUSTRY_TAXONOMY}'), 'SCORING_SYSTEM_PROMPT missing industry taxonomy');
console.log('');

// ── 10. ENTITY TYPES IN JSON SCHEMA ──────────────────────────────────────
console.log('10. ENTITY TYPES (should be buyer|operator|regulator|si|oem — no "partner")');
const entityTypeMatches = scoringPromptTs.match(/"type":\s*"[^"]*"/g) || [];
check('No "partner" in entity type enum', !scoringPromptTs.includes('"partner"|'), 'Found "partner" in entity types');
check('Enrichment has buyer|operator|regulator|si|oem', enrichmentPromptTs.includes('buyer|operator|regulator|si|oem'), 'Enrichment entity types wrong');
console.log('');

// ── SUMMARY ──────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════');
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════');

if (failures.length > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) {
    console.log(`  ✗ ${f.name}: ${f.detail}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
