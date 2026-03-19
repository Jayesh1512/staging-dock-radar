import { NextResponse } from 'next/server';
import { loadFlytBasePartners, loadHitListData, loadDiscoveredCompanies, requireSupabase } from '@/lib/db';
import { normalizeCompanyName, fuzzyMatchCompany } from '@/lib/company-normalize';
import { OEM_NAMES, normalizeCountryName } from '@/lib/constants';
import type { DspHitListEntry } from '@/lib/types';

// ── Priority Classifications ──
const PRIORITY_REGIONS = ['Americas', 'Europe', 'USA', 'Canada', 'United States', 'UK', 'Germany', 'France'];
const PRIORITY_INDUSTRIES = ['Security', 'Oil & Gas', 'Oil&Gas', 'Utilities', 'Port', 'Mining', 'Solar'];

/**
 * GET /api/hitlist
 * Returns hit list data: new DSPs extracted from articles, matched against FlytBase partners.
 *
 * Query params:
 * - regionWeight: 0-1 (default 0.5) — weight for region priority scoring
 * - industryWeight: 0-1 (default 0.5) — weight for industry priority scoring
 *
 * Scoring:
 * Region Score: 1.0 if country ∈ Americas/Europe, else 0.5
 * Industry Score: 1.0 if industry ∈ [Security, Oil & Gas, Utilities, Port, Mining, Solar], else 0.3
 * Hit Score = (region_score × region_weight) + (industry_score × industry_weight)
 *
 * Flow:
 * 1. Load FlytBase partners and normalize their names
 * 2. Load all qualified scored articles (score >= 50, not dropped, not duplicate)
 * 3. Extract DSP companies with 2-tier fallback (entities → company)
 * 4. Group articles by normalized company name
 * 5. Fuzzy-match each company against partner list
 * 6. Compute hit scores (2-param: region + industry) and split into new vs known
 * 7. Return HitListData
 */
