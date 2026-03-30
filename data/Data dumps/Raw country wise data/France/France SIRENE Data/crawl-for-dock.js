#!/usr/bin/env node

/**
 * crawl-for-dock.js
 * 
 * Crawls company websites and searches for "DJI Dock" phrase
 * 
 * Input: bucket3_enriched.jsonl (companies with websites)
 * Output: bucket3_dock_results.json (companies with "DJI Dock" mention)
 * Time: ~2-3 minutes for 1,372 companies
 * 
 * Usage:
 *   node crawl-for-dock.js bucket3_enriched.jsonl
 */

const fs = require('fs');
const https = require('https');
const http = require('http');
const readline = require('readline');
const { URL } = require('url');

const EXACT_KEYWORD = 'dji dock';
const TIMEOUT = 8000;
const CONCURRENT_CRAWLS = 5;

async function crawlWebsite(company) {
  const { siren, name, siteWeb } = company;

  if (!siteWeb) {
    return {
      siren,
      name,
      siteWeb,
      match: false,
      reason: 'no_website',
      quote: null
    };
  }

  return new Promise((resolve) => {
    let url;
    try {
      if (siteWeb.startsWith('http')) {
        url = siteWeb;
      } else {
        url = `https://${siteWeb}`;
      }
      new URL(url); // Validate
    } catch (e) {
      return resolve({
        siren,
        name,
        siteWeb,
        match: false,
        reason: 'invalid_url',
        quote: null
      });
    }

    const timeoutHandle = setTimeout(() => {
      resolve({
        siren,
        name,
        siteWeb,
        match: false,
        reason: 'timeout',
        quote: null
      });
    }, TIMEOUT);

    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (DJI Dock Verification Bot)' },
      timeout: TIMEOUT
    }, (res) => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
        if (data.length > 1000000) {
          res.destroy(); // Stop if too large
        }
      });

      res.on('end', () => {
        clearTimeout(timeoutHandle);
        const text = data.toLowerCase();

        if (text.includes(EXACT_KEYWORD)) {
          const index = text.indexOf(EXACT_KEYWORD);
          const contextStart = Math.max(0, index - 100);
          const contextEnd = Math.min(text.length, index + EXACT_KEYWORD.length + 100);
          const quote = text.substring(contextStart, contextEnd).trim();

          resolve({
            siren,
            name,
            siteWeb,
            match: true,
            reason: 'dji_dock_found',
            quote: `...${quote}...`
          });
        } else {
          resolve({
            siren,
            name,
            siteWeb,
            match: false,
            reason: 'no_dji_dock_phrase',
            quote: null
          });
        }
      });
    }).on('error', (err) => {
      clearTimeout(timeoutHandle);
      resolve({
        siren,
        name,
        siteWeb,
        match: false,
        reason: `error: ${err.code || err.message}`,
        quote: null
      });
    });
  });
}

async function crawlForDock(inputFile) {
  console.log(`\n🕷️  Crawling websites for "DJI Dock"...\n`);
  console.log(`   Input: ${inputFile}\n`);

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ File not found: ${inputFile}`);
    process.exit(1);
  }

  // Read all companies
  const lines = fs.readFileSync(inputFile, 'utf-8')
    .trim()
    .split('\n')
    .filter(l => l.trim());

  const companies = lines.map(l => JSON.parse(l)).filter(c => c !== null);

  console.log(`   Total companies: ${companies.length.toLocaleString()}\n`);

  let crawled = 0;
  let matches = [];
  let failures = [];

  // Process in parallel batches
  for (let i = 0; i < companies.length; i += CONCURRENT_CRAWLS) {
    const batch = companies.slice(i, i + CONCURRENT_CRAWLS);
    const results = await Promise.all(batch.map(c => crawlWebsite(c)));

    results.forEach(result => {
      if (result.match) {
        matches.push(result);
      } else {
        failures.push(result);
      }
      crawled++;
    });

    // Progress
    if (crawled % 50 === 0) {
      const pct = ((crawled / companies.length) * 100).toFixed(1);
      process.stdout.write(`\r  ⏳ Progress: ${crawled}/${companies.length} (${pct}%) | Found: ${matches.length}`);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Write results
  const outputFile = inputFile.replace('.jsonl', '_dock_results.json');
  fs.writeFileSync(outputFile, JSON.stringify(matches, null, 2));

  const summaryFile = inputFile.replace('.jsonl', '_dock_summary.json');
  const summary = {
    timestamp: new Date().toISOString(),
    total_crawled: companies.length,
    with_dji_dock: matches.length,
    without_dji_dock: failures.length,
    match_rate: `${((matches.length / companies.length) * 100).toFixed(2)}%`,
    samples: {
      top_matches: matches.slice(0, 5),
      sample_failures: failures.slice(0, 5)
    }
  };
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));

  console.log(`\n\n✅ Crawl complete:\n`);
  console.log(`   Total crawled: ${companies.length.toLocaleString()}`);
  console.log(`   With "DJI Dock": ${matches.length.toLocaleString()} (${((matches.length/companies.length)*100).toFixed(1)}%)`);
  console.log(`   Without "DJI Dock": ${failures.length.toLocaleString()}\n`);
  console.log(`📁 Results: ${outputFile}`);
  console.log(`📊 Summary: ${summaryFile}\n`);
  console.log(`🔍 To verify results:`);
  console.log(`   1. Open ${outputFile}`);
  console.log(`   2. Pick random companies`);
  console.log(`   3. Visit their website`);
  console.log(`   4. Search (Ctrl+F) for "DJI Dock"\n`);
}

const inputFile = process.argv[2] || 'bucket3_enriched.jsonl';
crawlForDock(inputFile).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
