#!/usr/bin/env node

// enrich_websites.js
// Enriches SIRENE data with missing websites using multiple sources
// Input: step6_batch1.jsonl (1000+ companies, many with siteWeb: null)
// Output: step6_batch1_enriched.jsonl (same companies with websites populated)
// Strategy: Pappers API > Google Custom Search > LinkedIn > Direct domain guess

const fs = require('fs');
const axios = require('axios');
const https = require('https');

// Configuration
const CONFIG = {
  PAPPERS_API_KEY: process.env.PAPPERS_API_KEY || null, // Optional: https://www.pappers.fr/
  GOOGLE_CSE_API_KEY: process.env.GOOGLE_CSE_API_KEY || null,
  GOOGLE_CSE_CX: process.env.GOOGLE_CSE_CX || null,
  TIMEOUT: 5000,
  BATCH_SIZE: 50, // Process in batches to avoid rate limiting
  CACHE_FILE: 'website_cache.json', // Cache successful lookups
};

// Load cache
let cache = {};
if (fs.existsSync(CONFIG.CACHE_FILE)) {
  cache = JSON.parse(fs.readFileSync(CONFIG.CACHE_FILE, 'utf-8'));
  console.log(`📂 Loaded ${Object.keys(cache).length} cached websites`);
}

// Strategy 1: Pappers API (most reliable, requires API key)
async function enrichFromPappers(siren, company_name) {
  if (!CONFIG.PAPPERS_API_KEY) return null;
  
  try {
    const response = await axios.get('https://api.pappers.fr/v2/company', {
      params: {
        siret: `${siren}00001`, // Convert SIREN to SIRET (add 5-digit establishment code)
        api_token: CONFIG.PAPPERS_API_KEY,
      },
      timeout: CONFIG.TIMEOUT,
    });
    
    const website = response.data?.website_url;
    if (website) {
      cache[siren] = { website, source: 'pappers' };
      return website;
    }
  } catch (err) {
    // Silently fail and move to next strategy
  }
  
  return null;
}

// Strategy 2: Google Custom Search (requires API key + CSE ID)
async function enrichFromGoogle(siren, company_name) {
  if (!CONFIG.GOOGLE_CSE_API_KEY || !CONFIG.GOOGLE_CSE_CX) return null;
  
  try {
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        q: `"${company_name}" site:.fr website OR site`,
        cx: CONFIG.GOOGLE_CSE_CX,
        key: CONFIG.GOOGLE_CSE_API_KEY,
        num: 1, // Only need first result
      },
      timeout: CONFIG.TIMEOUT,
    });
    
    if (response.data?.items?.length > 0) {
      const link = response.data.items[0].link;
      // Extract domain from URL
      const domain = new URL(link).hostname.replace('www.', '');
      cache[siren] = { website: domain, source: 'google' };
      return domain;
    }
  } catch (err) {
    // Rate limit or API error
  }
  
  return null;
}

// Strategy 3: LinkedIn Company Page Lookup (heuristic)
async function enrichFromLinkedIn(siren, company_name) {
  // LinkedIn is scrape-protected, but we can guess the company page URL
  // Format: linkedin.com/company/[company-slug]/
  
  try {
    const slug = company_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    
    // Check if LinkedIn page exists (HEAD request, very fast)
    const response = await axios.head(
      `https://www.linkedin.com/company/${slug}/`,
      {
        timeout: 3000,
        maxRedirects: 0,
        validateStatus: (status) => status < 400,
      }
    );
    
    if (response.status === 200 || response.status === 301) {
      // LinkedIn page exists, but this doesn't give us company website
      // Return null and let Strategy 4 guess the domain
      return null;
    }
  } catch (err) {
    // LinkedIn page doesn't exist or timeout
  }
  
  return null;
}

// Strategy 4: Direct Domain Guess (heuristic - lowest reliability but always works)
function enrichFromDomainGuess(company_name) {
  // Heuristic 1: Company name → domain.fr
  const domain1 = company_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 30); // Cap at 30 chars (DNS limit)
  
  // Heuristic 2: Acronym guessing (ACME Corp → acmecorp.fr)
  const words = company_name.split(/\s+/).filter(w => w.length > 0);
  const acronym = words.map(w => w[0]).join('').toLowerCase();
  const domain2 = acronym.length >= 3 ? acronym : null;
  
  // Return guesses in order of confidence (domain1 > domain2)
  return { domain1, domain2 };
}

// Main enrichment pipeline
async function enrichCompany(company, attempt_num = 1) {
  const { siren, name, siteWeb } = company;
  
  // If siteWeb already exists, don't enrich
  if (siteWeb && siteWeb !== null && siteWeb !== '') {
    return company; // Keep original
  }
  
  // Check cache first
  if (cache[siren]) {
    return { ...company, siteWeb: cache[siren].website, siteWeb_source: cache[siren].source };
  }
  
  // Try strategies in order
  let enrichedWebsite = null;
  let source = null;
  
  // Strategy 1: Pappers (most reliable)
  enrichedWebsite = await enrichFromPappers(siren, name);
  if (enrichedWebsite) return { ...company, siteWeb: enrichedWebsite, siteWeb_source: 'pappers' };
  
  // Strategy 2: Google Custom Search
  enrichedWebsite = await enrichFromGoogle(siren, name);
  if (enrichedWebsite) return { ...company, siteWeb: enrichedWebsite, siteWeb_source: 'google_cse' };
  
  // Strategy 3: LinkedIn check (informational, doesn't give us website)
  await enrichFromLinkedIn(siren, name);
  
  // Strategy 4: Domain guess
  const domainGuess = enrichFromDomainGuess(name);
  if (domainGuess.domain1) {
    return {
      ...company,
      siteWeb: `${domainGuess.domain1}.fr`,
      siteWeb_source: 'domain_guess_primary',
    };
  } else if (domainGuess.domain2) {
    return {
      ...company,
      siteWeb: `${domainGuess.domain2}.fr`,
      siteWeb_source: 'domain_guess_acronym',
    };
  }
  
  // All strategies failed - still include company but mark as unenrichable
  return { ...company, siteWeb: null, siteWeb_source: 'unenrichable' };
}

