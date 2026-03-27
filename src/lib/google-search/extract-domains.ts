/**
 * Domain extraction, classification, and grouping from search results.
 * Keeps social links (LinkedIn, Facebook, Instagram) as evidence.
 * Groups results by company entity.
 */

import type { SerperResult } from './serper';

// Exclude manufacturer, encyclopedias, marketplaces, govt — global coverage
const EXCLUDE_DOMAINS = [
  // DJI own domains
  'dji.com',
  // Encyclopedias
  'wikipedia.org',
  // Marketplaces (global)
  'amazon.com', 'amazon.fr', 'amazon.de', 'amazon.co.uk', 'amazon.co.jp',
  'amazon.in', 'amazon.com.au', 'amazon.sg', 'amazon.com.br', 'amazon.it',
  'amazon.es', 'amazon.ca', 'amazon.com.tr', 'amazon.pl', 'amazon.sa',
  'ebay.com', 'ebay.fr', 'ebay.de', 'ebay.co.uk', 'ebay.com.au',
  'cdiscount.com', 'alibaba.com', 'aliexpress.com',
  'mercadolibre.com', 'rakuten.co.jp', 'flipkart.com',
  // Government
  'gouv.fr', 'gov.uk', 'gov.au', 'go.jp', 'gov.in', 'gov.sa', 'gov.ae',
  // FlytBase (own product)
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
  date?: string;         // date from Google result (e.g. "27 févr. 2025")
  domain: string;        // root domain e.g. "instadrone.fr"
  type: ResultType;
  socialPlatform?: string;  // e.g. "linkedin", "facebook"
  companySlug?: string;     // extracted from social URL e.g. "instadrone"
}

export type EntityType = 'operator' | 'reseller' | 'media' | 'unknown';

export interface GroupedCompany {
  slug: string;
  companyName: string;      // best-guess display name extracted from Google titles
  domains: string[];        // all unique domains associated
  results: ClassifiedResult[];
  snippetText: string;      // all snippets + titles concatenated for scoring
  resultCount: number;
  entityType: EntityType;   // classified: operator/DSP vs reseller vs media
  fence: string | null;     // hybrid signal (e.g. "rental", "enterprise subdomain")
  lastSeen?: string;        // latest date from any Google result in this group
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

// ── Entity type classification (v5) ──
//
// Two-tier operator signals + domain rules + fence flag.
// Primary operator = service-delivery language (pure resellers never use these)
// Secondary operator = DJI product-feature language (ambiguous — appears on all DJI Dock pages)
//
// Rules (in priority order):
//   R0: DJI domain/slug → Reseller
//   R1: Domain pattern (.store, .shop, shop., store., boutique.) → Reseller
//   R2: Known reseller/media slug patterns → Reseller/Media
//   R3: Academic (.edu, researchgate) → Unknown
//   R4: Content:
//     a. Primary OP + Secondary OP both present → DSP/SI (confirmed service company)
//     b. Primary OP only + Reseller present → Reseller (product-description leakage)
//     c. Primary OP only + no Reseller → DSP/SI
//     d. Media dominates → Media
//     e. Secondary OP > 0 + Reseller = 0 → DSP/SI (no counter-evidence)
//     f. Reseller > 0 → Reseller
//     g. Secondary OP > 0 → DSP/SI
//     h. Nothing → Unknown
//   FENCE: Reseller + ('rental'/'location de drone' in text OR 'enterprise' subdomain)

const OP_PRIMARY_SIGNALS = [
  'prestataire', 'opérateur drone', 'drone operator',
  'déploiement',
  'consulting', 'integrat', 'intégrateur',
  'nous réalisons', 'our services', 'nos services',
  'drone as a service', 'daas',
  'notre flotte', 'our fleet',
  'intervention', 'prestation',
  'enterprise solution', 'solutions industrielles',
  'projet', 'project',
];

const OP_SECONDARY_SIGNALS = [
  'autonome', 'sécurité', 'security', 'surveillance', 'monitoring',
  'mission', 'télépilote', 'bvlos',
  'client',
];

const RESELLER_SIGNALS = [
  'shop', 'store', 'buy', 'price', 'acheter', 'prix', 'panier',
  'cart', 'boutique', 'catalog', 'add to cart', 'ajouter au panier',
  'livraison', 'shipping', 'parts', 'accessories', 'pièces',
  'comparateur', 'compare', 'deals', 'product', 'produit',
  '€', '$', 'order', 'commander', 'en stock', 'in stock',
  'free shipping', 'livraison gratuite', 'specifications',
  'specs', 'weight', 'poids',
  'revendeur', 'distributeur', 'dealer', 'reseller',
  'gamme', 'fiche technique', 'caractéristiques',
  'ajouter', 'quantité', 'quantity',
];

const MEDIA_SIGNALS = [
  'blog', 'article', 'news', 'review', 'actualité',
  'presse', 'press', 'magazine', 'media', 'journal', 'rédaction',
  'tag/', 'category/', '/tag/', '/category/',
  'newsroom', 'press release', 'communiqué',
];

const KNOWN_RESELLER_PATTERNS = [
  'parts', 'store', 'shop', 'boutique', 'buy', 'pro', 'center',
  'supply', 'outlet', 'market', 'deals', 'direct',
];

const KNOWN_MEDIA_PATTERNS = [
  'news', 'blog', 'trend', 'share', 'press',
];

const DJI_DOMAINS = ['dji.fr', 'dji.com', 'dji-paris.com', 'dji-retail.co.uk'];
const FENCE_TEXT = ['rental', 'location de drone'];
const FENCE_SUBDOMAINS = ['enterprise'];

function countSignals(text: string, keywords: string[]): number {
  let total = 0;
  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const count = (text.match(new RegExp(escaped, 'gi')) || []).length;
    if (count > 0) total += Math.min(count, 3);
  }
  return total;
}

