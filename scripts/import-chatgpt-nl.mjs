/**
 * Import NL ChatGPT data from Excel into multi_sources_companies_import
 * Fixes: KNRM Dutch→English merge, Vliegendshop→Vliegend.nl merge, Shell row parsing
 * Run: node scripts/import-chatgpt-nl.mjs
 */
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";

const DRY_RUN = false;

const db = createClient(
  "https://lxubuceipdmpovtbukmb.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4dWJ1Y2VpcGRtcG92dGJ1a21iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQ3NTMxNiwiZXhwIjoyMDg5MDUxMzE2fQ.X7j1G7JX3YtXNWTCJQpjCTVJrp81cIAvoLf-vCefrss"
);

function norm(name) {
  if (!name) return "";
  let n = name.toLowerCase().trim();
  n = n.replace(/\(.*?\)/g, "");
  const suffixes = ["sas","sarl","sa","eurl","sasu","sci","inc","ltd","llc","gmbh","corp","corporation","limited","co","plc","b.v.","b.v","bv","n.v.","nv","ag","srl","spa","sl","se","v.o.f.","vof"];
  for (const s of suffixes) {
    const escaped = s.replace(/\./g, "\\.");
    n = n.replace(new RegExp(`(?:^|\\s)${escaped}(?:\\s|,|$)`, "gi"), " ");
  }
  n = n.replace(/[–—]/g, "-");
  n = n.replace(/[^\w\s\u00C0-\u024F-]/g, "");
  n = n.replace(/\s+/g, " ").trim();
  return n;
}
function extractDomain(url) {
  if (!url || url === "Unknown") return null;
  try { return new URL(url.startsWith("http") ? url : "https://"+url).hostname.replace(/^www\./, ""); } catch { return null; }
}
function cleanUrl(url) {
  if (!url || url === "Unknown" || !String(url).trim()) return null;
  return String(url).trim();
}
function parseDockModels(models) {
  if (!models) return [];
  const kw = [];
  if (/dock\s*1/i.test(models)) kw.push("DJI Dock 1");
  if (/dock\s*2/i.test(models)) kw.push("DJI Dock 2");
  if (/dock\s*3/i.test(models)) kw.push("DJI Dock 3");
  if (kw.length === 0 && /dock/i.test(models)) kw.push("DJI Dock");
  return kw;
}
const roleNorm = r => {
  const map = {"Enterprise End-User":"enterprise_end-user","System Integrator":"system_integrator",
    "Software Platform":"software_platform","Authorized Dealer":"authorized_dealer",
    "DFR Service Provider":"dfr_service_provider","Government End-User":"government_end-user",
    "Reseller":"reseller","Distributor":"distributor"};
  return map[r] || (r ? r.toLowerCase().replace(/[\s/]+/g,"_") : null);
};

// Manual merge mappings for known duplicates
const MANUAL_MERGE_MAP = {
  "koninklijke nederlandse redding maatschappij": "knrm",
  "vliegendshopnl": "vliegendnl",
};

