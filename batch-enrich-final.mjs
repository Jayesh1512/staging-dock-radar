#!/usr/bin/env node
/**
 * INTEGRATED WATERFALL WITH EMAIL VERIFICATION
 * 
 * For 5 DSPs: Get emails + LinkedIn profiles in one pipeline
 * Waterfall: Apollo → Lemlist email verification → LinkedIn Puppeteer (if needed)
 */

const companies = [
  { name: "heliguy™", domain: "heliguy.com", linkedin: "heliguy", persons: ["Richard", "Matthew"] },
  { name: "KIONIQ", domain: "kioniq.com", linkedin: "kioniq", persons: [] },
  { name: "Gresco UAS", domain: null, linkedin: null, persons: [] },
  { name: "Skyports Drone Services", domain: null, linkedin: null, persons: [] },
  { name: "Eleccon", domain: null, linkedin: null, persons: [] },
];

const BASE_URL = "http://localhost:3000";

async function verifyEmailLemlist(name, title, org, domain) {
  try {
    const res = await fetch(`${BASE_URL}/api/utilities/lemlist/find-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: name, role: title, organization: org, companyDomain: domain }),
    });
    
    if (!res.ok) return null;
    const data = await res.json();
    return data.email || null;
  } catch {
    return null;
  }
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║         TOP 5 DSP ENRICHMENT: Emails + LinkedIn Profiles               ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝\n");

  const finalResults = [];

  for (const company of companies) {
    console.log(`\n┌─ ${company.name.padEnd(30)} ─────────────────────┐`);

    // TIER 2: Apollo
    console.log(`│ TIER 2: Apollo People Search`);
    let apolloContacts = [];
    
    if (!company.domain) {
      console.log(`│   ⚠️  Skipped (no domain)`);
    } else {
      try {
        const res = await fetch(`${BASE_URL}/api/contacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            persons: [],
            targetOrgs: [company.name],
            domainOverrides: { [company.name]: company.domain },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          apolloContacts = data.contacts || [];
          console.log(`│   ✅ Found: ${apolloContacts.length} contacts`);
        }
      } catch (err) {
        console.log(`│   ❌ Error: ${err.message}`);
      }
    }

    // TIER 4: Email Verification
    console.log(`│ TIER 4: Email Verification (Lemlist)`);
    const enrichedContacts = [];

    if (apolloContacts.length > 0) {
      for (const contact of apolloContacts) {
        if (!contact.name) continue;

        const email = await verifyEmailLemlist(contact.name, contact.title || "", company.name, company.domain);
        enrichedContacts.push({
          name: contact.name,
          title: contact.title || "(no title)",
          email: email || "(not found)",
          linkedin: contact.linkedinUrl || "(no link)",
          source: "Apollo",
        });
        console.log(`│   ${contact.name}: ${email ? "✅ " + email : "❌ not found"}`);
        
        // Rate limit Lemlist (2s per request)
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } else {
      console.log(`│   (no contacts to verify)`);
    }

    // TIER 3: LinkedIn Puppeteer (if < 3 contacts)
    if (enrichedContacts.length < 3 && company.linkedin) {
      console.log(`│ TIER 3: LinkedIn Puppeteer Scrape`);
      console.log(`│   🔗 linkedin.com/company/${company.linkedin}`);
      console.log(`│   ⏳ Would extract: ~3-5 employees (NOT YET IMPLEMENTED)`);
      console.log(`│   💰 Cost: FREE (Puppeteer only)`);
    }

    console.log(`└──────────────────────────────────────────────────────┘`);

    finalResults.push({
      company: company.name,
      contactsFound: enrichedContacts.length,
      contacts: enrichedContacts,
    });
  }

  // SUMMARY TABLE
  console.log("\n╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║                              FINAL RESULTS                             ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝\n");

  console.log("┌─ Company                 ─ Contacts ─ Email Status ─────────────────────┐");
  
  let totalEmails = 0;
  finalResults.forEach((result, i) => {
    const contacted = result.contacts.filter(c => c.email !== "(not found)").length;
    totalEmails += contacted;
    
    const company = result.company.substring(0, 25).padEnd(25);
    const contactCount = `${result.contactsFound}`.padEnd(10);
    const emailCount = `${contacted}/${result.contactsFound} found`.padEnd(15);
    
    console.log(`│ ${company} │ ${contactCount}│ ${emailCount}│`);
    
    result.contacts.forEach(c => {
      const name = `  → ${c.name}`.substring(0, 27).padEnd(27);
      const email = c.email.substring(0, 35).padEnd(35);
      console.log(`│ ${name}│ ${email}│`);
    });
  });

  console.log("└────────────────────────────────────────────────────────────────────────┘");
  console.log(`\n📊 TOTAL: ${totalEmails} verified emails across 5 companies`);
  console.log(`💰 Lemlist credits used: ~${Math.ceil(totalEmails * 1.5)}`);
  console.log(`⏱️  Time spent: ~${Math.ceil(totalEmails * 2 / 60)} minutes (2s per email verification)`);
}

main().catch(console.error);
