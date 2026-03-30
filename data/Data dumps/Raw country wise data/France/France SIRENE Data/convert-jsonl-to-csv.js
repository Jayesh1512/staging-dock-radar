const fs = require('fs');
const readline = require('readline');

async function convert(inputFile) {
  if (!fs.existsSync(inputFile)) {
    console.error(`File not found: ${inputFile}`);
    process.exit(1);
  }

  const outputFile = inputFile.replace('.jsonl', '.csv');
  console.log(`Converting ${inputFile} to ${outputFile}...`);

  const rl = readline.createInterface({
    input: fs.createReadStream(inputFile),
    crlfDelay: Infinity
  });

  const out = fs.createWriteStream(outputFile);
  let headers = null;

  for await (const line of rl) {
    if (!line.trim()) continue;
    
    try {
      const obj = JSON.parse(line);
      
      if (!headers) {
        headers = Object.keys(obj);
        out.write(headers.join(',') + '\n');
      }
      
      const row = headers.map(h => {
        let val = obj[h];
        if (val === null || val === undefined) val = '';
        val = String(val).replace(/"/g, '""'); // escape quotes
        // wrap in quotes if contains comma, newline, or quote
        if (val.includes(',') || val.includes('\n') || val.includes('"')) {
          return `"${val}"`;
        }
        return val;
      });
      out.write(row.join(',') + '\n');
    } catch (e) {
      console.error(`Failed to parse line: ${line.substring(0, 50)}...`);
    }
  }
  
  out.end();
  console.log(`✅ Converted JSONL to CSV successfully!`);
}

convert(process.argv[2]).catch(console.error);
