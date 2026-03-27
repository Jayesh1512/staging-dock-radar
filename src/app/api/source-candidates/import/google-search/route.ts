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
 * Derive the best company name from the crawler slug and domains.
 * - If slug is a subdomain artifact (shop, boutique, enterprise, store),
 *   use the root domain name instead.
 * - Otherwise titleCase the slug.
 */
function deriveCompanyName(slug: string, domains: string[]): string {
  // Check if slug is a known subdomain artifact
  if (STRIP_SUBDOMAINS.includes(slug)) {
    // Find a non-social domain and use its root
    const nonSocial = domains.filter(d => !SOCIAL_DOMAINS.some(sd => d.endsWith(sd)));
    if (nonSocial.length > 0) {
      const parts = nonSocial[0].split('.');
      // Strip the subdomain, take next segment
      const rootName = parts.length > 2 && STRIP_SUBDOMAINS.includes(parts[0])
        ? parts[1]
        : parts[0];
      return titleCaseSlug(rootName);
    }
  }
  return titleCaseSlug(slug);
}

function titleCaseSlug(slug: string): string {
  // "escadrone" → "Escadrone", "dji-paris" → "Dji Paris", "dronepartscenter" → "Dronepartscenter"
  return slug.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
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
  // e.g. "autorisationdexploitation" from a LinkedIn post about drone authorization
  if (slug.length > 18) return true;
  // Slugs that are DJI product names (not DJI-named companies)
  // "djidock3", "djimatrice4e", "djiflighthub" — these are product pages, not companies
  if (/^dji(dock|matrice|flighthub|mavic|mini|avata|neo)/.test(slug)) return true;
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

    // ── Preview mode: return stats only, no DB write ──
    if (preview) {
      const existingNames = new Set<string>();
      if (passed.length > 0) {
        const { data: existing } = await db
          .from('source_candidates')
          .select('normalized_name')
          .eq('source_type', 'google_search')
          .eq('country_code', country);
        (existing ?? []).forEach(e => existingNames.add(e.normalized_name));
      }

      const newCount = passed.filter(c => !existingNames.has(normalizeCompanyName(deriveCompanyName(c.slug, c.domains)))).length;

      return NextResponse.json({
        preview: true,
        stats: {
          total_input: payload.companies.length,
          after_filter: passed.length,
          filtered_out: filtered.length,
          already_imported: passed.length - newCount,
          new_records: newCount,
          filter_reasons: {
            zero_score: filtered.filter(f => f.reason === 'zero_score').length,
            media_no_dock_signal: filtered.filter(f => f.reason === 'media_no_dock_signal').length,
            excluded_social_only: filtered.filter(f => f.reason === 'excluded_social_only').length,
          },
        },
      });
    }

    // ── Import mode ──

    // 1. Create import run
    const { data: run, error: runError } = await db
      .from('source_import_runs')
      .insert({
        source_type: 'google_search',
        country_code: country,
        run_label: `${country} Google Search: "${payload.keyword}"`,
        status: 'running',
      })
      .select()
      .single();

    if (runError) throw new Error(`Failed to create run: ${runError.message}`);

    const totalInput = payload.companies.length;

    // 3. Upsert each record
    let imported = 0;
    let errors = 0;
    const results: { name: string; status: string; error?: string }[] = [];

    for (const c of passed) {
      const website = extractWebsite(c.domains);
      const linkedin = extractLinkedinCompanyUrl(c.sourceUrls);
      const hasSocial = c.sourceUrls.some(u =>
        ['linkedin', 'facebook', 'youtube'].includes(u.socialPlatform ?? ''));

      const companyName = deriveCompanyName(c.slug, c.domains);

      const record = {
        source_type: 'google_search',
        source_run_id: run.id,
        country_code: country,
        company_name: companyName,
        normalized_name: normalizeCompanyName(companyName),
        normalized_domain: extractDomain(website),
        website,
        linkedin_url: linkedin,
        city: null as string | null,
        employee_count: null as number | null,
        raw_score: c.normalizedScore,
        confidence: confidenceLevel(c.normalizedScore, website, linkedin, hasSocial),
        entity_type: c.entityType === 'unknown' ? 'unknown' : c.entityType,
        signal_keyword: c.topSignal,
        evidence_url: bestEvidenceUrl(c),
        snippet: buildSnippet(c.signals),
        detected_at: new Date().toISOString(),
        all_urls: c.sourceUrls.map(u => ({
          url: u.link,
          type: u.type,
          platform: u.socialPlatform ?? null,
          title: u.title,
          snippet: u.snippet,
        })),
        source_meta: {
          slug: c.slug,
          google_title: c.companyName,
          search_keyword: payload.keyword,
          tier1Count: c.tier1Count,
          tier2Count: c.tier2Count,
          tier3Count: c.tier3Count,
          signals: c.signals,
          all_domains: c.domains,
          result_count: c.resultCount,
          last_seen: c.lastSeen,
          freshness_band: c.freshnessBand,
          fence: c.fence ?? null,
        },
        status: 'imported',
      };

      // Upsert: on conflict, take higher score and merge signals
      const { data: existing } = await db
        .from('source_candidates')
        .select('raw_score, source_meta, source_count')
        .eq('source_type', 'google_search')
        .eq('normalized_name', record.normalized_name)
        .eq('country_code', country)
        .maybeSingle();

      if (existing && existing.raw_score >= record.raw_score) {
        // Existing has equal or higher score — merge search_runs into source_meta
        const existingMeta = (existing.source_meta as Record<string, unknown>) ?? {};
        const searchRuns = (existingMeta.search_runs as string[]) ?? [];
        searchRuns.push(payload.keyword);
        const { error: updateError } = await db
          .from('source_candidates')
          .update({
            source_meta: { ...existingMeta, search_runs: searchRuns },
            source_count: (existing.source_count ?? 1) + 1,
            source_run_id: run.id,
          })
          .eq('source_type', 'google_search')
          .eq('normalized_name', record.normalized_name)
          .eq('country_code', country);

        if (updateError) {
          errors++;
          results.push({ name: c.companyName, status: 'error', error: updateError.message });
        } else {
          imported++;
          results.push({ name: c.companyName, status: 'merged' });
        }
      } else {
        // New or higher score — upsert full record
        const { error: upsertError } = await db
          .from('source_candidates')
          .upsert(record, { onConflict: 'source_type,normalized_name,country_code' });

        if (upsertError) {
          errors++;
          results.push({ name: c.companyName, status: 'error', error: upsertError.message });
        } else {
          imported++;
          results.push({ name: c.companyName, status: 'imported' });
        }
      }
    }

    // 4. Update import run
    await db
      .from('source_import_runs')
      .update({
        total_input: totalInput,
        after_dedup: passed.length,
        imported,
        errors,
        status: errors > 0 && imported === 0 ? 'failed' : 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    return NextResponse.json({
      run_id: run.id,
      total_input: totalInput,
      after_filter: passed.length,
      filtered_out: filtered.length,
      imported,
      errors,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
