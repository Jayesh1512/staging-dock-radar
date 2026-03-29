import { NextRequest, NextResponse } from 'next/server';
import { requireSupabase } from '@/lib/supabase';
import { normalizeCompanyName } from '@/lib/company-normalize';

/* ─── Types (mirror crawler output) ─── */

interface SourceUrl {
  link: string;
  title: string;
  snippet: string;
  type: 'direct' | 'social';
  socialPlatform?: string;
}

interface Signal {
  tier: string;
  keyword: string;
  count: number;
  points: number;
}

interface CompanyResult {
  slug: string;
  companyName: string;
  domains: string[];
  entityType: string;
  fence: string | null;
  lastSeen: string | null;
  totalScore: number;
  normalizedScore: number;
  freshnessBand: string;
  freshnessLabel: string;
  tier1Hit: boolean;
  tier2Hit: boolean;
  topSignal: string;
  signalCount: number;
  signals: Signal[];
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  resultCount: number;
  sourceUrls: SourceUrl[];
}

interface ImportPayload {
  keyword: string;
  country: string;
  companies: CompanyResult[];
}

/* ─── Helpers ─── */

const SOCIAL_DOMAINS = ['linkedin.com', 'facebook.com', 'instagram.com', 'youtube.com', 'reddit.com', 'twitter.com', 'x.com', 'tiktok.com'];
// Only LinkedIn and Facebook are kept as valid social evidence. Everything else is noise.
const EXCLUDE_SOCIAL = ['reddit.com', 'twitter.com', 'x.com', 'instagram.com', 'youtube.com', 'tiktok.com'];

function isSocialDomain(domain: string): boolean {
  return SOCIAL_DOMAINS.some(sd => domain.endsWith(sd));
}

function isExcludedSocialOnly(domains: string[]): boolean {
  const nonExcluded = domains.filter(d => !EXCLUDE_SOCIAL.some(ex => d.endsWith(ex)));
  return nonExcluded.length === 0; // all domains are reddit/twitter/instagram only
}

function extractWebsite(domains: string[]): string | null {
  const nonSocial = domains.filter(d => !isSocialDomain(d));
  if (nonSocial.length === 0) return null;
  return `https://${nonSocial[0]}/`;
}

function extractLinkedinCompanyUrl(sourceUrls: SourceUrl[]): string | null {
  for (const u of sourceUrls) {
    if (u.socialPlatform !== 'linkedin') continue;
    // Only extract /company/ pages, not posts or personal profiles
    const match = u.link.match(/linkedin\.com\/company\/([^/?]+)/);
    if (match) return `https://www.linkedin.com/company/${match[1]}`;
  }
  return null;
}

/** Strip common subdomains to get a root domain for cross-source matching.
 *  boutique.dji-paris.com → dji-paris.com
 *  shop.prodrones.fr → prodrones.fr
 *  enterprise.dronenerds.com → dronenerds.com */
const STRIP_SUBDOMAINS = ['www', 'shop', 'store', 'boutique', 'enterprise', 'm', 'fr', 'en', 'de', 'nl', 'es', 'it', 'pt', 'ja', 'ko', 'ar'];

function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    let host = new URL(url).hostname;
    const parts = host.split('.');
    if (parts.length > 2 && STRIP_SUBDOMAINS.includes(parts[0])) {
      host = parts.slice(1).join('.');
    }
    return host;
  } catch { return null; }
}

/**
 * Derive the best company name from the crawler slug, google title, and domains.
 * Priority: google title site name > slug with separators > domain root
 */
