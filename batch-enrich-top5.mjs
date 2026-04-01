#!/usr/bin/env node
/**
 * Batch enrichment for top 5 DSPs
 * Runs /api/contacts for each company
 */

const companies = [
  { name: "heliguy™", domain: "heliguy.com", notes: "Germany, Construction, BVLOS" },
  { name: "KIONIQ", domain: "kioniq.com", notes: "Austria, Tourism, Ski resort" },
  { name: "Gresco UAS", domain: null, notes: "US, Energy/Utilities, Inspection" },
  { name: "Skyports Drone Services", domain: null, notes: "Germany, Construction" },
  { name: "Eleccon", domain: null, notes: "Chile, Mining" },
];

const BASE_URL = "http://localhost:3000";

async function enrichCompany(company) {
  console.log(`\n[${company.name}] Starting enrichment...`);
  
  const payload = {
    persons: [],
    targetOrgs: [company.name],
    ...(company.domain && { domainOverrides: { [company.name]: company.domain } }),
  };

  try {
    const res = await fetch(`${BASE_URL}/api/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(`  ❌ HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const contacts = data.contacts || [];
    const orgs = data.orgResolutions || [];

    console.log(`  ✅ Domain resolved: ${orgs[0]?.domain || "(none)"}`);
    console.log(`  📧 Contacts found: ${contacts.length}`);
    
    if (contacts.length > 0) {
      contacts.forEach((c, i) => {
        console.log(`    ${i + 1}. ${c.name || "(no name)"} | ${c.title || "—"} | ${c.email || "no email"}`);
      });
    }

    return { company: company.name, contacts, orgResolutions: orgs };
  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  BATCH ENRICHMENT — Top 5 DSPs");
  console.log("═══════════════════════════════════════");

  const results = [];

  for (const company of companies) {
    const result = await enrichCompany(company);
    if (result) results.push(result);
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  console.log("\n═══════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("═══════════════════════════════════════");
  
  let totalContacts = 0;
  results.forEach(r => {
    console.log(`${r.company}: ${r.contacts.length} contacts`);
    totalContacts += r.contacts.length;
  });

  console.log(`\nTotal contacts enriched: ${totalContacts}`);
  console.log("\n✅ Enrichment complete");
}

main().catch(console.error);
