#!/usr/bin/env node
/**
 * Phase 1: DJI Reseller LinkedIn Scanner
 *
 * Visits company LinkedIn pages for 10 high-priority DJI enterprise resellers,
 * scrapes their recent posts, and uses LLM to classify dock activity.
 *
 * Usage: node scripts/scan-reseller-linkedin.mjs
 */
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(decodeURIComponent(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const RAW_PATH = path.join(__dirname, '..', 'data', 'reseller-scan-raw.json');
const OUT_PATH = path.join(__dirname, '..', 'data', 'reseller-linkedin-scan-phase1.json');

// ─── Sample: 10 deduplicated high-priority resellers with LinkedIn URLs ────────
const SAMPLE_RESELLERS = [
  { id: 1512, name: 'Coptrz Ltd', country: 'United Kingdom', linkedin: 'https://www.linkedin.com/company/coptrz' },
  { id: 1524, name: 'Heliguy', country: 'United Kingdom', linkedin: 'https://www.linkedin.com/company/heliguy' },
  { id: 1725, name: 'Drone Nerds Inc.', country: 'United States', linkedin: 'https://www.linkedin.com/company/dronenerds' },
  { id: 1719, name: 'Frontier Precision Inc', country: 'United States', linkedin: 'https://www.linkedin.com/company/frontier-precision-inc.' },
  { id: 1454, name: 'Airteam Aerial Intelligence GmbH', country: 'Germany', linkedin: 'https://www.linkedin.com/company/airteamaerialintelligence' },
  { id: 1452, name: 'Droneparts GmbH', country: 'Germany', linkedin: 'https://www.linkedin.com/company/droneparts.de' },
  { id: 1502, name: 'Escadrone', country: 'France', linkedin: 'https://www.linkedin.com/company/escadrone' },
  { id: 1549, name: 'Aermatica 3D', country: 'Italy', linkedin: 'https://www.linkedin.com/company/aermatica3d' },
  { id: 1496, name: 'Skydata Oy', country: 'Finland', linkedin: 'https://www.linkedin.com/company/skydata-oy' },
  { id: 1479, name: 'Drone Volt Scandinavia ApS', country: 'Denmark', linkedin: 'https://www.linkedin.com/company/drone-volt' },
];

const DELAY_BETWEEN_COMPANIES_MS = 5000;
const MAX_SCROLLS = 4;
const SCROLL_DELAY_MS = 2000;

// ─── LLM Prompt ────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a drone industry analyst. You will receive LinkedIn post data scraped from DJI enterprise reseller company pages. For each company, analyze ALL their posts to identify any DJI Dock related activity.

A post is "dock-related" if it mentions: DJI Dock, Dock 2, Dock 3, dock-in-a-box, remote drone station, autonomous drone docking, FlightHub 2, or similar dock/remote-ops concepts.

Output a JSON object with key "results" containing an array. For each company:

{
  "company_name": "string",
  "total_posts_scraped": number,
  "dock_post_count": number,
  "latest_dock_post_date": "string or null",
  "classification": "deployer | reseller | inactive",
  "confidence": "high | medium | low",
  "industries": ["string"],
  "deployment_signals": ["string"],
  "dock_models": ["string"],
  "other_drone_brands": ["string"],
  "summary": "string"
}

Classification rules:
- "deployer": evidence of actual client implementations, installations, case studies, or field deployments of DJI Docks for end customers
- "reseller": promotes/sells docks but only product marketing, unboxing, specs, trade show demos, training events — no real client deployments
- "inactive": no dock-related posts found in the scraped results
- Extract industries ONLY from deployment evidence, not generic company descriptions
- Keep deployment_signals factual and brief (e.g. "Deployed Dock 2 for wind farm inspection with RWE")
- For latest_dock_post_date, convert relative LinkedIn dates (e.g. "2w" = 2 weeks ago, "3mo" = 3 months ago) to approximate ISO dates based on today being ${new Date().toISOString().split('T')[0]}
- other_drone_brands: list any non-DJI brands mentioned (Skydio, Autel, FlytBase, Parrot, etc.)
- If zero posts were scraped for a company, classify as "inactive" with confidence "low" and note "No posts found on company page"`;

// ─── Puppeteer helpers ─────────────────────────────────────────────────────────
async function loadCookies(page) {
  const cookiesPath = path.join(__dirname, '..', 'linkedin-cookies.json');
  if (!fs.existsSync(cookiesPath)) {
    throw new Error('linkedin-cookies.json not found. Run: npm run linkedin:login');
  }
  const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'));
  await page.setCookie(...cookies);
}

function extractPostsFromPage() {
  const posts = [];

  // Company page posts use similar article/update containers
  const containers = document.querySelectorAll(
    'article, div.feed-shared-update-v2, div[data-urn]'
  );

  containers.forEach(el => {
    const textEl =
      el.querySelector('[data-test-id="feed-update-text"]') ??
      el.querySelector('span.break-words') ??
      el.querySelector('div.break-words') ??
      el.querySelector('div.update-components-text');
    const content = textEl?.innerText?.trim() ?? '';
    if (!content) return;

    const authorEl =
      el.querySelector('span.update-components-actor__name') ??
      el.querySelector('span.feed-shared-actor__name') ??
      el.querySelector('a.update-components-actor__meta-link');
    const authorName = authorEl?.innerText?.trim() ?? null;

    const timeEl =
      el.querySelector('time') ??
      el.querySelector('span.update-components-actor__sub-description span[aria-hidden="true"]');
    const publishedAt = timeEl?.innerText?.trim() ?? null;

    let postUrl = null;
    const permalink =
      el.querySelector('a[href*="activity"]') ??
      el.querySelector('a[href*="/feed/update/"]');
    if (permalink?.href) postUrl = permalink.href.split('?')[0];

    posts.push({ postUrl, content, authorName, publishedAt });
  });

  return posts;
}

async function scrapeCompanyPosts(page, linkedinUrl) {
  // Navigate to company posts page
  const postsUrl = linkedinUrl.replace(/\/$/, '') + '/posts/';
  await page.goto(postsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log(`  Page loaded: ${page.url()}`);

  // Scroll to load more posts
  for (let i = 0; i < MAX_SCROLLS; i++) {
    process.stdout.write(`  Scrolling (${i + 1}/${MAX_SCROLLS})... `);
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await new Promise(r => setTimeout(r, SCROLL_DELAY_MS));
    process.stdout.write('done\n');
  }

  // Expand "see more" buttons
  await page.evaluate(() => {
    document.querySelectorAll(
      'button.see-more-less-button, button[aria-label*="see more"], button[aria-label*="See more"]'
    ).forEach(b => b.click());
  });
  await new Promise(r => setTimeout(r, 1500));

  // Extract posts
  const posts = await page.evaluate(extractPostsFromPage);

  // Dedupe by URL or content prefix
  const seen = new Set();
  return posts.filter(p => {
    const key = p.postUrl || p.content.substring(0, 120);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── LLM call (OpenAI GPT-4o) ─────────────────────────────────────────────────
async function callLLM(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${await resp.text()}`);
  const result = await resp.json();
  console.log(`  LLM tokens: ${result.usage?.total_tokens || 'N/A'}`);
  return JSON.parse(result.choices[0].message.content);
}