function deriveCompanyName(slug: string, domains: string[], googleTitle?: string): string {
  // 1. Try to extract site name from Google title (part after last " - " or " | ")
  if (googleTitle) {
    const separators = [' - ', ' | ', ' — ', ' – '];
    for (const sep of separators) {
      const idx = googleTitle.lastIndexOf(sep);
      if (idx > 0) {
        let siteName = googleTitle.slice(idx + sep.length).trim();
        // Strip trailing TLDs: "Globe-Flight.de" → "Globe-Flight"
        siteName = siteName.replace(/\.(com|nl|de|fr|eu|co\.uk|be|io|ai|app|store)$/i, '');
        // Only use if it looks like a short company name (2-30 chars, max 3 words)
        const wordCount = siteName.split(/\s+/).length;
        if (siteName.length >= 2 && siteName.length <= 30 && wordCount <= 3
          && !/^(home|blog|news|about|products?|shop|linkedin|youtube|facebook)$/i.test(siteName)) {
          // If extracted name is a single squished word but slug has separators, prefer slug
          // e.g. google says "hpdrones" but slug "hp-drones" → "HP Drones" is better
          if (wordCount === 1 && /[-_]/.test(slug)) {
            return titleCaseSlug(slug);
          }
          return siteName;
        }
      }
    }
  }

  // 2. If slug is a subdomain artifact, use the root domain name
  if (STRIP_SUBDOMAINS.includes(slug)) {
    const nonSocial = domains.filter(d => !SOCIAL_DOMAINS.some(sd => d.endsWith(sd)));
    if (nonSocial.length > 0) {
      const parts = nonSocial[0].split('.');
      const rootName = parts.length > 2 && STRIP_SUBDOMAINS.includes(parts[0])
        ? parts[1]
        : parts[0];
      return titleCaseSlug(rootName);
    }
  }

  // 3. TitleCase the slug
  return titleCaseSlug(slug);
}

