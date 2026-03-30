#!/usr/bin/env node

/**
 * enrich-companies.js
 * 
 * Enriches SIREN numbers with company names and websites
 * 
 * Input: bucket3_2023-2024_filtered.jsonl (SIREN numbers only)
 * Output: bucket3_enriched.jsonl (companies with names + websites)
 * Time: ~3-4 minutes for 1,372 companies
 * 
 * Usage:
 *   node enrich-companies.js bucket3_2023-2024_filtered.jsonl
 */

const fs = require('fs');
const readline = require('readline');
const https = require('https');

// Load API key from .env
require('dotenv').config();
const SIRENE_API_KEY = process.env.SIRENE_API_KEY;

if (!SIRENE_API_KEY) {
  console.error('❌ Error: SIRENE_API_KEY not found in .env');
  process.exit(1);
}

// Fetch company data from SIRENE API
async function lookupSirene(siren) {
  return new Promise((resolve) => {
    const url = `https://api.insee.fr/api-sirene/3.11/siren/${siren}`;
    
    const options = {
      headers: {
        'Authorization': `Bearer ${SIRENE_API_KEY}`,
        'X-INSEE-Api-Key-Integration': SIRENE_API_KEY,
        'Accept': 'application/json'
      },
      timeout: 5000
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.uniteLegale) {
            const company = parsed.uniteLegale;
            const period = (company.periodesUniteLegale && company.periodesUniteLegale.length > 0) ? company.periodesUniteLegale[0] : {};
            resolve({
              name: period.denominationUniteLegale || period.denominationUsuelle1UniteLegale || null,
              siteWeb: null, // V3.11 never returns websites natively
              naf: period.activitePrincipaleUniteLegale || null
            });
          } else {
            resolve({ name: null, siteWeb: null, naf: null });
          }
        } catch (e) {
          resolve({ name: null, siteWeb: null, naf: null });
        }
      });
    }).on('error', () => {
      resolve({ name: null, siteWeb: null, naf: null });
    });
  });
}

async function enrichCompanies(inputFile) {
  console.log(`\n📋 Enriching companies from: ${inputFile}\n`);

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ File not found: ${inputFile}`);
    process.exit(1);
  }

  const outputFile = inputFile.replace('.jsonl', '_enriched.jsonl');
  const writeStream = fs.createWriteStream(outputFile);

  let total = 0;
  let enriched = 0;
  let failed = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(inputFile),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    total++;
    const record = JSON.parse(line);
    const siren = record.siren;

    // Look up company data
    const companyData = await lookupSirene(siren);

    if (companyData.name) {
      enriched++;
      const enrichedRecord = {
        ...record,
        name: companyData.name,
        siteWeb: companyData.siteWeb,
        naf: companyData.naf
      };
      writeStream.write(JSON.stringify(enrichedRecord) + '\n');
    } else {
      failed++;
      // Still write the record even if enrichment failed
      writeStream.write(line + '\n');
    }

    // Progress indicator
    if (total % 100 === 0) {
      const pct = ((total / 1372) * 100).toFixed(1);
      process.stdout.write(`\r  ⏳ Progress: ${total}/1372 (${pct}%) | Enriched: ${enriched} | Failed: ${failed}`);
    }

    // Rate limiting: respectful delay between API calls
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  writeStream.end();

  // Wait for write to complete
  await new Promise(resolve => writeStream.on('finish', resolve));

  console.log(`\n\n✅ Enrichment complete:\n`);
  console.log(`   Total processed: ${total.toLocaleString()}`);
  console.log(`   Successfully enriched: ${enriched.toLocaleString()} (${((enriched/total)*100).toFixed(1)}%)`);
  console.log(`   Failed/incomplete: ${failed.toLocaleString()}\n`);
  console.log(`📁 Output file: ${outputFile}\n`);
  console.log(`Next: node crawl-for-dock.js ${outputFile}\n`);
}

const inputFile = process.argv[2] || 'bucket3_2023-2024_filtered.jsonl';
enrichCompanies(inputFile).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
