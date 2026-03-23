/**
 * Domain extraction, classification, and grouping from search results.
 * Keeps social links (LinkedIn, Facebook, Instagram) as evidence.
 * Groups results by company entity.
 */

import type { SerperResult } from './serper';

// Only exclude manufacturer, encyclopedias, marketplaces, govt — NOT social platforms
const EXCLUDE_DOMAINS = [
  'dji.com',
  'wikipedia.org',
  'amazon.fr', 'amazon.com', 'amazon.de', 'amazon.co.uk',
  'cdiscount.com', 'ebay.fr', 'ebay.com',
  'gouv.fr',
  'flytbase.com',
];

// Social domains — keep results but tag them for company slug extraction
const SOCIAL_DOMAINS = [
  'linkedin.com',
  'facebook.com',
  'instagram.com',
  'youtube.com',
  'reddit.com',
  'twitter.com',
  'x.com',
];

export type ResultType = 'direct' | 'social' | 'excluded';

export interface ClassifiedResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
  domain: string;        // root domain e.g. "instadrone.fr"
  type: ResultType;
  socialPlatform?: string;  // e.g. "linkedin", "facebook"
  companySlug?: string;     // extracted from social URL e.g. "instadrone"
}

export interface GroupedCompany {
  slug: string;
  domains: string[];        // all unique domains associated
  results: ClassifiedResult[];
  snippetText: string;      // all snippets + titles concatenated for scoring
  resultCount: number;
}

function extractRootDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname;
  } catch {
    return '';
  }
}

function isSocialDomain(domain: string): boolean {
  return SOCIAL_DOMAINS.some(sd => domain.endsWith(sd));
}

function isExcludedDomain(domain: string): boolean {
  return EXCLUDE_DOMAINS.some(ex => domain.endsWith(ex));
}

function getSocialPlatform(domain: string): string | undefined {
  if (domain.includes('linkedin')) return 'linkedin';
  if (domain.includes('facebook')) return 'facebook';
  if (domain.includes('instagram')) return 'instagram';
  if (domain.includes('youtube')) return 'youtube';
  if (domain.includes('reddit')) return 'reddit';
  if (domain.includes('twitter') || domain.includes('x.com')) return 'twitter';
  return undefined;
}

/**
 * Extract a company slug from a social media URL path.
 * e.g. facebook.com/instadronebrive → "instadrone"
 *      linkedin.com/posts/instadrone-sarl_... → "instadrone"
 *      linkedin.com/company/escadrone → "escadrone"
 */
function extractCompanySlugFromSocialUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);

    if (u.hostname.includes('linkedin')) {
      // /company/name or /posts/name_hash or /in/name
      if (parts[0] === 'company' && parts[1]) return normalizeSlug(parts[1]);
      if (parts[0] === 'posts' && parts[1]) {
        // posts/instadrone-sarl_découvrez... → take before underscore
        const name = parts[1].split('_')[0];
        return normalizeSlug(name);
      }
      if (parts[0] === 'in' && parts[1]) return normalizeSlug(parts[1]);
    }

    if (u.hostname.includes('facebook') || u.hostname.includes('instagram')) {
      // /instadronebrive/posts/... or /instadronebrive
      if (parts[0] && parts[0] !== 'p' && parts[0] !== 'watch') {
        return normalizeSlug(parts[0]);
      }
    }

    if (u.hostname.includes('youtube')) {
      // /@CompanyName or /channel/... or /watch?v=...
      if (parts[0]?.startsWith('@')) return normalizeSlug(parts[0].slice(1));
      if (parts[0] === 'channel' && parts[1]) return normalizeSlug(parts[1]);
    }

    if (u.hostname.includes('reddit')) {
      // /r/subreddit/...
      if (parts[0] === 'r' && parts[1]) return normalizeSlug(parts[1]);
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/-sarl$/i, '')
    .replace(/-sas$/i, '')
    .replace(/-ltd$/i, '')
    .replace(/-gmbh$/i, '')
    .replace(/[^a-z0-9]/g, '');
}

function domainToSlug(domain: string): string {
  // escadrone.com → "escadrone", flyingeye.fr → "flyingeye"
  const name = domain.split('.')[0];
  return normalizeSlug(name);
}

export function classifyResults(results: SerperResult[]): ClassifiedResult[] {
  return results.map(r => {
    const domain = extractRootDomain(r.link);
    if (!domain) {
      return { ...r, domain, type: 'excluded' as ResultType };
    }

    if (isExcludedDomain(domain)) {
      return { ...r, domain, type: 'excluded' as ResultType };
    }

    if (isSocialDomain(domain)) {
      return {
        ...r,
        domain,
        type: 'social' as ResultType,
        socialPlatform: getSocialPlatform(domain),
        companySlug: extractCompanySlugFromSocialUrl(r.link),
      };
    }

    return { ...r, domain, type: 'direct' as ResultType };
  });
}

export function groupByCompany(classified: ClassifiedResult[]): GroupedCompany[] {
  const kept = classified.filter(r => r.type !== 'excluded');

  // Build slug → results map
  const slugMap = new Map<string, ClassifiedResult[]>();

  for (const r of kept) {
    const slug = r.type === 'social'
      ? (r.companySlug ?? r.domain)
      : domainToSlug(r.domain);

    if (!slug) continue;

    const existing = slugMap.get(slug) ?? [];
    existing.push(r);
    slugMap.set(slug, existing);
  }

  const groups: GroupedCompany[] = [];

  for (const [slug, results] of slugMap.entries()) {
    const domains = [...new Set(results.map(r => r.domain))];
    const snippetText = results
      .map(r => `${r.title} ${r.snippet}`)
      .join(' ');

    groups.push({
      slug,
      domains,
      results,
      snippetText,
      resultCount: results.length,
    });
  }

  return groups;
}