function titleCaseSlug(slug: string): string {
  // Split on hyphens/underscores: "dji-paris" → "DJI Paris", "drone-parts-center" → "Drone Parts Center"
  return slug.split(/[-_]/).map(w => {
    // Known uppercase brands
    const upper = ['dji', 'ai', 'nl', 'eu', 'bv', 'nv', 'uk', 'us', 'hp', 'ndw', 'nlr', 'knrm'];
    if (upper.includes(w.toLowerCase())) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

function buildSnippet(signals: Signal[]): string {
  return signals.map(s => `${s.keyword} ×${s.count} (${s.points}pts)`).join(', ');
}

function bestEvidenceUrl(c: CompanyResult): string | null {
  // Prefer direct web URLs, fall back to social
  const direct = c.sourceUrls.find(u => u.type === 'direct');
  if (direct) return direct.link;
  const social = c.sourceUrls.find(u => u.type === 'social');
  return social?.link ?? null;
}

function confidenceLevel(score: number, website: string | null, linkedin: string | null, hasSocial: boolean): string {
  if (score >= 70 && (website || linkedin || hasSocial)) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

/* ─── Filter logic ─── */

interface FilterResult {
  passed: CompanyResult[];
  filtered: { company: CompanyResult; reason: string }[];
}

function isSocialOnlyEntity(domains: string[]): boolean {
  return domains.length > 0 && domains.every(d => isSocialDomain(d));
}

function isJunkSlug(slug: string): boolean {
  // Slugs over 18 chars from social URLs are usually article titles, not company names
  if (slug.length > 18) return true;
  // Slugs that are DJI product names (not DJI-named companies)
  if (/^dji(dock|matrice|flighthub|mavic|mini|avata|neo)/.test(slug)) return true;
  // Generic social media path segments — not company names
  const genericSlugs = ['reel', 'reels', 'post', 'posts', 'video', 'videos', 'watch', 'story', 'stories', 'status', 'feed', 'share', 'p', 'photo', 'photos'];
  if (genericSlugs.includes(slug.toLowerCase())) return true;
  return false;
}

function filterCompanies(companies: CompanyResult[]): FilterResult {
  const passed: CompanyResult[] = [];
  const filtered: FilterResult['filtered'] = [];

  for (const c of companies) {
    // GATE: Tier 1 must be present — "DJI Dock" / "Dock 2" / "Dock 3" must appear.
    // If T1 = 0, the company is irrelevant regardless of T2/T3 scores.
    if (!c.tier1Hit) {
      filtered.push({ company: c, reason: 'no_dock_keyword' });
      continue;
    }
    // Skip if ALL domains are excluded social only (youtube/tiktok/reddit/twitter/instagram)
    if (c.domains.length > 0 && isExcludedSocialOnly(c.domains)) {
      filtered.push({ company: c, reason: 'excluded_social_only' });
      continue;
    }
    // Skip social-only entities with junk slugs (article titles, product names)
    if (isSocialOnlyEntity(c.domains) && isJunkSlug(c.slug)) {
      filtered.push({ company: c, reason: 'junk_social_slug' });
      continue;
    }
    // Skip ALL social-only entities — Facebook/Instagram/YouTube posts are content, not companies
    // LinkedIn company pages are extracted as linkedin URLs, not as entities
    if (isSocialOnlyEntity(c.domains)) {
      filtered.push({ company: c, reason: 'social_only' });
      continue;
    }
    // Skip media entities — news sites mention DJI Dock in articles but aren't partners.
    if (c.entityType === 'media') {
      filtered.push({ company: c, reason: 'media_entity' });
      continue;
    }
    // Skip known news/media domains even if not classified as media
    const NEWS_DOMAINS = [
      'prnewswire.com', 'dronelife.com', 'dronedj.com', 'dronexl.co',
      'antaranews.com', 'anp.nl', 'persportaal.anp.nl',
      'reuters.com', 'bloomberg.com', 'techcrunch.com',
      'theverge.com', 'wired.com', 'cnet.com', 'engadget.com',
      'global-agriculture.com', 'suasnews.com', 'uasweekly.com',
      'journaldemontreal.com',
    ];
    const isNewsDomain = c.domains.some(d => NEWS_DOMAINS.some(nd => d.endsWith(nd)));
    if (isNewsDomain) {
      filtered.push({ company: c, reason: 'news_domain' });
      continue;
    }
    // Skip DJI own domains/pages
    const DJI_OWN = ['dji.com', 'dji.fr', 'dji.de', 'dji-retail.co.uk', 'enterprise-insights.dji.com'];
    if (c.domains.some(d => DJI_OWN.some(dji => d.endsWith(dji)))) {
      filtered.push({ company: c, reason: 'dji_own' });
      continue;
    }
    // Skip academic/government domains — product listings, not partners
    if (c.domains.some(d => d.endsWith('.edu') || d.endsWith('.edu.iq') || d.endsWith('.gov'))) {
      filtered.push({ company: c, reason: 'academic_govt' });
      continue;
    }
    // Skip entities with no real company domain (only researchgate, social, etc.)
    const realDomains = c.domains.filter(d =>
      !isSocialDomain(d) && !d.endsWith('researchgate.net')
    );
    if (realDomains.length === 0) {
      filtered.push({ company: c, reason: 'no_real_domain' });
      continue;
    }
    // Skip entities where ALL evidence URLs are search results pages (?s=, ?q=, /search?)
    // These are sites that happened to have "DJI Dock" in search autocomplete, not real content
    const allUrls = c.sourceUrls.map(u => u.link);
    const allSearchPages = allUrls.length > 0 && allUrls.every(u =>
      /[?&](s|q|search|query)=/i.test(u) || /\/search[/?]/i.test(u)
    );
    if (allSearchPages) {
      filtered.push({ company: c, reason: 'search_page_only' });
      continue;
    }
    // Skip government/municipality websites (.gouv, .govt, gemeente, waterschap, provincie)
    const GOVT_PATTERNS = ['.gouv.', '.govt.', '.gov.', 'gemeente', 'waterschap', 'provincie', 'rijksoverheid'];
    if (realDomains.some(d => GOVT_PATTERNS.some(g => d.includes(g)))) {
      filtered.push({ company: c, reason: 'government_site' });
      continue;
    }
    // Skip entities where ALL crawled pages failed (HTTP errors = dead/spam sites)
    const crawlResults = (c as unknown as { crawlResults?: { ok: boolean }[] }).crawlResults;
    if (crawlResults && crawlResults.length > 0 && crawlResults.every(cr => !cr.ok)) {
      filtered.push({ company: c, reason: 'all_crawls_failed' });
      continue;
    }
    passed.push(c);
  }

  return { passed, filtered };
}

/**
 * POST /api/source-candidates/import/google-search
 * Body: { keyword, country, companies, preview?: boolean }
 *
 * preview=true  → returns stats only, no DB write
 * preview=false → imports filtered companies into source_candidates
 */
interface ImportPayloadWithPreview extends ImportPayload {
  preview?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const db = requireSupabase();
    const body: ImportPayloadWithPreview = await req.json();
    const { preview } = body;
    const payload = body;
    const country = payload.country;

    const { passed, filtered } = filterCompanies(payload.companies);

    // ── Preview mode: check against multi_sources_companies_import ──
    if (preview) {
      const existingNames = new Set<string>();
      const existingDomains = new Set<string>();
      if (passed.length > 0) {
        const { data: existing } = await db
          .from('multi_sources_companies_import')
          .select('normalized_name,normalized_domain')
          .eq('country_code', country);
        (existing ?? []).forEach(e => {
          existingNames.add(e.normalized_name);
          if (e.normalized_domain) existingDomains.add(e.normalized_domain);
        });
      }

      const newCount = passed.filter(c => {
        const normName = normalizeCompanyName(deriveCompanyName(c.slug, c.domains, c.companyName));
        const domain = extractDomain(extractWebsite(c.domains));
        return !existingNames.has(normName) && !(domain && existingDomains.has(domain));
      }).length;

      return NextResponse.json({
        preview: true,
        stats: {
          total_input: payload.companies.length,
          after_filter: passed.length,
          filtered_out: filtered.length,
          already_imported: passed.length - newCount,  // UI reads this field
          will_merge: passed.length - newCount,
          new_records: newCount,
          filter_reasons: {
            no_dock_keyword: filtered.filter(f => f.reason === 'no_dock_keyword').length,
            excluded_social_only: filtered.filter(f => f.reason === 'excluded_social_only').length,
            junk_social_slug: filtered.filter(f => f.reason === 'junk_social_slug').length,
            social_only: filtered.filter(f => f.reason === 'social_only').length,
            media_entity: filtered.filter(f => f.reason === 'media_entity').length,
            news_domain: filtered.filter(f => f.reason === 'news_domain').length,
            dji_own: filtered.filter(f => f.reason === 'dji_own').length,
            academic_govt: filtered.filter(f => f.reason === 'academic_govt').length,
            no_real_domain: filtered.filter(f => f.reason === 'no_real_domain').length,
          },
        },
      });
    }

    // ── Import mode → writes to multi_sources_companies_import ──

    const totalInput = payload.companies.length;
    const now = new Date().toISOString();
    const batchLabel = `google-search-${country.toLowerCase()}-${now.slice(5, 10).replace('-', '')}`;

    // Fetch existing records for merge matching
    const { data: existingRecords } = await db
      .from('multi_sources_companies_import')
      .select('id,company_name,normalized_name,normalized_domain,website,linkedin,source_types,dock_verified,dock_models,verifications,role')
      .eq('country_code', country);

    const byName = new Map<string, NonNullable<typeof existingRecords>[number]>();
    const byDomain = new Map<string, NonNullable<typeof existingRecords>[number]>();
    for (const r of existingRecords ?? []) {
      byName.set(r.normalized_name, r);
      if (r.normalized_domain) byDomain.set(r.normalized_domain, r);
    }

    let imported = 0;
    let merged = 0;
    let errors = 0;
    const results: { name: string; status: string; error?: string }[] = [];

    for (const c of passed) {
      const website = extractWebsite(c.domains);
      const linkedin = extractLinkedinCompanyUrl(c.sourceUrls);
      const companyName = deriveCompanyName(c.slug, c.domains, c.companyName);
      const normName = normalizeCompanyName(companyName);
      const domain = extractDomain(website);
      const evidenceUrl = bestEvidenceUrl(c);

      // Parse dock models from signals
      const dockKeywords: string[] = [];
      const signalText = c.signals.map(s => s.keyword).join(' ') + ' ' + (evidenceUrl ?? '');
      if (/dock[\s-]*1/i.test(signalText)) dockKeywords.push('DJI Dock 1');
      if (/dock[\s-]*2/i.test(signalText)) dockKeywords.push('DJI Dock 2');
      if (/dock[\s-]*3/i.test(signalText)) dockKeywords.push('DJI Dock 3');
      if (dockKeywords.length === 0 && /dock/i.test(signalText)) dockKeywords.push('DJI Dock');

      // Build verification entry
      const verification = evidenceUrl ? {
        method: 'google_search',
        hits: 1,
        url: evidenceUrl,
        relevance: 'direct' as const,
        at: now,
        keywords_matched: dockKeywords,
        post_date: null,
        note: buildSnippet(c.signals).substring(0, 200),
      } : null;

      // Map entity_type to role
      // All Google Search entities are discovery leads — no pre-classification
      const roleMap: Record<string, string> = { operator: 'lead', reseller: 'lead', unknown: 'lead' };
      const role = roleMap[c.entityType] || null;

      // Match: name → domain → domain-base
      let match = byName.get(normName);
      if (!match && domain) match = byDomain.get(domain);
      if (!match && domain) {
        const domainBase = domain.split('.').slice(-2).join('.');
        const domainEntries = Array.from(byDomain.entries());
        for (const [ed, er] of domainEntries) {
          if (ed.split('.').slice(-2).join('.') === domainBase) { match = er; break; }
        }
      }

      if (match) {
        // ── MERGE into existing record ──
        const existingSrc: string[] = match.source_types ?? [];
        const mergedSrc = Array.from(new Set([...existingSrc, 'google_search']));
        const existingVerifs: unknown[] = Array.isArray(match.verifications) ? match.verifications : [];
        const mergedVerifs = verification ? [...existingVerifs, verification] : existingVerifs;
        const existingKw = (match.dock_models ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
        const allKw = Array.from(new Set([...existingKw, ...dockKeywords])).sort();
        const mergedModels = allKw.join(', ') || match.dock_models;
        const dockVerified = match.dock_verified === true ? true : (verification ? true : match.dock_verified);

        const { error: updateError } = await db
          .from('multi_sources_companies_import')
          .update({
            source_types: mergedSrc,
            verifications: mergedVerifs,
            dock_verified: dockVerified,
            dock_models: mergedModels || null,
            website: match.website || website,
            linkedin: match.linkedin || linkedin,
            role: match.role || role,
            updated_at: now,
          })
          .eq('id', match.id);

        if (updateError) {
          errors++;
          results.push({ name: companyName, status: 'error', error: updateError.message });
        } else {
          merged++;
          results.push({ name: companyName, status: 'merged' });
        }
      } else {
        // ── NEW INSERT ──
        const { error: insertError } = await db
          .from('multi_sources_companies_import')
          .insert({
            company_name: companyName,
            country_code: country,
            normalized_name: normName,
            normalized_domain: domain,
            website,
            linkedin,
            role,
            imported_via: 'google_search',
            import_batch: batchLabel,
            source_types: ['google_search'],
            dock_verified: verification ? true : null,
            dock_models: dockKeywords.join(', ') || null,
            verifications: verification ? [verification] : [],
          });

        if (insertError) {
          errors++;
          results.push({ name: companyName, status: 'error', error: insertError.message });
        } else {
          imported++;
          results.push({ name: companyName, status: 'imported' });
        }
      }
    }

    return NextResponse.json({
      total_input: totalInput,
      after_filter: passed.length,
      filtered_out: filtered.length,
      merged,
      imported: imported + merged,  // UI reads this as total saved count
      new_inserts: imported,
      errors,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
