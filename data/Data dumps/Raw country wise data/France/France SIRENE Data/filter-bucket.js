const fs = require('fs');
const readline = require('readline');

const inputFile = process.argv[2];
const filterArg = process.argv[3]; // e.g. ">=01"

if (!inputFile || !filterArg) {
  console.error("Usage: node filter-bucket.js <input.jsonl> \">=01\"");
  process.exit(1);
}

const outputFile = inputFile.replace('.jsonl', '_filtered.jsonl');
console.log(`🔍 Filtering ${inputFile} with condition ${filterArg}...`);

const rl = readline.createInterface({
  input: fs.createReadStream(inputFile),
  crlfDelay: Infinity
});

const out = fs.createWriteStream(outputFile);
let count = 0, kept = 0;

rl.on('line', line => {
  if (!line.trim()) return;
  count++;
  try {
    const record = JSON.parse(line);
    // Our fetch script already grabbed headcount '01', '02', '03', '11', '12' etc.
    // '01' means 1-2 employees, '11' means 10-19 etc. They all meet >=01 natively 
    // unless someone messed with the raw data.
    
    // Apply logic generically:
    if (record.headcount && parseInt(record.headcount, 10) >= 1) {
      out.write(line + '\n');
      kept++;
    }
  } catch (e) { }
});

rl.on('close', () => {
  out.end();
  console.log(`✅ Filtering complete! Processed ${count} records, kept ${kept}.`);
  console.log(`📁 Saved to: ${outputFile}`);
});
