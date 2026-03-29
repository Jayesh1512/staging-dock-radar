/**
 * CSV / pipeline: Apollo first for website + LinkedIn, then Serper fallbacks
 * (same strategy as registry enrich-batch Track A–C, condensed).
 */

import { cleanCompanyName } from '@/lib/company-name-clean';
import {
  apolloCompanySearch,
  apolloOrgEnrich,
  extractDomain,
  hasApolloKey,
  normalizeWebsiteUrl,
  serperDomainLookup,
  serperLinkedInLookup,
} from '@/lib/company-enrichment/apolloSerper';

export type EnrichCompanySources = {
  apollo_search: boolean;
  apollo_org_enrich: boolean;
  serper_domain: boolean;
  serper_linkedin: boolean;
};

export type EnrichCompanyWebLinkedinResult = {
  website: string | null;
  linkedin: string | null;
  /** At least one of website or linkedin resolved */
  enriched: boolean;
  sources: EnrichCompanySources;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param companyName — legal / display name
 * @param location — optional; included in Serper domain query for disambiguation
 * @param countryCode — ISO-2 for Serper `gl`
 */
export async function enrichCompanyWebLinkedin(
  companyName: string,
  location: string | undefined,
  countryCode: string,
  serperApiKey: string | undefined,
): Promise<EnrichCompanyWebLinkedinResult> {
  const sources: EnrichCompanySources = {
    apollo_search: false,
    apollo_org_enrich: false,
    serper_domain: false,
    serper_linkedin: false,
  };

  let website: string | null = null;
  let linkedin: string | null = null;

  const cleaned = cleanCompanyName(companyName);
  const serperQueryName = [companyName, location].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  if (hasApolloKey()) {
    for (const variant of cleaned.variants) {
      try {
        const r = await apolloCompanySearch(variant);
        if (r.domain || r.linkedinUrl) {
          sources.apollo_search = true;
          if (r.domain) website = normalizeWebsiteUrl(r.domain);
          if (r.linkedinUrl) linkedin = r.linkedinUrl;
          break;
        }
      } catch {
        /* Apollo misconfigured */
      }
      await sleep(300);
    }
  }

  if (!website && serperApiKey) {
    const w = await serperDomainLookup(serperQueryName, countryCode, serperApiKey);
    if (w) {
      website = w;
      sources.serper_domain = true;
    }
  }

  const domain = extractDomain(website);
  if (domain && !linkedin && hasApolloKey()) {
    try {
      const li = await apolloOrgEnrich(domain);
      if (li.linkedinUrl) {
        linkedin = li.linkedinUrl;
        sources.apollo_org_enrich = true;
      }
    } catch {
      /* ignore */
    }
  }

  if (!linkedin && serperApiKey) {
    const li = await serperLinkedInLookup(cleaned.cleaned, countryCode, serperApiKey);
    if (li) {
      linkedin = li;
      sources.serper_linkedin = true;
    }
  }

  const enriched = Boolean(website || linkedin);
  return { website, linkedin, enriched, sources };
}
