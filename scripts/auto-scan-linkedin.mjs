#!/usr/bin/env node
/**
 * Automated LinkedIn Company Posts Scanner
 *
 * Scans DJI resellers (B1–B7) + FlytBase partners (BFP) in small groups,
 * with random delays between groups to avoid LinkedIn rate limits.
 * All results logged to dji_resellers_linkedin_scan_log with batch tag.
 *
 * Usage:
 *   node scripts/auto-scan-linkedin.mjs                    # scan BFP + B1-B7
 *   node scripts/auto-scan-linkedin.mjs B4 B5              # scan specific batches
 *   node scripts/auto-scan-linkedin.mjs BFP                # scan only FlytBase partners
 *   node scripts/auto-scan-linkedin.mjs --resume            # skip already-scanned slugs
 *   node scripts/auto-scan-linkedin.mjs --dry-run           # show plan without executing
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(decodeURIComponent(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─── Config ─────────────────────────────────────────────────────────────────
const GROUP_SIZE = 3;                    // companies per API call
const DELAY_BETWEEN_GROUPS_MIN = 45_000; // 45s min between groups
const DELAY_BETWEEN_GROUPS_MAX = 75_000; // 75s max between groups
const API_BASE = 'http://localhost:3000';
const DEFAULT_BATCHES = ['BFP', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'];

// Scraping params (~25% increase from base)
const SCROLL_SECONDS = 56;
const MAX_POSTS_PER_COMPANY = 38;
const MAX_ARTICLES = 75;

// ─── Parse CLI args ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const resume = args.includes('--resume');
const batchArgs = args.filter((a) => /^B\w+$/i.test(a));
const targetBatches = batchArgs.length > 0 ? batchArgs.map((b) => b.toUpperCase()) : DEFAULT_BATCHES;

// ─── Helpers ────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay() {
  return DELAY_BETWEEN_GROUPS_MIN + Math.floor(Math.random() * (DELAY_BETWEEN_GROUPS_MAX - DELAY_BETWEEN_GROUPS_MIN));
}

function extractSlug(linkedinUrl) {
  if (!linkedinUrl) return null;
  const match = linkedinUrl.match(/linkedin\.com\/company\/([^/?#]+)/i);
  if (match?.[1]) return decodeURIComponent(match[1]).toLowerCase().replace(/\/+$/, '');
  return null;
}

function ts() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

// ─── Fetch FlytBase partners with LinkedIn ──────────────────────────────────
async function getFlytBasePartners() {
  const { data, error } = await db
    .from('flytbase_partners')
    .select('name, linkedin, country, region')
    .not('linkedin', 'is', null);
  if (error || !data) return [];
  return data
    .filter((p) => p.linkedin && extractSlug(p.linkedin))
    .map((p) => ({
      id: null,
      name: p.name,
      country: p.country || p.region || '',
      batch: 'BFP',
      linkedin_url: p.linkedin,
    }));
}

// ─── Fetch DJI resellers to scan ────────────────────────────────────────────
async function getResellersToScan(batches) {
  let allRows = [];
  let page = 0;
  while (true) {
    const { data, error } = await db
      .from('dji_resellers')
      .select('id, name, country, batch, linkedin_url')
      .in('batch', batches)
      .not('linkedin_url', 'is', null)
      .order('batch')
      .order('country')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw new Error(`DB query failed: ${error.message}`);
    if (!data?.length) break;
    allRows.push(...data);
    if (data.length < 1000) break;
    page++;
  }

  // Filter invalid URLs
  return allRows.filter((r) => {
    const slug = extractSlug(r.linkedin_url);
    return slug && !r.linkedin_url.startsWith('Pick');
  });
}

async function getCompaniesToScan() {
  const resellerBatches = targetBatches.filter((b) => b !== 'BFP');
  const includeBFP = targetBatches.includes('BFP');

  let allRows = [];

  // FlytBase partners (BFP) — benchmark batch
  let partnerSlugs = new Set();
  let partnerNames = [];
  if (includeBFP) {
    const partners = await getFlytBasePartners();
    allRows.push(...partners);
    partners.forEach((p) => {
      const slug = extractSlug(p.linkedin_url);
      if (slug) partnerSlugs.add(slug);
      if (p.name) partnerNames.push(p.name.toLowerCase());
    });
    console.log(`FlytBase partners (BFP): ${partners.length} with LinkedIn`);
  } else {
    // Still load partner names for exclusion from other batches
    const { data: partners } = await db.from('flytbase_partners').select('name, linkedin');
    if (partners?.length) {
      for (const p of partners) {
        if (p.linkedin) { const slug = extractSlug(p.linkedin); if (slug) partnerSlugs.add(slug); }
        if (p.name) partnerNames.push(p.name.toLowerCase());
      }
    }
  }

  // DJI resellers (B1–B7)
  if (resellerBatches.length > 0) {
    let resellers = await getResellersToScan(resellerBatches);

    // Exclude FlytBase partners from reseller batches
    const before = resellers.length;
    resellers = resellers.filter((r) => {
      const slug = extractSlug(r.linkedin_url);
      if (slug && partnerSlugs.has(slug)) return false;
      const nameLower = r.name.toLowerCase();
      return !partnerNames.some((pn) => nameLower.includes(pn) || pn.includes(nameLower));
    });
    const excluded = before - resellers.length;
    if (excluded > 0) console.log(`Excluded ${excluded} FlytBase partners from reseller batches`);

    allRows.push(...resellers);
  }

  // Deduplicate by slug
  const seen = new Set();
  allRows = allRows.filter((r) => {
    const slug = extractSlug(r.linkedin_url);
    if (!slug || seen.has(slug)) return false;
    seen.add(slug);
    return true;
  });

  return allRows;
}

async function getAlreadyScanned() {
  let all = [];
  let page = 0;
  while (true) {
    const { data, error } = await db
      .from('dji_resellers_linkedin_scan_log')
      .select('slug')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error || !data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    page++;
  }
  return new Set(all.map((r) => r.slug));
}

// ─── Scan a group of companies ──────────────────────────────────────────────
async function scanGroup(slugs, batchTag, groupNum, totalGroups) {
  const startTime = Date.now();
  console.log(`\n[${ts()}] Group ${groupNum}/${totalGroups} [${batchTag}]: ${slugs.join(', ')}`);

  try {
    const res = await fetch(`${API_BASE}/api/collect-linkedin/company-posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companySlugs: slugs,
        maxPostsPerCompany: MAX_POSTS_PER_COMPANY,
        scrollSeconds: SCROLL_SECONDS,
        maxArticles: MAX_ARTICLES,
        headless: true,
        _batchTag: batchTag, // passed through for logging
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`  ERROR HTTP ${res.status}: ${text.substring(0, 200)}`);
      return { success: false, slugs, batchTag, error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const perCompany = data.perCompany ?? [];

    for (const pc of perCompany) {
      const signal = pc.dockMatches > 0 ? ' *** DOCK SIGNAL ***' : '';
      const kw = `DJI:${pc.djiCount ?? 0} DJI-Dock:${pc.dockMatches} Dock:${pc.dockCount ?? 0} DIaB:${pc.diabCount ?? 0}`;
      console.log(`  ${pc.slug}: ${pc.postsFound} posts | ${kw}${signal}`);
    }
    console.log(`  Completed in ${elapsed}s | Total articles: ${data.count}`);

    return { success: true, slugs, batchTag, perCompany, totalArticles: data.count };
  } catch (err) {
    console.error(`  FAILED: ${err.message}`);
    return { success: false, slugs, batchTag, error: err.message };
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== LinkedIn Auto-Scanner ===');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Target batches: ${targetBatches.join(', ')}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'} | Resume: ${resume}`);
  console.log(`Scroll: ${SCROLL_SECONDS}s | Posts/company: ${MAX_POSTS_PER_COMPANY} | Max articles: ${MAX_ARTICLES}`);
  console.log(`Group size: ${GROUP_SIZE} | Delay: ${DELAY_BETWEEN_GROUPS_MIN / 1000}-${DELAY_BETWEEN_GROUPS_MAX / 1000}s\n`);

  // Fetch companies
  const companies = await getCompaniesToScan();
  console.log(`\nTotal: ${companies.length} companies to scan`);

  // Batch breakdown
  const batchCounts = {};
  companies.forEach((r) => { batchCounts[r.batch] = (batchCounts[r.batch] || 0) + 1; });
  Object.entries(batchCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([batch, count]) => console.log(`  ${batch}: ${count} companies`));

  // Filter already scanned if --resume
  let toScan = companies;
  if (resume) {
    const scanned = await getAlreadyScanned();
    toScan = companies.filter((r) => !scanned.has(extractSlug(r.linkedin_url)));
    console.log(`\nAlready scanned: ${companies.length - toScan.length} | Remaining: ${toScan.length}`);
  }

  if (toScan.length === 0) {
    console.log('\nAll companies already scanned. Nothing to do.');
    return;
  }

  // Build groups of 3, keeping batch together
  const groups = [];
  let currentBatch = null;
  let currentGroup = [];
  for (const company of toScan) {
    // Start new group if batch changes or group is full
    if (currentBatch !== company.batch && currentGroup.length > 0) {
      groups.push({ batch: currentBatch, companies: currentGroup });
      currentGroup = [];
    }
    currentBatch = company.batch;
    currentGroup.push(company);
    if (currentGroup.length >= GROUP_SIZE) {
      groups.push({ batch: currentBatch, companies: currentGroup });
      currentGroup = [];
    }
  }
  if (currentGroup.length > 0) {
    groups.push({ batch: currentBatch, companies: currentGroup });
  }

  // Estimate time
  const avgGroupTime = GROUP_SIZE * 65 + 60; // ~65s per company + 60s delay
  const estMinutes = Math.ceil((groups.length * avgGroupTime) / 60);
  console.log(`\n${groups.length} groups | Est. time: ~${estMinutes} min (~${(estMinutes / 60).toFixed(1)} hours)`);

  if (dryRun) {
    console.log('\n=== DRY RUN — Plan ===');
    groups.forEach((g, i) => {
      const slugs = g.companies.map((r) => extractSlug(r.linkedin_url));
      const names = g.companies.map((r) => `${r.name} (${r.country})`);
      console.log(`\nGroup ${i + 1} [${g.batch}]: ${slugs.join(', ')}`);
      names.forEach((n) => console.log(`  - ${n}`));
    });
    console.log(`\nTo execute: remove --dry-run flag`);
    return;
  }

  // Execute groups
  console.log('\n=== Starting scans ===\n');
  const results = [];
  let totalDockSignals = 0;
  let totalPostsScraped = 0;
  let totalErrors = 0;

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const slugs = g.companies.map((r) => extractSlug(r.linkedin_url));

    const result = await scanGroup(slugs, g.batch, i + 1, groups.length);
    results.push(result);

    if (result.success) {
      for (const pc of result.perCompany ?? []) {
        totalPostsScraped += pc.postsFound;
        if (pc.dockMatches > 0) totalDockSignals++;
      }
    } else {
      totalErrors++;
      // Log failed slugs so --resume can skip them
      console.log(`  Continuing despite error (${totalErrors} total errors so far)...`);
    }

    // Delay between groups (skip after last)
    if (i < groups.length - 1) {
      const delay = randomDelay();
      const progress = ((i + 1) / groups.length * 100).toFixed(0);
      console.log(`  [${progress}%] Waiting ${(delay / 1000).toFixed(0)}s before next group...`);
      await sleep(delay);
    }
  }

  // ─── Summary ────────────────────────────────────────────────────────────────
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log('\n' + '='.repeat(70));
  console.log('=== SCAN COMPLETE ===');
  console.log(`Finished: ${new Date().toISOString()}`);
  console.log(`Groups: ${succeeded} succeeded, ${failed} failed out of ${groups.length}`);
  console.log(`Companies scanned: ${toScan.length}`);
  console.log(`Total posts scraped: ${totalPostsScraped}`);
  console.log(`DJI Dock signals: ${totalDockSignals}`);

  // Per-batch summary
  console.log('\n--- Per-Batch Summary ---');
  const batchStats = {};
  for (const r of results) {
    if (!r.success) continue;
    for (const pc of r.perCompany ?? []) {
      const b = r.batchTag;
      if (!batchStats[b]) batchStats[b] = { companies: 0, posts: 0, dockSignals: 0, dockMatches: 0 };
      batchStats[b].companies++;
      batchStats[b].posts += pc.postsFound;
      if (pc.dockMatches > 0) { batchStats[b].dockSignals++; batchStats[b].dockMatches += pc.dockMatches; }
    }
  }
  console.log('Batch      Companies   Posts   Dock Signals   Dock Matches');
  console.log('-'.repeat(60));
  for (const [batch, s] of Object.entries(batchStats).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(
      `${batch.padEnd(10)} ${String(s.companies).padEnd(11)} ${String(s.posts).padEnd(7)} ${String(s.dockSignals).padEnd(14)} ${s.dockMatches}`
    );
  }

  if (totalDockSignals > 0) {
    console.log('\n*** DOCK SIGNALS FOUND ***');
    for (const r of results) {
      if (!r.success) continue;
      for (const pc of r.perCompany ?? []) {
        if (pc.dockMatches > 0) {
          console.log(`  [${r.batchTag}] ${pc.slug}: ${pc.dockMatches} dock matches in ${pc.postsFound} posts`);
        }
      }
    }
  }

  if (failed > 0) {
    console.log('\nFailed groups (use --resume to retry):');
    results.filter((r) => !r.success).forEach((r) => {
      console.log(`  [${r.batchTag}] ${r.slugs.join(', ')}: ${r.error}`);
    });
  }

  console.log('='.repeat(70));
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
