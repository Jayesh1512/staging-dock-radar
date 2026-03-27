import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { requireSupabase } from '@/lib/db';
import { normalizeCompanyName } from '@/lib/company-normalize';

/**
 * GET /api/company-activity?period=60&trend=all&country=all&source=all
 *
 * Returns leaderboard data: companies ranked by article/post frequency,
 * with trend, contacts, articles, pipeline stage, and partner status.
 *
 * All data computed at query time from existing tables — no denormalized columns.
 */

export interface CompanyActivityEntry {
  name: string;
  normalized_name: string;
  countries: string[];
  post_count: number;
  avg_score: number;
  max_score: number;
  trend: 'rising' | 'stable' | 'declining' | 'new';
  sources: string[];
  last_post_at: string | null;
  contacts: Array<{ name: string; role: string | null; organization: string | null }>;
  articles: Array<{
    id: string;
    title: string;
    url: string;
    source: string;
    published_at: string | null;
    relevance_score: number;
    signal_type: string;
  }>;
  website: string | null;
  linkedin: string | null;
  in_pipeline: boolean;
  stage: string | null;
}

export async function GET(req: NextRequest) {
  try {
    const db = requireSupabase();
    const params = req.nextUrl.searchParams;
    const periodDays = parseInt(params.get('period') || '60', 10);

    // ── 1. Fetch scored_articles joined with articles ────────────────────────
    // Get all scored articles with score >= 25 (includes weak signals for trend)
    let query = db
      .from('scored_articles')
      .select(`
        article_id,
        company,
        country,
        relevance_score,
        signal_type,
        summary,
        entities,
        persons,
        created_at,
        articles!inner (
          id,
          title,
          url,
          source,
          published_at,
          publisher
        )
      `)
      .gte('relevance_score', 25)
      .eq('is_duplicate', false)
      .is('drop_reason', null)
      .not('company', 'is', null)
      .order('created_at', { ascending: false });

    const { data: scoredRows, error: scoredErr } = await query;
    if (scoredErr) throw new Error(`scored_articles query failed: ${scoredErr.message}`);
    if (!scoredRows || scoredRows.length === 0) {
      return NextResponse.json({ companies: [], stats: { total: 0, rising: 0, new: 0, avgScore: 0, reachable: 0 } });
    }

    // ── 2. Group by normalized company name ──────────────────────────────────
    const companyMap = new Map<string, {
      display_name: string;
      countries: Set<string>;
      sources: Set<string>;
      articles: Array<{
        id: string; title: string; url: string; source: string;
        published_at: string | null; relevance_score: number; signal_type: string;
      }>;
      contacts: Map<string, { name: string; role: string | null; organization: string | null }>;
      scores: number[];
      last_post_at: string | null;
    }>();

    for (const row of scoredRows) {
      const company = row.company as string;
      const normName = normalizeCompanyName(company);
      if (!normName) continue;

      const article = row.articles as any;
      if (!article) continue;

      let entry = companyMap.get(normName);
      if (!entry) {
        entry = {
          display_name: company,
          countries: new Set(),
          sources: new Set(),
          articles: [],
          contacts: new Map(),
          scores: [],
          last_post_at: null,
        };
        companyMap.set(normName, entry);
      }

      // Use longer display name if available
      if (company.length > entry.display_name.length) {
        entry.display_name = company;
      }

      if (row.country) entry.countries.add(row.country as string);
      entry.sources.add(article.source);
      entry.scores.push(row.relevance_score as number);

      const pubDate = article.published_at as string | null;
      if (pubDate && (!entry.last_post_at || pubDate > entry.last_post_at)) {
        entry.last_post_at = pubDate;
      }

      entry.articles.push({
        id: article.id,
        title: article.title,
        url: article.url,
        source: article.source,
        published_at: pubDate,
        relevance_score: row.relevance_score as number,
        signal_type: (row.signal_type as string) || 'OTHER',
      });

      // Extract contacts from persons
      const persons = (row.persons as any[]) || [];
      for (const p of persons) {
        if (!p.name) continue;
        const key = p.name.toLowerCase().trim();
        if (!entry.contacts.has(key)) {
          entry.contacts.set(key, { name: p.name, role: p.role || null, organization: p.organization || null });
        }
      }
    }

    // ── 3. Compute trend for each company ────────────────────────────────────
    const now = Date.now();
    const periodMs = periodDays * 86400000;
    const priorPeriodStart = now - periodMs * 2;
    const currentPeriodStart = now - periodMs;

    // ── 4. Load discovered_companies for website/linkedin ────────────────────
    const normNames = [...companyMap.keys()];
    let discoveredMap = new Map<string, { website: string | null; linkedin: string | null; first_seen_at: string }>();

    if (normNames.length > 0) {
      // Batch fetch in chunks of 100
      for (let i = 0; i < normNames.length; i += 100) {
        const batch = normNames.slice(i, i + 100);
        const { data: dcRows } = await db
          .from('discovered_companies')
          .select('normalized_name, website, linkedin, first_seen_at')
          .in('normalized_name', batch);
        if (dcRows) {
          for (const dc of dcRows) {
            discoveredMap.set(dc.normalized_name, {
              website: dc.website,
              linkedin: dc.linkedin,
              first_seen_at: dc.first_seen_at,
            });
          }
        }
      }
    }

    // ── 5. Load pipeline stages ──────────────────────────────────────────────
    const { data: pipelineRows } = await db
      .from('pipeline_leads')
      .select('company_name, stage')
      .neq('stage', 'lost_archived');

    const pipelineMap = new Map<string, string>();
    if (pipelineRows) {
      for (const pl of pipelineRows) {
        const norm = normalizeCompanyName(pl.company_name);
        if (norm) pipelineMap.set(norm, pl.stage);
      }
    }

    // ── 6. Load FlytBase partners ────────────────────────────────────────────
    const { data: partnerRows } = await db
      .from('flytbase_partners')
      .select('normalized_name');

    const partnerSet = new Set<string>();
    if (partnerRows) {
      for (const p of partnerRows) {
        partnerSet.add(p.normalized_name);
      }
    }

    // ── 7. Load contacts from discovered_contacts ────────────────────────────
    const contactsMap = new Map<string, Array<{ name: string; role: string | null; organization: string | null }>>();
    if (normNames.length > 0) {
      for (let i = 0; i < normNames.length; i += 100) {
        const batch = normNames.slice(i, i + 100);
        const { data: ctRows } = await db
          .from('discovered_contacts')
          .select('company_normalized_name, name, role, organization')
          .in('company_normalized_name', batch);
        if (ctRows) {
          for (const ct of ctRows) {
            const key = ct.company_normalized_name as string;
            if (!contactsMap.has(key)) contactsMap.set(key, []);
            contactsMap.get(key)!.push({ name: ct.name, role: ct.role, organization: ct.organization });
          }
        }
      }
    }

    // ── 8. Assemble final result ─────────────────────────────────────────────
    const companies: CompanyActivityEntry[] = [];

    for (const [normName, entry] of companyMap) {
      // Filter articles within period
      const periodArticles = entry.articles.filter(a => {
        if (!a.published_at) return true; // include undated
        return new Date(a.published_at).getTime() >= currentPeriodStart;
      });

      const priorArticles = entry.articles.filter(a => {
        if (!a.published_at) return false;
        const t = new Date(a.published_at).getTime();
        return t >= priorPeriodStart && t < currentPeriodStart;
      });

      const currentCount = periodArticles.length;
      const priorCount = priorArticles.length;

      // Trend calculation
      const dc = discoveredMap.get(normName);
      const firstSeen = dc?.first_seen_at ? new Date(dc.first_seen_at).getTime() : 0;
      const isNew = firstSeen > now - 14 * 86400000;

      let trend: 'rising' | 'stable' | 'declining' | 'new';
      if (isNew) {
        trend = 'new';
      } else if (priorCount === 0 && currentCount > 0) {
        trend = 'rising';
      } else if (currentCount > priorCount * 1.3) {
        trend = 'rising';
      } else if (currentCount < priorCount * 0.7) {
        trend = 'declining';
      } else {
        trend = 'stable';
      }

      // Stage: pipeline stage > partner > null
      let stage: string | null = null;
      const pipelineStage = pipelineMap.get(normName);
      if (pipelineStage) {
        stage = pipelineStage;
      } else if (partnerSet.has(normName)) {
        stage = 'partner';
      }

      // Merge contacts from scored_articles persons + discovered_contacts
      const dbContacts = contactsMap.get(normName) || [];
      const mergedContacts = new Map<string, { name: string; role: string | null; organization: string | null }>();
      for (const c of [...entry.contacts.values(), ...dbContacts]) {
        const key = c.name.toLowerCase().trim();
        if (!mergedContacts.has(key)) mergedContacts.set(key, c);
      }

      const avgScore = entry.scores.length > 0
        ? Math.round(entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length)
        : 0;

      companies.push({
        name: entry.display_name,
        normalized_name: normName,
        countries: [...entry.countries],
        post_count: entry.articles.length,
        avg_score: avgScore,
        max_score: Math.max(...entry.scores, 0),
        trend,
        sources: [...entry.sources],
        last_post_at: entry.last_post_at,
        contacts: [...mergedContacts.values()],
        articles: entry.articles
          .sort((a, b) => {
            const ta = a.published_at ? new Date(a.published_at).getTime() : 0;
            const tb = b.published_at ? new Date(b.published_at).getTime() : 0;
            return tb - ta;
          })
          .slice(0, 10), // limit to 10 most recent
        website: dc?.website ?? null,
        linkedin: dc?.linkedin ?? null,
        in_pipeline: !!pipelineStage,
        stage,
      });
    }

    // Sort by post_count desc, then avg_score desc
    companies.sort((a, b) => b.post_count - a.post_count || b.avg_score - a.avg_score);

    // Stats
    const stats = {
      total: companies.length,
      rising: companies.filter(c => c.trend === 'rising').length,
      new: companies.filter(c => c.trend === 'new').length,
      avgScore: companies.length > 0
        ? Math.round(companies.reduce((s, c) => s + c.avg_score, 0) / companies.length)
        : 0,
      reachable: companies.filter(c => c.website || c.linkedin).length,
      totalArticles: companies.reduce((s, c) => s + c.post_count, 0),
    };

    return NextResponse.json({ companies, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Company activity query failed';
    console.error('[/api/company-activity]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
