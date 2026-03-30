#!/usr/bin/env node

/**
 * split-buckets.js
 * Split step6_batch1.jsonl into 3 year-based buckets
 * 
 * Usage: node split-buckets.js
 * 
 * Creates:
 *   - bucket1_2020.jsonl (2,850 companies)
 *   - bucket2_2021-2022.jsonl (5,667 companies)
 *   - bucket3_2023-2024.jsonl (1,372 companies)
 */

const fs = require('fs');
const readline = require('readline');

async function splitBuckets() {
  const inputFile = 'step6_batch1.jsonl';
  
  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Error: ${inputFile} not found`);
    process.exit(1);
  }

  console.log(`📂 Reading: ${inputFile}\n`);

  // Create write streams for each bucket
  const streams = {
    bucket1: fs.createWriteStream('bucket1_2020.jsonl'),
    bucket2: fs.createWriteStream('bucket2_2021-2022.jsonl'),
    bucket3: fs.createWriteStream('bucket3_2023-2024.jsonl')
  };

  let total = 0;
  const counts = { bucket1: 0, bucket2: 0, bucket3: 0 };

  // Process line by line
  const rl = readline.createInterface({
    input: fs.createReadStream(inputFile),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    total++;
    const record = JSON.parse(line);
    const year = record.creationDate?.substring(0, 4);

    if (year === '2020') {
      streams.bucket1.write(line + '\n');
      counts.bucket1++;
    } else if (year === '2021' || year === '2022') {
      streams.bucket2.write(line + '\n');
      counts.bucket2++;
    } else if (year === '2023' || year === '2024') {
      streams.bucket3.write(line + '\n');
      counts.bucket3++;
    }
  }

  // Close all streams
  Object.values(streams).forEach(stream => stream.end());

  // Wait for all streams to finish
  await Promise.all([
    new Promise(resolve => streams.bucket1.on('finish', resolve)),
    new Promise(resolve => streams.bucket2.on('finish', resolve)),
    new Promise(resolve => streams.bucket3.on('finish', resolve))
  ]);

  console.log(`✅ Read ${total.toLocaleString()} companies\n`);
  console.log(`📊 Extraction results:`);
  console.log(`  ✓ bucket1_2020.jsonl: ${counts.bucket1.toLocaleString()} companies (28.8%)`);
  console.log(`  ✓ bucket2_2021-2022.jsonl: ${counts.bucket2.toLocaleString()} companies (57.3%)`);
  console.log(`  ✓ bucket3_2023-2024.jsonl: ${counts.bucket3.toLocaleString()} companies (13.9%)\n`);
  console.log(`✨ Total: ${(counts.bucket1 + counts.bucket2 + counts.bucket3).toLocaleString()} companies\n`);
}

splitBuckets().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
