#!/usr/bin/env node

const regions = {
  'US': { gl: 'US', ceid: 'US:en' },
  'CA': { gl: 'CA', ceid: 'CA:en' },
  'BR': { gl: 'BR', ceid: 'BR:en' },
  'SG': { gl: 'SG', ceid: 'SG:en' },
  'AE': { gl: 'AE', ceid: 'AE:en' },
  'JP': { gl: 'JP', ceid: 'JP:en' },
};

const keywords = [
  'drone service provider',
  'commercial drone operator',
  'drone inspection contract',
  'BVLOS operator',
  'drone as a service',
];

async function test(label, keyword, glCode, ceidCode, after, before) {
  try {
    const q = encodeURIComponent(`"${keyword}" after:${after} before:${before}`);
    const url = `https://news.google.com/rss/search?q=${q}&hl=en&gl=${glCode}&ceid=${ceidCode}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      console.log(`${label} => ERROR (HTTP ${res.status})`);
      return;
    }

    const xml = await res.text();
    const items = xml.match(/<item>/g);
    const count = items ? items.length : 0;

    // Extract pubDate from items (skip first which is channel-level)
    const dates = [...xml.matchAll(/<item>[\s\S]*?<pubDate>(.*?)<\/pubDate>/g)]
      .map(m => new Date(m[1]).toISOString().slice(0,10))
      .filter(d => !isNaN(new Date(d)));

    const dateRange = dates.length > 1
      ? `  [${dates[dates.length-1]} to ${dates[0]}]`
      : dates.length === 1
        ? `  [${dates[0]}]`
        : '';

    console.log(`${label} => ${count} results${dateRange}`);
  } catch (err) {
    console.log(`${label} => ERROR (${err.message})`);
  }

  // Throttle requests
  await new Promise(r => setTimeout(r, 1500));
}

async function runTests() {
  console.log('\n=== TEST 1: Global Breadth Test ===');
  console.log('Keyword: "drone service provider"');
  console.log('Date range: Sep 5-12, 2025\n');

  for (const [region, codes] of Object.entries(regions)) {
    await test(
      `  ${region}`,
      'drone service provider',
      codes.gl,
      codes.ceid,
      '2025-09-05',
      '2025-09-12'
    );
  }

  console.log('\n=== TEST 2: Keyword Breadth Test ===');
  console.log('Region: US only');
  console.log('Date range: Sep 5-12, 2025\n');

  for (const keyword of keywords) {
    await test(
      `  "${keyword}"`,
      keyword,
      'US',
      'US:en',
      '2025-09-05',
      '2025-09-12'
    );
  }

  console.log('\n=== TEST 3: Freshness Decay Test ===');
  console.log('Keyword: "drone services"');
  console.log('Region: US only\n');

  const windows = [
    { label: 'Sep 1-7, 2025 (6 months ago)', after: '2025-09-01', before: '2025-09-07' },
    { label: 'Nov 1-7, 2025 (4 months ago)', after: '2025-11-01', before: '2025-11-07' },
    { label: 'Jan 1-7, 2026 (2 months ago)', after: '2026-01-01', before: '2026-01-07' },
    { label: 'Mar 1-7, 2026 (recent)', after: '2026-03-01', before: '2026-03-07' },
  ];

  for (const window of windows) {
    await test(
      `  ${window.label}`,
      'drone services',
      'US',
      'US:en',
      window.after,
      window.before
    );
  }

  console.log('\n=== TESTS COMPLETE ===\n');
}

runTests().catch(console.error);
