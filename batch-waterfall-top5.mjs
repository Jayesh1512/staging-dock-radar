#!/usr/bin/env node
/**
 * OPTIMIZED WATERFALL: Apollo → LinkedIn Puppeteer → Lemlist
 * Goal: Get emails + LinkedIn profiles for top 5 DSPs
 */

const companies = [
  {
    name: "heliguy™",
    domain: "heliguy.com",
    linkedin_url: "https://www.linkedin.com/company/heliguy",
    known_persons: ["Richard", "Matthew"],
    status: "TIER1_DONE",
  },
  {
    name: "KIONIQ",
    domain: "kioniq.com",
    linkedin_url: "https://www.linkedin.com/company/kioniq",
    known_persons: [],
    status: "TIER1_PARTIAL",
  },
  {
    name: "Gresco UAS",
    domain: null,
    linkedin_url: null,
    known_persons: [],
    status: "BLOCKED_NO_DOMAIN",
  },
  {
    name: "Skyports Drone Services",
    domain: null,
    linkedin_url: null,
    known_persons: [],
    status: "BLOCKED_NO_DOMAIN",
  },
  {
    name: "Eleccon",
    domain: null,
    linkedin_url: null,
    known_persons: [],
    status: "BLOCKED_NO_DOMAIN",
  },
];

const BASE_URL = "http://localhost:3000";

/**
 * WATERFALL LOGIC:
 * 1. TIER 1: Article-extracted persons (already done)
 * 2. TIER 2: Apollo People Discovery (API call)
 * 3. TIER 3: LinkedIn Puppeteer company page scrape (if Apollo < 3)
 * 4. TIER 4: Lemlist fallback (if Tier 2+3 < 3)
 */

async function enrichWithApolloPipeline(company) {
  if (!company.domain) {
    console.log(`\n[${company.name}] ⚠️  SKIPPED: No domain (needs manual web search first)`);
    return {
      company: company.name,
      status: "blocked_no_domain",
      contacts: [],
    };
  }

  console.log(`\n[${company.name}] TIER 2: Apollo People Search...`);

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

    if (!res.ok) {
      console.log(`  ❌ Apollo failed (HTTP ${res.status})`);
      return { company: company.name, status: "apollo_failed", contacts: [] };
    }

    const data = await res.json();
    const apolloContacts = data.contacts || [];

    console.log(`  ✅ Apollo found: ${apolloContacts.length} contacts`);
    apolloContacts.forEach((c, i) => {
      console.log(`    ${i + 1}. ${c.name || "(no name)"} | ${c.title || "—"} | ${c.linkedinUrl ? "🔗" : "—"}`);
    });

    return {
      company: company.name,
      status: "apollo_success",
      tier: "TIER_2_APOLLO",
      contacts: apolloContacts,
      contactCount: apolloContacts.length,
    };
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
    return { company: company.name, status: "apollo_error", contacts: [] };
  }
}

/**
 * TIER 3: LinkedIn Puppeteer Scrape (FREE, but slower)
 * Use case: When Apollo returns 0-1 results
 * 
 * PSEUDO-CODE (not yet implemented):
 * 1. Visit company LinkedIn page: linkedin.com/company/{slug}
 * 2. Scroll "People" tab
 * 3. Extract: name, title, profile_url
 * 4. Use email inference: firstname.lastname@domain.com
 * 5. Verify email via Lemlist (5 credits)
 */
async function enrichWithLinkedInPuppeteer(company) {
  if (!company.linkedin_url) {
    console.log(`\n[${company.name}] ⚠️  TIER 3 SKIPPED: No LinkedIn URL`);
    return { company: company.name, status: "no_linkedin_url", contacts: [] };
  }

  console.log(`\n[${company.name}] TIER 3: LinkedIn Company Page Scrape...`);
  console.log(`  🔗 URL: ${company.linkedin_url}`);
  console.log(`  📝 Method: Puppeteer → Extract employees from "People" tab`);
  console.log(`  ⏱️  Time: ~30-45 seconds per company (includes scroll + extract)`);
  console.log(`  💰 Cost: FREE (Puppeteer only, no API calls)`);
  console.log(`  ❌ Status: NOT YET IMPLEMENTED (see notes below)`);

  return {
    company: company.name,
    status: "not_implemented",
    tier: "TIER_3_LINKEDIN_PUPPETEER",
    linkedin_url: company.linkedin_url,
    estimated_contacts: "3-5",
    cost: "free",
    notes: "Can use existing LinkedIn scraping from collectCompanyPostsCore.ts",
  };
}

/**
 * TIER 4: Lemlist Fallback (COST: 5 credits per email)
 */
async function enrichWithLemlistFallback(company, existingContacts) {
  if (existingContacts.length >= 3) {
    console.log(`\n[${company.name}] ✅ TIER 4 SKIPPED: Already have ${existingContacts.length} contacts`);
    return { company: company.name, status: "skipped_enough_contacts", contacts: [] };
  }

  console.log(`\n[${company.name}] TIER 4: Lemlist Fallback...`);
  console.log(`  📊 Current contacts: ${existingContacts.length} (need 3+)`);
  console.log(`  🔍 Searching Lemlist 450M database...`);
  console.log(`  💰 Cost: ~5 credits per found email`);
  console.log(`  ❌ Status: NOT YET CALLED (low priority)`);

  return {
    company: company.name,
    status: "not_called",
    tier: "TIER_4_LEMLIST",
    reason: "Would cost credits; Tier 2+3 should return 3+ contacts",
  };
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("  OPTIMIZED WATERFALL: Apollo → LinkedIn Puppeteer → Lemlist");
  console.log("═══════════════════════════════════════════════════════════════════════");

  const results = [];

  for (const company of companies) {
    // TIER 2: Apollo
    const apolloResult = await enrichWithApolloPipeline(company);
    results.push(apolloResult);

    if (apolloResult.contactCount < 3) {
      // TIER 3: LinkedIn Puppeteer (if Apollo insufficient)
      await enrichWithLinkedInPuppeteer(company);

      // TIER 4: Lemlist (if Tier 2+3 insufficient)
      await enrichWithLemlistFallback(company, apolloResult.contacts);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log("\n═══════════════════════════════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════════════");

  const blocked = results.filter(r => r.status === "blocked_no_domain").length;
  const succeeded = results.filter(r => r.status === "apollo_success").length;
  const totalContacts = results.reduce((sum, r) => sum + (r.contactCount || 0), 0);

  console.log(`\n✅ Successful enrichments: ${succeeded}/5`);
  console.log(`⚠️  Blocked (no domain): ${blocked}/5`);
  console.log(`📧 Total contacts found: ${totalContacts}`);
  console.log(`\n💡 Next action: For blocked companies, run web search to resolve domains`);
}

main().catch(console.error);
