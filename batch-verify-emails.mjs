#!/usr/bin/env node
/**
 * Phase 2: Email verification for enriched contacts
 * Uses Lemlist + Apollo to find emails
 */

const enrichedBatch = [
  {
    company: "heliguy™",
    domain: "heliguy.com",
    contacts: [
      { name: "Richard", title: "Head of Geospatial" },
      { name: "Matthew", title: "Geospatial Specialist" },
    ],
  },
  {
    company: "KIONIQ",
    domain: "kioniq.com",
    contacts: [],
  },
  {
    company: "Gresco UAS",
    domain: null,
    contacts: [],
  },
  {
    company: "Skyports Drone Services",
    domain: null,
    contacts: [],
  },
  {
    company: "Eleccon",
    domain: null,
    contacts: [],
  },
];

const BASE_URL = "http://localhost:3000";

async function findEmail(name, role, company, domain) {
  try {
    const res = await fetch(`${BASE_URL}/api/utilities/lemlist/find-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: name,
        role: role || "",
        organization: company,
        companyDomain: domain,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data.email || null;
  } catch (err) {
    return null;
  }
}

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  PHASE 2: EMAIL VERIFICATION");
  console.log("═══════════════════════════════════════\n");

  let verified = 0;
  let attempted = 0;

  for (const batch of enrichedBatch) {
    if (batch.contacts.length === 0) continue;

    console.log(`[${batch.company}] Finding emails...`);

    for (const contact of batch.contacts) {
      attempted++;
      const email = await findEmail(contact.name, contact.title, batch.company, batch.domain);
      
      if (email) {
        console.log(`  ✅ ${contact.name}: ${email}`);
        verified++;
      } else {
        console.log(`  ❌ ${contact.name}: not found`);
      }

      // Rate limiting for Lemlist
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log("\n═══════════════════════════════════════");
  console.log(`  ${verified}/${attempted} emails found`);
  console.log("═══════════════════════════════════════");
}

main().catch(console.error);