export async function GET(req: Request) {
  try {
    // ── Parse query params ──
    const url = new URL(req.url);
    const regionWeightParam = url.searchParams.get('regionWeight');
    const industryWeightParam = url.searchParams.get('industryWeight');

    const regionWeight = regionWeightParam ? Math.max(0, Math.min(1, parseFloat(regionWeightParam))) : 0.5;
    const industryWeight = industryWeightParam ? Math.max(0, Math.min(1, parseFloat(industryWeightParam))) : 0.5;

    // ── Load partners, hit list data, and discovered companies ──
    const [partners, articles, discoveredCompanies] = await Promise.all([
      loadFlytBasePartners(),
      loadHitListData(),
      loadDiscoveredCompanies().catch(() => []),  // graceful if table doesn't exist yet
    ]);

    // Build lookup: normalized_name → enrichment data from discovered_companies
    const discoveredMap = new Map<string, { website: string | null; linkedin: string | null; linkedin_followers: number | null; countries: string[]; industries: string[] }>();
    for (const dc of discoveredCompanies) {
      discoveredMap.set(dc.normalized_name, { website: dc.website, linkedin: dc.linkedin, linkedin_followers: dc.linkedin_followers ?? null, countries: dc.countries ?? [], industries: dc.industries ?? [] });
    }

    if (articles.length === 0) {
      return NextResponse.json({
        new_companies: [],
        known_companies: [],
        stats: {
          total_extracted: 0,
          new_count: 0,
          known_count: 0,
          match_rate: 0,
        },
        partner_count: partners.length,
      });
    }

    // ── Build partner lookup map ──
    const partnerMap = new Map<string, typeof partners[0]>();
    for (const partner of partners) {
      partnerMap.set(partner.normalized_name, partner);
    }
    const normalizedPartners = Array.from(partnerMap.keys());

    // ── Buyer keyword patterns: names matching these are end-users, not DSPs ──
    const BUYER_KEYWORDS = /\b(fire\s*dep|police|sheriff|county|city\s+of|municipality|university|college|school\s+district|hospital|health\s*(system|authority)|department\s+of|ministry|bureau|task\s*force|national\s+guard|air\s+force|army|navy|coast\s+guard)\b/i;

    // ── Extract DSP companies with 2-tier fallback ──
    const companyExtractions: Array<{ name: string; role: string; article_id: string }> = [];

    for (const article of articles) {
      let extracted: Array<{ name: string; role: string }> = [];

      // Tier 1: entities with type operator or si
      if (article.entities && article.entities.length > 0) {
        const dspEntities = article.entities.filter(e =>
          (e.type === 'operator' || e.type === 'si' || e.type === 'partner') && !OEM_NAMES.has(normalizeCompanyName(e.name))
        );
        extracted = dspEntities.map(e => ({ name: e.name, role: e.type }));
      }
      // Tier 2: company field fallback — only if company is NOT a buyer entity in same article
      else if (article.company) {
        const companyNorm = normalizeCompanyName(article.company);
        const isBuyerEntity = (article.entities ?? []).some(
          e => e.type === 'buyer' && normalizeCompanyName(e.name) === companyNorm
        );
        if (!isBuyerEntity) {
          extracted = [{ name: article.company, role: 'operator' }];
        }
      }

      // Filter out buyer-pattern names (safety net for misclassified entities)
      extracted = extracted.filter(e => !BUYER_KEYWORDS.test(e.name));

      for (const dsp of extracted) {
        companyExtractions.push({
          name: dsp.name,
          role: dsp.role,
          article_id: article.article_id,
        });
      }
    }

    // ── Group by normalized company name ──
    const PERSON_BLOCKLIST = new Set(['n/a', 'unknown', 'unnamed', 'none', 'na', 'n.a.']);

    const companyMap = new Map<
      string,
      {
        original_name: string;
        mention_count: number;
        countries: Set<string>;
        industries: Set<string>;
        signal_types: Set<string>;
        articles: Array<{ id: string; title: string; url: string; score: number; date: string }>;
        persons_freq: Map<string, { count: number; data: { name: string; role: string; organization: string } }>;
      }
    >();

    for (const extraction of companyExtractions) {
      const normalized = normalizeCompanyName(extraction.name);
      if (!normalized) continue;

      const article = articles.find(a => a.article_id === extraction.article_id);
      if (!article) continue;

      let entry = companyMap.get(normalized);
      if (!entry) {
        entry = {
          original_name: extraction.name,
          mention_count: 0,
          countries: new Set(),
          industries: new Set(),
          signal_types: new Set(),
          articles: [],
          persons_freq: new Map(),
        };
        companyMap.set(normalized, entry);
      }

      entry.mention_count++;
      if (article.country) entry.countries.add(article.country);
      if (article.industry) entry.industries.add(article.industry);
      entry.signal_types.add(article.signal_type);
      entry.articles.push({
        id: article.id,
        title: article.title,
        url: article.url,
        score: article.relevance_score,
        date: article.published_at || article.created_at,
      });

      // ── Aggregate persons from this article into frequency map ──
      for (const person of (article.persons ?? [])) {
        if (!person.name || person.name.length < 3) continue;
        const nameNorm = person.name.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
        if (!nameNorm || PERSON_BLOCKLIST.has(nameNorm)) continue;
        const existing = entry.persons_freq.get(nameNorm);
        if (existing) {
          existing.count++;
        } else {
          entry.persons_freq.set(nameNorm, { count: 1, data: { name: person.name, role: person.role ?? '', organization: person.organization ?? '' } });
        }
      }
    }

    // ── Calculate region and industry scores ──
    const newCompanies: DspHitListEntry[] = [];
    const knownCompanies: DspHitListEntry[] = [];

    for (const [normalizedName, entry] of companyMap) {
      // ── Fallback: if no article-level countries, pull from discovered_companies (HQ-enriched) ──
      if (entry.countries.size === 0) {
        const dcCountries = discoveredMap.get(normalizedName)?.countries ?? [];
        for (const c of dcCountries) entry.countries.add(c);
      }

      // ── Fallback: if no article-level industries, pull from discovered_companies (manual enrichment) ──
      if (entry.industries.size === 0) {
        const dcIndustries = discoveredMap.get(normalizedName)?.industries ?? [];
        for (const ind of dcIndustries) entry.industries.add(ind);
      }

      // ── Region Priority Score ──
      const hasHighPriorityRegion = Array.from(entry.countries).some(country =>
        PRIORITY_REGIONS.some(pr => country.toLowerCase().includes(pr.toLowerCase()))
      );
      const regionScore = hasHighPriorityRegion ? 1.0 : 0.5;

      // ── Industry Priority Score ──
      const hasHighPriorityIndustry = Array.from(entry.industries).some(ind =>
        PRIORITY_INDUSTRIES.some(pi => ind.toLowerCase().includes(pi.toLowerCase()))
      );
      const industryScore = hasHighPriorityIndustry ? 1.0 : 0.3;

      // ── 2-Parameter Hit Score ──
      const hitScore = (regionScore * regionWeight) + (industryScore * industryWeight);

      // Check if this company matches a known partner
      const partnerMatch = fuzzyMatchCompany(entry.original_name, normalizedPartners);
      // Only high confidence (Jaccard >= 0.6) counts as known — prefer false-new over false-known
      const isFlytbasePartner = partnerMatch.match !== null && partnerMatch.confidence === 'high';
      const partnerInfo = isFlytbasePartner && partnerMatch.match ? partnerMap.get(partnerMatch.match) : null;

      const sortedArticles = entry.articles
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const latestArticle = sortedArticles[0];

      // ── Derive key contact: most-cited person across all articles for this company ──
      const topPerson = Array.from(entry.persons_freq.values())
        .sort((a, b) => b.count - a.count)[0] ?? null;

      const hitListEntry: DspHitListEntry = {
        name: entry.original_name,
        normalized_name: normalizedName,
        mention_count: entry.mention_count,
        avg_score: 0, // Not used in 2-param scoring, but keep for backward compatibility
        latest_article_date: latestArticle?.date ?? '',
        latest_article_url: latestArticle?.url ?? '',
        countries: Array.from(entry.countries).sort(),
        industries: Array.from(entry.industries).sort(),
        signal_types: Array.from(entry.signal_types).sort(),
        hit_score: Math.round(hitScore * 10000) / 10000,
        articles: sortedArticles.slice(0, 5),
        // Website/LinkedIn/Followers: discovered_companies first, then flytbase_partners fallback
        website: discoveredMap.get(normalizedName)?.website ?? partnerInfo?.website ?? undefined,
        linkedin: discoveredMap.get(normalizedName)?.linkedin ?? partnerInfo?.linkedin ?? undefined,
        linkedin_followers: discoveredMap.get(normalizedName)?.linkedin_followers ?? undefined,
        isFlytbasePartner,
        key_contact: topPerson?.data ?? null,
      };

      if (isFlytbasePartner) {
        knownCompanies.push(hitListEntry);
      } else {
        newCompanies.push(hitListEntry);
      }
    }

    // Sort by hit score descending
    newCompanies.sort((a, b) => b.hit_score - a.hit_score);
    knownCompanies.sort((a, b) => b.hit_score - a.hit_score);

    // Compute stats
    const totalExtracted = companyMap.size;
    const matchRate = totalExtracted > 0 ? Math.round((knownCompanies.length / totalExtracted) * 100) : 0;

    return NextResponse.json({
      new_companies: newCompanies,
      known_companies: knownCompanies,
      stats: {
        total_extracted: totalExtracted,
        new_count: newCompanies.length,
        known_count: knownCompanies.length,
        match_rate: matchRate,
      },
      partner_count: partners.length,
    });
  } catch (err) {
    console.error('[/api/hitlist] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load hit list' },
      { status: 500 },
    );
  }
}
