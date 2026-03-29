/**
 * Fetches all rows from CASA ReOC holders listing and writes CSV.
 * https://www.casa.gov.au/drones/remotely-piloted-aircraft-operators-certificate/remotely-piloted-aircraft-operators-certificate-reoc-holders
 *
 * Uses Node fetch with a browser User-Agent (plain curl often fails against this site).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as cheerio from "cheerio";

const BASE =
  "https://www.casa.gov.au/drones/remotely-piloted-aircraft-operators-certificate/remotely-piloted-aircraft-operators-certificate-reoc-holders";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function escapeCsvField(s: string): string {
  const t = s.replace(/\r?\n/g, " ").trim();
  if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

async function fetchPage(page: number): Promise<string> {
  const url = `${BASE}?page=${page}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseRows(html: string): { company: string; location: string }[] {
  const $ = cheerio.load(html);
  const out: { company: string; location: string }[] = [];
  $(".view-content .views-row > article").each((_, el) => {
    const $art = $(el);
    const company = $art
      .find("h3.card-title .field--name-title")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const suburb = $art
      .find(".field--name-field-tx-suburb-town-city")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const state = $art
      .find(".field--name-field-tx-state-territory .field__item")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const location = [suburb, state].filter(Boolean).join(", ");
    if (company || location) {
      out.push({ company, location });
    }
  });
  return out;
}

function parseTotalFromSummary(html: string): number | null {
  const m = html.match(/Showing\s+\d+\s*-\s*\d+\s+of\s+(\d+)\s+results/i);
  return m ? parseInt(m[1], 10) : null;
}

async function main() {
  const outPath = path.join(process.cwd(), "data", "casa-reoc-holders.csv");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const rows: { company: string; location: string }[] = [];
  let expectedTotal: number | null = null;
  let page = 0;
  for (;;) {
    const html = await fetchPage(page);
    if (page === 0) expectedTotal = parseTotalFromSummary(html);
    const batch = parseRows(html);
    if (batch.length === 0) break;
    rows.push(...batch);
    process.stderr.write(
      `\rPage ${page}: +${batch.length} (total ${rows.length}${expectedTotal != null ? ` / ${expectedTotal}` : ""})`,
    );
    page += 1;
    await new Promise((r) => setTimeout(r, 200));
  }
  process.stderr.write("\n");

  if (expectedTotal != null && rows.length !== expectedTotal) {
    console.warn(
      `Warning: parsed ${rows.length} rows but page summary reported ${expectedTotal} results.`,
    );
  }

  const lines = [
    "Company Name,Location",
    ...rows.map(
      (r) => `${escapeCsvField(r.company)},${escapeCsvField(r.location)}`,
    ),
  ];
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  console.log(`Wrote ${rows.length} rows to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