async function main() {
  console.log(`=== NL ChatGPT Import — ${DRY_RUN ? "DRY RUN" : "LIVE"} ===\n`);

  const wb = XLSX.readFile("data/Data dumps/Raw country wise data/Netherlands NL/NL ChatGPT 29Mar1645.xlsx");
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);

  // Fix row 1 (Shell — comma in name broke XLSX parsing)
  if (rows[0].company_name === "Shell (Pernis & Europort") {
    rows[0] = {
      company_name: "Shell (Pernis & Europort, Rotterdam)",
      country: "Netherlands", role: "Enterprise End-User", dock_models: "Dock 1",
      dock_count: "8", website: "Unknown", linkedin_url: "Unknown",
      evidence_url_1: "https://www.heliguy.com/blogs/posts/shell-refinery-inspections-drone-in-a-box/",
      source_type_1: "Industry Article",
      evidence_url_2: "https://www.flytbase.com/case-studies/shell-petroleum-autonomous-drone-inspections-oil-and-gas",
      source_type_2: "Company Website", confidence: "High",
      notes: "Heliguy case study states 1,000+ remote DJI Dock flights/month and 8 docking systems operating 24/7 at two refineries in Rotterdam. FlytBase-powered.",
    };
  }

  console.log("CSV rows:", rows.length);

  const { data: existing } = await db.from("multi_sources_companies_import")
    .select("id,company_name,normalized_name,normalized_domain,website,linkedin,source_types,dock_verified,dock_models,verifications,role,notes")
    .eq("country_code", "NL");
  console.log("Existing NL records:", existing.length, "\n");

  const byName = new Map();
  const byDomain = new Map();
  existing.forEach(r => {
    byName.set(r.normalized_name, r);
    if (r.normalized_domain) byDomain.set(r.normalized_domain, r);
  });

  const mergeResults = [];
  const insertResults = [];

  for (const row of rows) {
    const name = String(row.company_name || "").trim();
    if (!name) continue;
    const normName = norm(name);
    const website = cleanUrl(row.website);
    const linkedin = cleanUrl(row.linkedin_url);
    const domain = extractDomain(website);
    const dockModels = String(row.dock_models || "").trim();
    const dockKeywords = parseDockModels(dockModels);
    const dockModelsStr = dockKeywords.join(", ") || null;
    const ev1 = cleanUrl(row.evidence_url_1);
    const ev2 = cleanUrl(row.evidence_url_2);
    const src1 = String(row.source_type_1 || "").trim();
    const src2 = String(row.source_type_2 || "").trim();
    const role = roleNorm(String(row.role || "").trim());
    const notes = String(row.notes || row.__EMPTY || "").trim() || null;

    const newVerifs = [];
    if (ev1) newVerifs.push({ method: "chatgpt", hits: 1, url: ev1, relevance: "direct", at: new Date().toISOString(), keywords_matched: dockKeywords, post_date: null, note: src1 || null });
    if (ev2) newVerifs.push({ method: "chatgpt", hits: 1, url: ev2, relevance: "direct", at: new Date().toISOString(), keywords_matched: dockKeywords, post_date: null, note: src2 || null });

    // Match: manual map → name → domain → partial
    const manualTarget = MANUAL_MERGE_MAP[normName];
    let match = null;
    let matchMethod = "";

    if (manualTarget) {
      match = byName.get(manualTarget);
      matchMethod = `manual(${normName}→${manualTarget})`;
    }
    if (!match) { match = byName.get(normName); matchMethod = "name"; }
    if (!match && domain) { match = byDomain.get(domain); matchMethod = "domain"; }
    if (!match) {
      for (const [en, er] of byName.entries()) {
        if (normName.length > 4 && en.length > 4 && (normName.includes(en) || en.includes(normName))) {
          match = er; matchMethod = "partial"; break;
        }
      }
    }

    if (match) {
      const existingSrc = match.source_types || [];
      const mergedSrc = [...new Set([...existingSrc, "chatgpt"])];
      const existingVerifs = Array.isArray(match.verifications) ? match.verifications : [];
      const mergedVerifs = [...existingVerifs, ...newVerifs];
      const existingKw = (match.dock_models || "").split(",").map(s=>s.trim()).filter(Boolean);
      const allKw = [...new Set([...existingKw, ...dockKeywords])].sort();
      const mergedModels = allKw.join(", ") || null;
      const dockVerified = match.dock_verified === true ? true : (newVerifs.length > 0 ? true : match.dock_verified);

      mergeResults.push({
        csv: name, existing: match.company_name, matchMethod, id: match.id,
        srcChange: existingSrc.join(",") + " → " + mergedSrc.join(","),
        verifChange: existingVerifs.length + " → " + mergedVerifs.length + " (+" + newVerifs.length + ")",
        modelChange: (match.dock_models||"null") + " → " + (mergedModels||"null"),
        ev1, ev2,
        payload: {
          source_types: mergedSrc, verifications: mergedVerifs,
          dock_verified: dockVerified, dock_models: mergedModels,
          website: match.website || website, linkedin: match.linkedin || linkedin,
          role: match.role || role, notes: match.notes || notes,
          updated_at: new Date().toISOString(),
        },
      });
    } else {
      insertResults.push({ name, normName, domain, website, linkedin, role, dockModelsStr, newVerifs, notes, ev1, ev2 });
    }
  }

  console.log("═══════════════════════════════════");
  console.log("MERGES:", mergeResults.length);
  console.log("NEW INSERTS:", insertResults.length);
  console.log("═══════════════════════════════════\n");

  console.log("── MERGES ──");
  for (const m of mergeResults) {
    console.log(`\n${m.csv} → "${m.existing}" (${m.matchMethod})`);
    console.log("  sources: " + m.srcChange);
    console.log("  verifs: " + m.verifChange);
    console.log("  models: " + m.modelChange);
    if (m.ev1) console.log("  + " + m.ev1.substring(0, 80));
    if (m.ev2) console.log("  + " + m.ev2.substring(0, 80));
  }

  console.log("\n── NEW INSERTS ──");
  for (const ins of insertResults) {
    console.log(`\n${ins.name} (norm: ${ins.normName})`);
    console.log("  domain: " + (ins.domain||"null") + " | web: " + (ins.website||"null") + " | li: " + (ins.linkedin||"null"));
    console.log("  models: " + ins.dockModelsStr + " | role: " + ins.role);
    console.log("  verifs: " + ins.newVerifs.length);
    if (ins.ev1) console.log("  + " + ins.ev1.substring(0, 80));
    if (ins.ev2) console.log("  + " + ins.ev2.substring(0, 80));
    if (ins.notes) console.log("  notes: " + ins.notes.substring(0, 120));
  }

  if (!DRY_RUN) {
    console.log("\n\n═══ EXECUTING ═══");
    let merged=0, inserted=0, errors=0;
    for (const m of mergeResults) {
      const { error } = await db.from("multi_sources_companies_import").update(m.payload).eq("id", m.id);
      if (error) { console.error("  ERROR " + m.existing + ":", error.message); errors++; }
      else { console.log("  ✓ MERGED: " + m.existing); merged++; }
    }
    for (const ins of insertResults) {
      const { error } = await db.from("multi_sources_companies_import").insert({
        company_name: ins.name, country_code: "NL", normalized_name: ins.normName,
        normalized_domain: ins.domain, website: ins.website, linkedin: ins.linkedin,
        role: ins.role, imported_via: "chatgpt", import_batch: "chatgpt-nl-29Mar",
        source_types: ["chatgpt"], dock_verified: ins.newVerifs.length > 0 ? true : null,
        dock_models: ins.dockModelsStr, verifications: ins.newVerifs, notes: ins.notes,
      });
      if (error) { console.error("  ERROR " + ins.name + ":", error.message); errors++; }
      else { console.log("  ✓ INSERTED: " + ins.name); inserted++; }
    }
    console.log(`\n═══ RESULT: ${merged} merged, ${inserted} inserted, ${errors} errors ═══`);
  } else {
    console.log("\n[DRY RUN — no writes]");
  }
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