export interface EntityClassification {
  type: EntityType;
  fence: string | null;
}

function classifyEntityType(snippetText: string, domains: string[], slug: string): EntityClassification {
  const text = snippetText.toLowerCase();
  const slugStr = domains.map(d => d.split('.')[0]).join(' ').toLowerCase();

  // R0: DJI domain/slug → Reseller
  if (domains.some(d => DJI_DOMAINS.some(dji => d.endsWith(dji)))) {
    return { type: 'reseller', fence: null };
  }
  if (/^dji/.test(slug) || slug === 'djlfrance') {
    return { type: 'reseller', fence: null };
  }

  // R1: Domain pattern (.store, .shop, subdomain)
  if (domains.some(d => d.includes('shop.') || d.includes('store.') || d.includes('boutique.'))) {
    return { type: 'reseller', fence: checkFence(text, domains) };
  }
  if (domains.some(d => d.endsWith('.store') || d.endsWith('.shop'))) {
    return { type: 'reseller', fence: checkFence(text, domains) };
  }

  // R2: Known domain slug patterns
  for (const pattern of KNOWN_RESELLER_PATTERNS) {
    if (slugStr.includes(pattern)) {
      return { type: 'reseller', fence: null };
    }
  }
  for (const pattern of KNOWN_MEDIA_PATTERNS) {
    if (slugStr.includes(pattern)) {
      return { type: 'media', fence: null };
    }
  }

  // R3: Academic
  if (domains.some(d => d.endsWith('.edu')) || slugStr.includes('researchgate')) {
    return { type: 'unknown', fence: null };
  }

  // R4: Content-based (two-tier operator)
  const primary = countSignals(text, OP_PRIMARY_SIGNALS);
  const secondary = countSignals(text, OP_SECONDARY_SIGNALS);
  const reseller = countSignals(text, RESELLER_SIGNALS);
  const media = countSignals(text, MEDIA_SIGNALS);

  // R4a: Primary + Secondary = confirmed DSP/SI
  if (primary > 0 && secondary > 0) return { type: 'operator', fence: null };
  // R4b: Primary only + Reseller present = product-description leakage
  if (primary > 0 && secondary === 0 && reseller > 0) return { type: 'reseller', fence: checkFence(text, domains) };
  // R4c: Primary only, no reseller
  if (primary > 0 && reseller === 0) return { type: 'operator', fence: null };
  // R4d: Media dominates
  if (media > secondary && media > reseller) return { type: 'media', fence: null };
  // R4e: Secondary only + no reseller = DSP/SI (positive — no counter-evidence)
  if (secondary > 0 && reseller === 0) return { type: 'operator', fence: null };
  // R4f: Reseller wins
  if (reseller > 0) return { type: 'reseller', fence: checkFence(text, domains) };
  // R4g: Secondary only fallback
  if (secondary > 0) return { type: 'operator', fence: null };
  // R4h: Nothing
  return { type: 'unknown', fence: null };
}

function checkFence(text: string, domains: string[]): string | null {
  for (const sig of FENCE_TEXT) {
    const escaped = sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (text.match(new RegExp(escaped, 'gi'))) return sig;
  }
  for (const d of domains) {
    if (FENCE_SUBDOMAINS.includes(d.split('.')[0])) return 'enterprise subdomain';
  }
  return null;
}

// ── Company name extraction from Google titles ──

const TITLE_SEPARATORS = /\s[-|—:·]\s/;
const SOCIAL_TITLE_SUFFIXES = [
  'linkedin', 'facebook', 'instagram', 'youtube', 'twitter',
  'company page', 'official', 'accueil', 'home',
];

/**
 * Extract the most likely company display name from Google result titles.
 * Strategy: split titles on common separators, take first segment, pick most frequent.
 * Falls back to titleCase(slug) if nothing found.
 */