// Batch processor
async function processBatch(companies, batchNum, totalBatches) {
  console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${companies.length} companies)`);
  
  const results = [];
  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    const enriched = await enrichCompany(company);
    results.push(enriched);
    
    // Progress indicator
    if ((i + 1) % 10 === 0) {
      process.stdout.write(`  ✓ ${i + 1}/${companies.length}\r`);
    }
  }
  
  console.log(`  ✅ Batch ${batchNum} complete`);
  return results;
}

async function main() {
  const inputFile = process.argv[2] || 'step6_batch1.jsonl';
  const outputFile = process.argv[3] || 'step6_batch1_enriched.jsonl';

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Error: ${inputFile} not found.`);
    process.exit(1);
  }
  
  // Parse input
  const lines = fs
    .readFileSync(inputFile, 'utf-8')
    .trim()
    .split('\n')
    .filter(line => line.length > 0);
  
  const companies = lines.map((line, idx) => {
    try {
      return JSON.parse(line);
    } catch (e) {
      console.warn(`⚠️  Skipping malformed line ${idx + 1}: ${line.substring(0, 50)}`);
      return null;
    }
  }).filter(c => c !== null);
  
  console.log(`\n🚀 Starting website enrichment...`);
  console.log(`📊 Total companies: ${companies.length}`);
  console.log(`🔧 Enrichment strategies enabled:`);
  console.log(`   ${CONFIG.PAPPERS_API_KEY ? '✅' : '⏭️'} Pappers API`);
  console.log(`   ${CONFIG.GOOGLE_CSE_API_KEY ? '✅' : '⏭️'} Google Custom Search`);
  console.log(`   ✅ LinkedIn check`);
  console.log(`   ✅ Domain guess heuristic`);
  console.log(``);
  
  // Process in batches
  const batchSize = CONFIG.BATCH_SIZE;
  const totalBatches = Math.ceil(companies.length / batchSize);
  const enrichedCompanies = [];
  
  for (let i = 0; i < companies.length; i += batchSize) {
    const batch = companies.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const batchResults = await processBatch(batch, batchNum, totalBatches);
    enrichedCompanies.push(...batchResults);
    
    // Save cache after each batch
    fs.writeFileSync(CONFIG.CACHE_FILE, JSON.stringify(cache, null, 2));
  }
  
  // Stats
  const withOriginalSiteWeb = enrichedCompanies.filter(c => c.siteWeb_source === 'sirene').length;
  const enrichedFromPappers = enrichedCompanies.filter(c => c.siteWeb_source === 'pappers').length;
  const enrichedFromGoogle = enrichedCompanies.filter(c => c.siteWeb_source === 'google_cse').length;
  const enrichedFromGuess = enrichedCompanies.filter(
    c => c.siteWeb_source?.includes('domain_guess')
  ).length;
  const unenrichable = enrichedCompanies.filter(c => c.siteWeb_source === 'unenrichable').length;
  
  // Write output
  const output = enrichedCompanies
    .filter(c => c.siteWeb !== null) // Only keep companies WITH websites (enriched or original)
    .map(c => {
      // Add back original fields for crawler compatibility
      return {
        siren: c.siren,
        name: c.name,
        naf: c.naf,
        headcount: c.headcount,
        siteWeb: c.siteWeb,
        creationDate: c.creationDate,
        siteWeb_source: c.siteWeb_source,
      };
    });
  
  fs.writeFileSync(
    outputFile,
    output.map(c => JSON.stringify(c)).join('\n')
  );
  
  // Report
  console.log(`\n📊 ENRICHMENT COMPLETE\n`);
  console.log(`✅ Original SIRENE websites:  ${withOriginalSiteWeb}`);
  console.log(`📍 Enriched from Pappers:     ${enrichedFromPappers}`);
  console.log(`🔍 Enriched from Google:      ${enrichedFromGoogle}`);
  console.log(`💡 Enriched from domain guess: ${enrichedFromGuess}`);
  console.log(`❌ Could not enrich:          ${unenrichable}`);
  console.log(`\n📁 Output file: ${outputFile} (${output.length} companies with websites)`);
  console.log(`💾 Cache saved: ${CONFIG.CACHE_FILE}`);
  console.log(`\n✨ Next step: Run the crawler`);
  console.log(`   node crawl_dji_dock_exact.js ${outputFile}\n`);
}

main().catch(err => {
  console.error('❌ Enrichment failed:', err.message);
  process.exit(1);
});
