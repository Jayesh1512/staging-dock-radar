/**
 * Reads CASA ReOC holders CSV, searches Google (via Serper) for
 * company name + location, takes the first organic result, fetches that page,
 * and keeps only rows where the company name appears at least N times on the
 * page (shared logic: src/lib/registry/casaReocTopSiteNameMatch.ts).
 *
 * Reuses Dock Radar stack:
 * - searchGoogle (src/lib/google-search/serper.ts)
 * - fetchHtmlPage (src/lib/google-search/fetchHtmlPage.ts) — full HTML, not crawlUrl 1k cap
 * - optional: runDockQaInternetScan (src/lib/dji/dockQaInternetScan.ts) — same QA as DJI Dock Hunter
 *
 * Requires SERPER_API_KEY (same as Dock Radar Serper integration).
 *
 * Usage:
 *   SERPER_API_KEY=... npx tsx scripts/casa-reoc-filter-dji-dock.ts
 *   npx tsx scripts/casa-reoc-filter-dji-dock.ts --limit 5 --min-occurrences 2
 *   npx tsx scripts/casa-reoc-filter-dji-dock.ts --internet-qa   # log site:domain "DJI Dock" per row (extra Serper)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { config as loadEnv } from "dotenv";
import { searchGoogle } from "../src/lib/google-search/serper";
import { fetchHtmlPage } from "../src/lib/google-search/fetchHtmlPage";
import {
  analyzeCompanyNameOnPage,
  type NameMatchStats,
} from "../src/lib/registry/casaReocTopSiteNameMatch";
import { runDockQaInternetScan } from "../src/lib/dji/dockQaInternetScan";
import { websiteToNormalizedDomain } from "../src/lib/multi-sources-companies-import";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const DEFAULT_INPUT = path.join(
  process.cwd(),
  "data/Data dumps/Raw country wise data/Australia/Australia_casa-reoc-holders.csv",
);

const DEFAULT_OUTPUT = path.join(
  process.cwd(),
  "data/Data dumps/Raw country wise data/Australia/Australia_casa-reoc-holders-top-site-name-match.csv",
);

const DEFAULT_MIN_OCCURRENCES = 2;

function escapeCsvField(s: string): string {
  const t = s.replace(/\r?\n/g, " ").trim();
  if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function parseArgs(): {
  input: string;
  output: string;
  limit: number | null;
  delayMs: number;
  minOccurrences: number;
  internetQa: boolean;
} {
  const argv = process.argv.slice(2);
  let input = DEFAULT_INPUT;
  let output = DEFAULT_OUTPUT;
  let limit: number | null = null;
  let delayMs = 800;
  let minOccurrences = DEFAULT_MIN_OCCURRENCES;
  let internetQa = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input" && argv[i + 1]) {
      input = path.resolve(argv[++i]);
    } else if (a === "--output" && argv[i + 1]) {
      output = path.resolve(argv[++i]);
    } else if (a === "--limit" && argv[i + 1]) {
      limit = Math.max(1, parseInt(argv[++i], 10));
    } else if (a === "--delay-ms" && argv[i + 1]) {
      delayMs = Math.max(0, parseInt(argv[++i], 10));
    } else if (a === "--min-occurrences" && argv[i + 1]) {
      minOccurrences = Math.max(1, parseInt(argv[++i], 10));
    } else if (a === "--internet-qa") {
      internetQa = true;
    }
  }
  return { input, output, limit, delayMs, minOccurrences, internetQa };
}

async function* readCsvRows(
  filePath: string,
): AsyncGenerator<{ company: string; location: string }, void, unknown> {
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let lineNum = 0;

  for await (const line of rl) {
    lineNum++;
    if (lineNum === 1) {
      const header = parseCsvLine(line);
      const h0 = (header[0] ?? "").toLowerCase();
      const h1 = (header[1] ?? "").toLowerCase();
      if (!h0.includes("company") || !h1.includes("location")) {
        console.warn("Unexpected header:", header.join(","));
      }
      continue;
    }
    const cells = parseCsvLine(line);
    const company = (cells[0] ?? "").trim();
    const location = (cells[1] ?? "").trim();
    yield { company, location };
  }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { input, output, limit, delayMs, minOccurrences, internetQa } = parseArgs();
  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) {
    console.error("Set SERPER_API_KEY (e.g. in .env.local).");
    process.exit(1);
  }
  if (!fs.existsSync(input)) {
    console.error("Input file not found:", input);
    process.exit(1);
  }

  console.log(`min-occurrences (company name on top SERP page): ${minOccurrences}`);
  console.log(`internet QA (same as Dock Hunter site:domain): ${internetQa}\n`);

  const kept: {
    company: string;
    location: string;
    website: string;
    nameOccurrences: number;
  }[] = [];
  let processed = 0;
  let skippedEmpty = 0;
  let noSerp = 0;
  let noFetch = 0;
  let droppedLowNameCount = 0;

  for await (const row of readCsvRows(input)) {
    if (limit !== null && processed >= limit) break;

    if (!row.company) {
      skippedEmpty++;
      continue;
    }

    processed++;

    console.log(`[#${processed}] ${row.company} | ${row.location}`);

    const keyword = `${row.company} ${row.location}`.replace(/\s+/g, " ").trim();
    console.log(`  Serper query (loose match, not exact phrase): ${keyword} Australia`);

    let organic: Awaited<ReturnType<typeof searchGoogle>> = [];
    try {
      organic = await searchGoogle(
        { keyword, country: "AU", pages: 1, exactPhrase: false },
        apiKey,
      );
    } catch (e) {
      console.warn(`  Serper error (no website to process): ${row.company}`, e);
      noSerp++;
      await sleep(delayMs);
      continue;
    }

    const first = organic[0];
    const link = first?.link?.trim();
    if (!link) {
      console.warn(`  no SERP URL — skipping (company: ${row.company})`);
      noSerp++;
      await sleep(delayMs);
      continue;
    }

    console.log(`  SERP #1 → ${link}`);
    console.log(`  fetching page: ${link}`);

    const html = await fetchHtmlPage(link);
    if (!html) {
      console.warn(`  fetch failed or not HTML — ${link}`);
      noFetch++;
      await sleep(delayMs);
      continue;
    }

    const stats: NameMatchStats = analyzeCompanyNameOnPage(html, row.company);
    const coreHint = stats.coreNeedle ? `, core "${stats.coreNeedle}" → ${stats.coreBrand}` : "";
    console.log(
      `  name on page — full (legal): ${stats.fullLegal}${coreHint} → effective: ${stats.effective} (need ≥ ${minOccurrences})`,
    );

    if (internetQa) {
      const domain = websiteToNormalizedDomain(link);
      if (domain) {
        if (delayMs > 0) await sleep(Math.min(delayMs, 400));
        const qa = await runDockQaInternetScan(domain, null, apiKey);
        console.log(
          `  internet QA (Dock Hunter): dock_found=${qa.dock_found} hits=${qa.total_hits} keywords=${qa.keywords_matched.join(", ") || "—"}`,
        );
        if (qa.error) console.warn(`  internet QA note: ${qa.error}`);
      }
    }

    if (stats.effective >= minOccurrences) {
      kept.push({
        company: row.company,
        location: row.location,
        website: link,
        nameOccurrences: stats.effective,
      });
      console.log(`  KEEP — ${link}`);
    } else {
      console.log(
        `  DROP (effective ${stats.effective} < ${minOccurrences}) — ${link}`,
      );
      droppedLowNameCount++;
    }

    await sleep(delayMs);
  }

  const header = "Company Name,Location,Website,NameOccurrences\n";
  const lines = kept.map(
    (r) =>
      `${escapeCsvField(r.company)},${escapeCsvField(r.location)},${escapeCsvField(r.website)},${r.nameOccurrences}`,
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, header + lines.join("\n") + "\n", "utf8");

  console.log("\nDone.");
  console.log({
    output,
    kept: kept.length,
    processedCompanies: processed,
    skippedEmpty,
    noSerpResult: noSerp,
    fetchFailed: noFetch,
    droppedLowNameCount,
    minOccurrences,
    internetQa,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
