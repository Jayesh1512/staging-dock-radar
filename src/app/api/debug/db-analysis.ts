/**
 * Quick database analysis for DSP Hit List Phase 1 planning.
 * Run as: curl http://localhost:3000/api/debug/db-analysis
 *
 * This is a temporary debug endpoint — not part of the main app.
 */

import { requireSupabase } from '@/lib/db';

export async function getDbAnalysis() {
  const db = requireSupabase();

  // ── Get overview stats ──
  const { count: totalScored } = await db.from('scored_articles').select('*', { count: 'exact', head: true });

  const { data: scoreDistribution } = await db.from('scored_articles')
    .select('relevance_score')
    .filter('relevance_score', 'gte', 50)
    .filter('drop_reason', 'is', null);

  const { count: score50Plus } = await db.from('scored_articles')
    .select('*', { count: 'exact', head: true })
    .gte('relevance_score', 50)
    .is('drop_reason', null)
    .eq('is_duplicate', false);

  // ── Industry coverage ──
  const { count: withIndustry } = await db.from('scored_articles')
    .select('*', { count: 'exact', head: true })
    .not('industry', 'is', null);

  const { data: industryDistribution } = await db.from('scored_articles')
    .select('industry')
    .not('industry', 'is', null);

  // ── Company extraction ──
  const { data: companies } = await db.from('scored_articles')
    .select('company')
    .not('company', 'is', null)
    .gte('relevance_score', 50)
    .is('drop_reason', null);

  const uniqueCompanies = new Set(companies?.map((c: any) => c.company) ?? []);

  // ── Entity types distribution ──
  const { data: entityData } = await db.from('scored_articles')
    .select('entities')
    .gte('relevance_score', 50)
    .is('drop_reason', null)
    .eq('is_duplicate', false);

  const entityTypeCount = new Map<string, number>();
  entityData?.forEach((row: any) => {
    if (Array.isArray(row.entities)) {
      row.entities.forEach((e: any) => {
        const type = e.type || 'unknown';
        entityTypeCount.set(type, (entityTypeCount.get(type) ?? 0) + 1);
      });
    }
  });

  // ── dsp_companies coverage ──
  const { count: withDspCompanies } = await db.from('scored_articles')
    .select('*', { count: 'exact', head: true })
    .not('dsp_companies', 'is', null)
    .gte('relevance_score', 50);

  // ── Regional distribution ──
  const { data: regionData } = await db.from('scored_articles')
    .select('country')
    .not('country', 'is', null)
    .gte('relevance_score', 50);

  const countryCount = new Map<string, number>();
  regionData?.forEach((row: any) => {
    const country = row.country || 'Unknown';
    countryCount.set(country, (countryCount.get(country) ?? 0) + 1);
  });

  return {
    overview: {
      total_scored_articles: totalScored ?? 0,
      score_50_plus_not_dropped: score50Plus ?? 0,
    },
    industry: {
      with_industry_data: withIndustry ?? 0,
      percentage: totalScored ? Math.round((withIndustry ?? 0) / (totalScored ?? 1) * 100) : 0,
      industry_breakdown: Array.from(
        Object.entries(
          (industryDistribution ?? []).reduce((acc: Record<string, number>, d: any) => {
            const ind = d.industry || 'null';
            acc[ind] = (acc[ind] ?? 0) + 1;
            return acc;
          }, {})
        )
      ).sort((a, b) => (b[1] as number) - (a[1] as number)),
    },
    companies: {
      unique_companies_extracted: uniqueCompanies.size,
      sample_companies: Array.from(uniqueCompanies).slice(0, 20),
      total_company_mentions: companies?.length ?? 0,
    },
    entities: {
      type_distribution: Object.fromEntries(
        Array.from(entityTypeCount.entries()).sort((a, b) => b[1] - a[1])
      ),
    },
    dsp_companies_field: {
      articles_with_dsp_companies: withDspCompanies ?? 0,
      percentage: (score50Plus ?? 0) > 0 ? Math.round((withDspCompanies ?? 0) / (score50Plus ?? 1) * 100) : 0,
      note: 'Only filled if enriched with new prompt',
    },
    regions: {
      unique_countries: countryCount.size,
      distribution: Object.fromEntries(
        Array.from(countryCount.entries())
          .sort((a, b) => (b[1] as number) - (a[1] as number))
          .slice(0, 10)
      ),
    },
  };
}
