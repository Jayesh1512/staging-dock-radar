/**
 * ANAC Brazil — authorized RPAS (drone) designs registry.
 *
 * The English page only embeds a short sample:
 *   https://www.gov.br/anac/en/topics/drones/list
 * The complete table is published on Portuguese:
 *   https://www.gov.br/anac/pt-br/assuntos/drones/projetos-autorizados
 *
 * Columns match the official table (English headers in CSV).
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";

const SOURCES = {
  /** Full list (authoritative) */
  fullPt:
    "https://www.gov.br/anac/pt-br/assuntos/drones/projetos-autorizados",
  /** Short English excerpt (subset) */
  sampleEn: "https://www.gov.br/anac/en/topics/drones/list",
} as const;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0";

const OUT_REL = path.join(
  "data",
  "Data dumps",
  "Raw country wise data",
  "BR",
  "Brazil-anac-authorized-rpas-designs.csv",
);

function escapeCsvField(s: string): string {
  const t = s.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function cellText($: cheerio.CheerioAPI, td: Element): string {
  return $(td)
    .text()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Preserves line breaks as " | " so model lists stay readable */
function cellTextMultiline($: cheerio.CheerioAPI, td: Element): string {
  const raw = $(td).html() ?? "";
  const plain = raw
    .replace(/<br\s*\/?>/gi, " | ")
    .replace(/<[^>]+>/g, " ");
  return plain.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function cellDadsRefs($: cheerio.CheerioAPI, td: Element): {
  label: string;
  urls: string;
} {
  const $td = $(td);
  const texts: string[] = [];
  $td.find("a").each((_, a) => {
    const t = $(a).text().replace(/\s+/g, " ").trim();
    if (t) texts.push(t);
  });
  const hrefs = $td
    .find("a[href]")
    .map((_, a) => $(a).attr("href")?.trim())
    .get()
    .filter(Boolean) as string[];
  const plain = cellText($, td);
  const label = texts.length ? texts.join(" | ") : plain;
  return { label, urls: [...new Set(hrefs)].join(" | ") };
}

function isHeaderRow($: cheerio.CheerioAPI, tr: Element): boolean {
  const t = $(tr).text().toLowerCase();
  return (
    t.includes("detentor") ||
    t.includes("authorization holder") ||
    t.includes("autorização")
  );
}

export type AnacRpasRow = {
  authorizationHolder: string;
  model: string;
  dadsSpecification: string;
  dadsPdfUrls: string;
  dateBr: string;
  classRpa: string;
  typeOfApproval: string;
};

function parseTable(html: string): AnacRpasRow[] {
  const $ = cheerio.load(html);
  const out: AnacRpasRow[] = [];
  const $table = $("#parent-fieldname-text table.plain").first();
  if (!$table.length) {
    console.warn("No table.plain inside #parent-fieldname-text");
    return out;
  }

  $table.find("tbody tr").each((_, tr) => {
    if (isHeaderRow($, tr)) return;
    const tds = $(tr).find("td").toArray();
    if (tds.length < 6) return;

    const authorizationHolder = cellText($, tds[0]);
    const model = cellTextMultiline($, tds[1]);
    const dads = cellDadsRefs($, tds[2]);
    const dateBr = cellText($, tds[3]);
    const classRpa = cellText($, tds[4]);
    const typeOfApproval = cellText($, tds[5]);

    if (!authorizationHolder && !model) return;

    out.push({
      authorizationHolder,
      model,
      dadsSpecification: dads.label,
      dadsPdfUrls: dads.urls,
      dateBr,
      classRpa,
      typeOfApproval,
    });
  });

  return out;
}

/**
 * gov.br often serves a bot-challenge HTML to Node `fetch` / undici.
 * curl with a browser UA reliably returns the real page.
 */
function fetchHtmlWithCurl(url: string): string {
  return execFileSync(
    "curl",
    [
      "-sL",
      "--compressed",
      "-A",
      USER_AGENT,
      "-H",
      "Accept: text/html,application/xhtml+xml",
      "-H",
      "Accept-Language: pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      url,
    ],
    { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 },
  );
}

function main() {
  const outPath = path.join(process.cwd(), OUT_REL);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  process.stderr.write(`Fetching full list: ${SOURCES.fullPt}\n`);
  const html = fetchHtmlWithCurl(SOURCES.fullPt);
  if (!html.includes("parent-fieldname-text") || html.length < 5000) {
    throw new Error(
      "Unexpected HTML (too short or blocked). Ensure curl is installed and try again.",
    );
  }
  const rows = parseTable(html);

  const header =
    "Authorization holder,Model,Technical specifications (DADS),DADS PDF URL(s),Date (DD/MM/YYYY),Class RPA,Type of approval";
  const lines = [
    header,
    ...rows.map((r) =>
      [
        escapeCsvField(r.authorizationHolder),
        escapeCsvField(r.model),
        escapeCsvField(r.dadsSpecification),
        escapeCsvField(r.dadsPdfUrls),
        escapeCsvField(r.dateBr),
        escapeCsvField(r.classRpa),
        escapeCsvField(r.typeOfApproval),
      ].join(","),
    ),
  ];

  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  console.log(
    `Wrote ${rows.length} authorized RPAS design rows to ${outPath}`,
  );
  console.log(
    `Primary source (full list): ${SOURCES.fullPt}`,
  );
  console.log(
    `English sample page (subset only): ${SOURCES.sampleEn}`,
  );
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