function extractCompanyName(results: ClassifiedResult[], slug: string): string {
  const candidates: string[] = [];

  for (const r of results) {
    if (!r.title) continue;
    // Split on " - ", " | ", " — ", " : ", " · "
    const parts = r.title.split(TITLE_SEPARATORS);
    if (parts.length > 0) {
      let name = parts[0].trim();
      // Skip if the first segment is just the social platform name
      if (SOCIAL_TITLE_SUFFIXES.some(s => name.toLowerCase() === s)) {
        // Try second segment instead
        if (parts.length > 1) name = parts[1].trim();
        else continue;
      }
      // Skip very short or very long fragments (likely garbage)
      if (name.length >= 2 && name.length <= 80) {
        candidates.push(name);
      }
    }
  }

  if (candidates.length === 0) {
    return titleCaseSlug(slug);
  }

  // Find most frequent candidate (case-insensitive)
  const freq = new Map<string, { count: number; original: string }>();
  for (const c of candidates) {
    const key = c.toLowerCase();
    const existing = freq.get(key);
    if (existing) {
      existing.count++;
    } else {
      freq.set(key, { count: 1, original: c });
    }
  }

  // Pick highest frequency, break ties by shortest (cleaner names)
  let best = { count: 0, original: titleCaseSlug(slug) };
  for (const entry of freq.values()) {
    if (entry.count > best.count ||
        (entry.count === best.count && entry.original.length < best.original.length)) {
      best = entry;
    }
  }

  return best.original;
}

function titleCaseSlug(slug: string): string {
  // "instadrone" → "Instadrone", "flyingeye" → "Flyingeye"
  if (!slug) return slug;
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

// ── Fuzzy slug merging ──

/**
 * Merge slugs that are substrings of each other.
 * e.g. "instadrone" and "instadronebrive" → merge under "instadrone"
 */
function mergeSimilarSlugs(slugMap: Map<string, ClassifiedResult[]>): Map<string, ClassifiedResult[]> {
  const slugs = [...slugMap.keys()].sort((a, b) => a.length - b.length);
  const merged = new Map<string, ClassifiedResult[]>();
  const mergedInto = new Map<string, string>(); // tracks which slug was absorbed

  for (const slug of slugs) {
    // Check if this slug is a substring expansion of an existing shorter slug
    let target: string | undefined;

    for (const existing of merged.keys()) {
      // "instadronebrive" starts with "instadrone" → merge
      if (slug.startsWith(existing) && slug.length > existing.length && existing.length >= 4) {
        target = existing;
        break;
      }
      // "instadrone" is prefix of "instadronebrive" (if longer came first somehow)
      if (existing.startsWith(slug) && existing.length > slug.length && slug.length >= 4) {
        // Re-key: move existing results under shorter slug
        const existingResults = merged.get(existing) ?? [];
        merged.delete(existing);
        merged.set(slug, existingResults);
        mergedInto.set(existing, slug);
        target = slug;
        break;
      }
    }

    const results = slugMap.get(slug) ?? [];
    if (target) {
      // Merge into existing
      const existing = merged.get(target) ?? [];
      existing.push(...results);
      merged.set(target, existing);
      mergedInto.set(slug, target);
    } else {
      merged.set(slug, [...results]);
    }
  }

  return merged;
}

export function groupByCompany(classified: ClassifiedResult[]): GroupedCompany[] {
  const kept = classified.filter(r => r.type !== 'excluded');

  // Build slug → results map
  const slugMap = new Map<string, ClassifiedResult[]>();

  for (const r of kept) {
    let slug: string;

    if (r.type === 'social') {
      // For social results: use extracted company slug, skip if none found
      if (r.companySlug && r.companySlug.length >= 3) {
        slug = r.companySlug;
      } else {
        // Can't extract company from URL — skip grouping under platform domain
        continue;
      }
    } else {
      slug = domainToSlug(r.domain);
    }

    if (!slug || slug.length < 2) continue;

    const existing = slugMap.get(slug) ?? [];
    existing.push(r);
    slugMap.set(slug, existing);
  }

  // Merge similar slugs (e.g. instadrone + instadronebrive)
  const mergedMap = mergeSimilarSlugs(slugMap);

  const groups: GroupedCompany[] = [];

  for (const [slug, results] of mergedMap.entries()) {
    const domains = [...new Set(results.map(r => r.domain))];
    const snippetText = results
      .map(r => `${r.title} ${r.snippet}`)
      .join(' ');

    const classification = classifyEntityType(snippetText, domains, slug);

    // Pick latest date from any result in this group
    const dates = results.map(r => r.date).filter(Boolean) as string[];
    const lastSeen = dates.length > 0 ? dates[0] : undefined; // dates already ordered by position (newest first from Google)

    groups.push({
      slug,
      companyName: extractCompanyName(results, slug),
      domains,
      results,
      snippetText,
      resultCount: results.length,
      entityType: classification.type,
      fence: classification.fence,
      lastSeen,
    });
  }

  return groups;
}
