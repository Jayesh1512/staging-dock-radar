import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const page = await browser.newPage();
  await page.goto('https://www.linkedin.com/login', {
    waitUntil: 'networkidle2',
  });

  // Simple CLI prompt: user logs in manually, then presses Enter in the terminal.
  console.log('LinkedIn login window opened.');
  console.log('Please log in manually, then return to this terminal and press Enter to save cookies.');

  process.stdin.setEncoding('utf8');
  process.stdin.once('data', async () => {
    const cookies = await page.cookies();
    const outPath = path.join(process.cwd(), 'linkedin-cookies.json');
    fs.writeFileSync(outPath, JSON.stringify(cookies, null, 2), 'utf8');
    console.log(`LinkedIn cookies saved to ${outPath}`);
    await browser.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('LinkedIn login script failed:', err);
  process.exit(1);
});