// ─── Incremental save helper ───────────────────────────────────────────────────
function saveRawIncremental(scrapedData) {
  fs.writeFileSync(RAW_PATH, JSON.stringify(scrapedData, null, 2));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Phase 1: DJI Reseller LinkedIn Scanner ===');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`Scanning ${SAMPLE_RESELLERS.length} company LinkedIn pages`);
  console.log(`Settings: ${MAX_SCROLLS} scrolls/page, ${DELAY_BETWEEN_COMPANIES_MS / 1000}s delay between companies\n`);

  console.log('[1/4] Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  console.log('[1/4] Browser launched.');

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  console.log('[2/4] Loading LinkedIn cookies...');
  await loadCookies(page);
  console.log('[2/4] Cookies loaded.');

  // Verify login
  console.log('[3/4] Verifying LinkedIn session...');
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const url = page.url();
  const title = await page.title();
  console.log(`[3/4] Landed on: ${url} | Title: "${title}"`);
  if (/login|signin/i.test(url)) {
    console.error('[3/4] ERROR: LinkedIn session expired. Run: npm run linkedin:login');
    await browser.close();
    return;
  }
  console.log('[3/4] LinkedIn session active.\n');

  console.log('[4/4] Starting company page scraping...\n');

  // Scrape each reseller's company page
  const scrapedData = [];
  for (let i = 0; i < SAMPLE_RESELLERS.length; i++) {
    const reseller = SAMPLE_RESELLERS[i];
    const ts = new Date().toLocaleTimeString();
    console.log(`[${i + 1}/${SAMPLE_RESELLERS.length}] ${reseller.name} (${reseller.country}) — ${ts}`);
    console.log(`  → Navigating to: ${reseller.linkedin}/posts/`);

    try {
      const posts = await scrapeCompanyPosts(page, reseller.linkedin);
      console.log(`  ✓ Scraped ${posts.length} unique posts`);

      scrapedData.push({
        company_name: reseller.name,
        country: reseller.country,
        reseller_id: reseller.id,
        linkedin_url: reseller.linkedin,
        posts: posts.map(p => ({
          content: p.content,
          author: p.authorName,
          date: p.publishedAt,
          url: p.postUrl,
        })),
      });

      // Save incrementally after each company
      saveRawIncremental(scrapedData);
    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}`);
      scrapedData.push({
        company_name: reseller.name,
        country: reseller.country,
        reseller_id: reseller.id,
        linkedin_url: reseller.linkedin,
        posts: [],
        error: err.message,
      });
      saveRawIncremental(scrapedData);
    }

    // Delay between companies to avoid rate limiting
    if (i < SAMPLE_RESELLERS.length - 1) {
      console.log(`  Waiting ${DELAY_BETWEEN_COMPANIES_MS / 1000}s...`);
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_COMPANIES_MS));
    }
  }

  await browser.close();

  // Summary before LLM
  const totalPosts = scrapedData.reduce((sum, d) => sum + d.posts.length, 0);
  console.log(`\nScraping complete. Total posts collected: ${totalPosts}`);
  console.log(`Raw data saved: data/reseller-scan-raw.json\n`);

  if (totalPosts === 0) {
    console.log('No posts found. Check LinkedIn cookies and company URLs.');
    return;
  }

  // LLM analysis
  console.log('Sending to LLM for analysis...');
  const userPrompt = JSON.stringify(scrapedData.map(d => ({
    company_name: d.company_name,
    country: d.country,
    total_posts: d.posts.length,
    posts: d.posts.map(p => ({ content: p.content, date: p.date })),
  })));

  const llmResult = await callLLM(SYSTEM_PROMPT, userPrompt);

  // Save results
  fs.writeFileSync(OUT_PATH, JSON.stringify(llmResult, null, 2));
  console.log(`Results saved: data/reseller-linkedin-scan-phase1.json\n`);

  // Print summary table
  console.log('=== RESULTS ===\n');
  console.log(
    'Company'.padEnd(35),
    'Country'.padEnd(15),
    'Scraped'.padEnd(9),
    'Dock'.padEnd(6),
    'Class'.padEnd(15),
    'Conf'.padEnd(8),
    'Industries',
  );
  console.log('-'.repeat(130));

  for (const r of llmResult.results) {
    const scraped = scrapedData.find(d => d.company_name === r.company_name);
    console.log(
      r.company_name.substring(0, 33).padEnd(35),
      (scraped?.country || '').padEnd(15),
      String(r.total_posts_scraped || 0).padEnd(9),
      String(r.dock_post_count).padEnd(6),
      r.classification.padEnd(15),
      r.confidence.padEnd(8),
      (r.industries || []).join(', '),
    );
    if (r.deployment_signals?.length > 0) {
      r.deployment_signals.forEach(s => console.log('  → ' + s));
    }
  }

  // Stats
  const deployers = llmResult.results.filter(r => r.classification === 'deployer').length;
  const resellers = llmResult.results.filter(r => r.classification === 'reseller').length;
  const inactive = llmResult.results.filter(r => r.classification === 'inactive').length;
  console.log(`\n=== SUMMARY: ${deployers} deployers | ${resellers} resellers | ${inactive} inactive ===`);
  if (deployers >= 3) {
    console.log('SIGNAL: Strong. Recommend scaling to all 125 LinkedIn-enriched resellers.');
  } else if (deployers >= 1) {
    console.log('SIGNAL: Moderate. Consider expanding sample before full scale.');
  } else {
    console.log('SIGNAL: Weak. Rethink approach before scaling.');
  }
}

main().catch(console.error);
