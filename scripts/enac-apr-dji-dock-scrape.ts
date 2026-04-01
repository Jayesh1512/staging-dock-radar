/**
 * ENAC unified APR operator list — rows whose Modello mentions DJI Dock family.
 * https://moduliweb.enac.gov.it/applicazioni/SAPR/APR_Lista_Unificata.asp
 *
 * Matches model text case-insensitively for "DJI" + "DOCK" (e.g. DJI DOCK, DJI DOCK 2, DJI DOCK 3).
 * Skips rows with style color:red (Cancellato).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";

const URL =
  "https://moduliweb.enac.gov.it/applicazioni/SAPR/APR_Lista_Unificata.asp";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Model column must contain DJI + DOCK (any spacing / optional digit suffix). */
const DJI_DOCK_MODEL = /dji\s*dock/i;

function escapeCsvField(s: string): string {
  const t = s.replace(/\r?\n/g, " ").trim();
  if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function operatoreCellToPlain(html: string): string {
  return html
    .replace(/&nbsp;/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ");
}

function parseOperatoreCell(html: string | undefined): {
  operator: string;
  email: string;
} {
  if (!html) return { operator: "", email: "" };
  const plain = operatoreCellToPlain(html).replace(/\r/g, "").trim();
  const joined = plain
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
  const normalized = joined.replace(/([^\s])(pec:)/i, "$1 $2");
  const emailM = normalized.match(/pec:\s*(\S+)/i);
  const email = emailM ? emailM[1].trim() : "";
  const operator = normalized.replace(/\s*pec:\s*\S+\s*$/i, "").trim();
  return { operator, email };
}

function isCancelledRow($tr: cheerio.Cheerio<Element>): boolean {
  const st = ($tr.attr("style") || "").toLowerCase();
  return st.includes("color:red") || st.includes("color: red");
}

async function main() {
  const res = await fetch(URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const out: { builder: string; operator: string; email: string }[] = [];

  $("table tr").each((_, tr) => {
    const $tr = $(tr);
    if ($tr.find("th").length > 0) return;
    if (isCancelledRow($tr)) return;
    const $tds = $tr.find("td");
    if ($tds.length < 10) return;

    const modello = $tds
      .eq(5)
      .text()
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!DJI_DOCK_MODEL.test(modello)) return;

    const builder = $tds
      .eq(4)
      .text()
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const operatoreHtml = $tds.eq(3).html() ?? undefined;
    const { operator, email } = parseOperatoreCell(operatoreHtml);

    out.push({ builder, operator, email });
  });

  const outPath = path.join(
    process.cwd(),
    "data",
    "italy-enac-apr-dji-dock.csv",
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const lines = [
    "Company Name (Builder),Operator,Operator email",
    ...out.map(
      (r) =>
        `${escapeCsvField(r.builder)},${escapeCsvField(r.operator)},${escapeCsvField(r.email)}`,
    ),
  ];
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  console.log(`Wrote ${out.length} rows to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
