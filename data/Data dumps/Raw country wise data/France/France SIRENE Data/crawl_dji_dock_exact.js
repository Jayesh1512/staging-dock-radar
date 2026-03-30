#!/usr/bin/env node

// crawl_dji_dock_exact.js
// Crawls websites from Step 6.5 and filters for exact "DJI Dock" phrase
// Outputs: step7_passes.json (found DJI Dock) and step7_fails_sample.json (didn't find it)

const fs = require('fs');
const axios = require('axios');
const { URL } = require('url');

const EXACT_KEYWORD = 'dji dock'; // Only this phrase, no alternatives

async function crawlCompany(company, index, total) {
  const { siren, name, siteWeb } = company;

  if (!siteWeb) {
    return {
      siren,
      name,
      siteWeb,
      match: false,
      reason: 'no_website',
      quote: null,
      crawlUrl: null,
    };
  }

  try {
    // Validate and construct URL
    let url;
    if (siteWeb.startsWith('http://') || siteWeb.startsWith('https://')) {
      url = siteWeb;
    } else {
      url = `https://${siteWeb}`;
    }

    // Validate URL format
    new URL(url); // Will throw if invalid

    const response = await axios.get(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (DJI Dock Discovery Bot)',
      },
      maxRedirects: 3,
    });

    const text = response.data.toLowerCase();

    // Search for EXACT phrase "dji dock"
    if (text.includes(EXACT_KEYWORD)) {
      // Extract context (100 chars before and after)
      const index = text.indexOf(EXACT_KEYWORD);
      const contextStart = Math.max(0, index - 100);
      const contextEnd = Math.min(text.length, index + EXACT_KEYWORD.length + 100);
      const quote = text.substring(contextStart, contextEnd).trim();

      return {
        siren,
        name,
        siteWeb,
        crawlUrl: url,
        match: true,
        reason: 'dji_dock_found',
        quote: `...${quote}...`,
      };
    } else {
      return {
        siren,
        name,
        siteWeb,
        crawlUrl: url,
        match: false,
        reason: 'no_dji_dock_phrase',
        quote: null,
      };
    }
  } catch (error) {
    const errorMsg = error.code || error.message || 'unknown_error';
    return {
      siren,
      name,
      siteWeb,
      match: false,
      reason: `crawl_error: ${errorMsg}`,
      quote: null,
      crawlUrl: siteWeb ? (siteWeb.startsWith('http') ? siteWeb : `https://${siteWeb}`) : null,
    };
  }
}

async function main() {
  // Read filtered Step 6.5 companies
  if (!fs.existsSync('step6_5_with_website.jsonl')) {
    console.error('❌ Error: step6_5_with_website.jsonl not found. Run apply_prefilters_step6_5.sh first.');
    process.exit(1);
  }

  const lines = fs
    .readFileSync('step6_5_with_website.jsonl', 'utf-8')
    .trim()
    .split('\n')
    .filter((line) => line.length > 0);

  const companies = lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch (e) {
      console.warn(`⚠️  Skipping malformed line: ${line.substring(0, 50)}`);
      return null;
    }
  }).filter(c => c !== null);

  console.log(`\n🚀 Starting crawl of ${companies.length} companies...`);
  console.log(`⏱️  Estimated time: ${Math.ceil(companies.length / 10)} seconds (10 sites/sec)\n`);

  const results = [];
  let passCount = 0;
  let failCount = 0;

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    const result = await crawlCompany(company, i, companies.length);
    results.push(result);

    if (result.match) {
      passCount++;
      console.log(
        `[✅ ${passCount}/${i + 1}/${companies.length}] ${company.name.substring(0, 40)} | ${company.siteWeb}`
      );
    } else {
      failCount++;
      if (i % 50 === 0 && i > 0) {
        console.log(`[⏳ ${i}/${companies.length}] Processing... (${passCount} matches so far)`);
      }
    }

    // Rate limiting: be respectful to websites (10 concurrent is good)
    if (i % 10 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay every 10 requests
    }
  }

  // Split results into passes and fails
  const matches = results.filter((r) => r.match);
  const fails = results.filter((r) => !r.match);

  // Save results
  fs.writeFileSync('step7_passes.json', JSON.stringify(matches, null, 2));
  fs.writeFileSync('step7_fails_sample.json', JSON.stringify(fails.slice(0, 100), null, 2));

  // Generate summary report
  const summary = {
    timestamp: new Date().toISOString(),
    totalCrawled: companies.length,
    passed: matches.length,
    failed: fails.length,
    passRate: ((matches.length / companies.length) * 100).toFixed(2) + '%',
    samples: {
      topPassesByName: matches.slice(0, 10).map((m) => ({ name: m.name, siren: m.siren, url: m.crawlUrl })),
      topFailsByName: fails.slice(0, 10).map((f) => ({ name: f.name, siren: f.siren, reason: f.reason })),
    },
  };

  fs.writeFileSync('step7_summary.json', JSON.stringify(summary, null, 2));

  console.log(`\n📊 STEP 7 CRAWL COMPLETE\n`);
  console.log(`✅ Passed (DJI Dock found): ${matches.length} companies`);
  console.log(`❌ Failed (no DJI Dock): ${fails.length} companies`);
  console.log(`📈 Pass rate: ${summary.passRate}\n`);
  console.log(`📁 Output files:`);
  console.log(`   • step7_passes.json (${matches.length} companies with "DJI Dock")`);
  console.log(`   • step7_fails_sample.json (sample of ${Math.min(100, fails.length)} failures)`);
  console.log(`   • step7_summary.json (summary report)\n`);
  console.log(`🔍 To verify results:`);
  console.log(`   1. Open step7_passes.json`);
  console.log(`   2. Pick 10 random companies`);
  console.log(`   3. Visit their URLs and search (Ctrl+F) for "DJI Dock"`);
  console.log(`   4. Confirm the quote matches\n`);
}

main().catch((err) => {
  console.error('❌ Crawl failed:', err.message);
  process.exit(1);
});
