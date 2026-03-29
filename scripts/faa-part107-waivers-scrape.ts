/**
 * Fetches all rows from FAA Part 107 waivers issued listing and writes CSV.
 * Source: https://www.faa.gov/uas/commercial_operators/part_107_waivers/waivers_issued?page=1
 *
 * Columns: Date of Issuance, Expiration Date, Company Name, Responsible Person, Waivered Regulation
 * Drops waivers whose expiration date is before today (local date).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as cheerio from "cheerio";

const BASE =
  "https://www.faa.gov/uas/commercial_operators/part_107_waivers/waivers_issued";
const USER_AGENT =
  "Mozilla/5.0 (compatible; dock-radar/1.0; +https://github.com/)";

const OUT_REL = path.join(
  "data",
  "Data dumps",
  "Raw country wise data",
  "US",
  "USA-faa-part107-waivers.csv",
);

function escapeCsvField(s: string): string {
  const t = s.replace(/\r?\n/g, " ").trim();
  if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function localDayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function parseExpirationDay(isoOrText: string): number | null {
  const raw = isoOrText.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const day = Number(m[3]);
  return new Date(y, mo, day).getTime();
}

async function fetchPage(page: number): Promise<string> {
  const url = `${BASE}?page=${page}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

export type WaiverRow = {
  dateOfIssuance: string;
  expirationDate: string;
  companyName: string;
  responsiblePerson: string;
  waiveredRegulation: string;
};

function parseRows(html: string): WaiverRow[] {
  const $ = cheerio.load(html);
  const out: WaiverRow[] = [];
  $("table.table tbody tr").each((_, tr) => {
    const $tr = $(tr);
    const issue =
      $tr.find("td.views-field-field-issue-date time").first().text().trim() ||
      $tr.find("td.views-field-field-issue-date").text().replace(/\s+/g, " ").trim();
    const expiration =
      $tr.find("td.views-field-field-expiration-date time").first().text().trim() ||
      $tr.find("td.views-field-field-expiration-date").text().replace(/\s+/g, " ").trim();
    const company = $tr
      .find("td.views-field-field-company-name")
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const $rp = $tr.find("td.views-field-field-responsible-person");
    let responsible = $rp.find("a").first().text().trim();
    if (!responsible) {
      responsible = $rp.text().replace(/\s+/g, " ").trim();
    }
    responsible = responsible.replace(/\s*\(pdf\)\s*$/i, "").trim();
    const regulation = $tr
      .find("td.views-field-field-waivered-regulation")
      .text()
      .replace(/\s+/g, " ")
      .trim();
    if (company || responsible) {
      out.push({
        dateOfIssuance: issue,
        expirationDate: expiration,
        companyName: company,
        responsiblePerson: responsible,
        waiveredRegulation: regulation,
      });
    }
  });
  return out;
}

async function main() {
  const outPath = path.join(process.cwd(), OUT_REL);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const rows: WaiverRow[] = [];
  const todayStart = localDayStart(new Date());

  let page = 1;
  for (;;) {
    const html = await fetchPage(page);
    const batch = parseRows(html);
    if (batch.length === 0) break;
    rows.push(...batch);
    process.stderr.write(
      `\rPage ${page}: +${batch.length} (total ${rows.length})   `,
    );
    page += 1;
    await new Promise((r) => setTimeout(r, 200));
  }
  process.stderr.write("\n");

  const kept: WaiverRow[] = [];
  let droppedExpired = 0;
  let droppedUnparseable = 0;
  for (const r of rows) {
    const expDay = parseExpirationDay(r.expirationDate);
    if (expDay === null) {
      droppedUnparseable += 1;
      continue;
    }
    if (expDay < todayStart) {
      droppedExpired += 1;
      continue;
    }
    kept.push(r);
  }

  const header =
    "Date of Issuance,Expiration Date,Company Name,Responsible Person,Waivered Regulation";
  const lines = [
    header,
    ...kept.map(
      (r) =>
        [
          escapeCsvField(r.dateOfIssuance),
          escapeCsvField(r.expirationDate),
          escapeCsvField(r.companyName),
          escapeCsvField(r.responsiblePerson),
          escapeCsvField(r.waiveredRegulation),
        ].join(","),
    ),
  ];
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  console.log(
    `Wrote ${kept.length} rows (non-expired) to ${outPath} | scraped ${rows.length} | dropped expired ${droppedExpired} | dropped bad date ${droppedUnparseable}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
