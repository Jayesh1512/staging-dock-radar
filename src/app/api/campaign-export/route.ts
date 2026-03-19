import { NextResponse } from 'next/server';
import { requireSupabase } from '@/lib/supabase';
import { CAMPAIGN_NAME, CAMPAIGN_WEST_REGIONS } from '@/lib/constants';

const WEST_SET = new Set<string>(CAMPAIGN_WEST_REGIONS);

function scoreBand(score: number): string {
  if (score >= 75) return 'High Value (75+)';
  if (score >= 50) return 'Strong Signal (50-74)';
  if (score >= 25) return 'Weak Signal (25-49)';
  return 'Noise (<25)';
}

function deriveGroup(regions: string[]): 'West' | 'East' | 'Unknown' {
  const hasWest = regions.some(r => WEST_SET.has(r));
  const hasEast = regions.some(r => !WEST_SET.has(r));
  if (hasWest && !hasEast) return 'West';
  if (hasEast && !hasWest) return 'East';
  return 'Unknown';
}

function esc(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

export async function GET() {
  try {
    const db = requireSupabase();

    // 1. Load all campaign runs
    const { data: runs, error: runsErr } = await db
      .from('runs')
      .select('id, regions, created_at')
      .eq('campaign', CAMPAIGN_NAME)
      .order('created_at', { ascending: true });

    if (runsErr) throw new Error(runsErr.message);
    if (!runs?.length) {
      return NextResponse.json({ error: 'No campaign runs found' }, { status: 404 });
    }

    // Build run → group map
    const runGroupMap = new Map<string, 'West' | 'East' | 'Unknown'>();
    for (const run of runs) {
      runGroupMap.set(run.id, deriveGroup(run.regions ?? []));
    }

    const runIds = runs.map(r => r.id);

    // 2. Load all articles for campaign runs (in batches of 100 IDs to avoid URL limits)
    const allArticles: Record<string, unknown>[] = [];
    for (let i = 0; i < runIds.length; i += 50) {
      const batch = runIds.slice(i, i + 50);
      const { data, error } = await db
        .from('articles')
        .select('id, run_id, title, url, publisher, published_at')
        .in('run_id', batch);
      if (error) throw new Error(error.message);
      allArticles.push(...(data ?? []));
    }

    const articleMap = new Map<string, Record<string, unknown>>();
    for (const a of allArticles) articleMap.set(a.id as string, a);
    const articleIds = allArticles.map(a => a.id as string);

    // 3. Load scored articles
    const allScored: Record<string, unknown>[] = [];
    for (let i = 0; i < articleIds.length; i += 200) {
      const batch = articleIds.slice(i, i + 200);
      const { data, error } = await db
        .from('scored_articles')
        .select('article_id, relevance_score, company, country, city, use_case, signal_type, summary, flytbase_mentioned, persons, entities, industry, is_duplicate, drop_reason')
        .in('article_id', batch)
        .gte('relevance_score', 25);   // only meaningful signals
      if (error) throw new Error(error.message);
      allScored.push(...(data ?? []));
    }

    // 4. Build CSV rows — filter: score>=25, not duplicate, company not null
    const headers = [
      'Score', 'Band', 'Group', 'Company', 'Country', 'City', 'Industry',
      'Signal Type', 'Use Case', 'Summary',
      'Title', 'Publisher', 'Published Date', 'URL',
      'FlytBase Mentioned', 'Key People', 'Key Entities',
      'Is Duplicate', 'Drop Reason',
    ];

    const rows: string[] = [headers.map(esc).join(',')];

    // Sort by score DESC
    const sorted = [...allScored].sort(
      (a, b) => (b.relevance_score as number) - (a.relevance_score as number),
    );

    for (const s of sorted) {
      if (s.is_duplicate) continue;               // skip cross-run duplicates
      if (!s.company) continue;                   // skip articles with no company extracted

      const article = articleMap.get(s.article_id as string);
      if (!article) continue;

      const runId = article.run_id as string;
      const group = runGroupMap.get(runId) ?? 'Unknown';

      const persons = Array.isArray(s.persons)
        ? (s.persons as { name: string; role: string; organization: string }[])
            .map(p => `${p.name} (${p.role})`)
            .join('; ')
        : '';

      const entities = Array.isArray(s.entities)
        ? (s.entities as { name: string; type: string }[])
            .map(e => `${e.name} [${e.type}]`)
            .join('; ')
        : '';

      const publishedDate = article.published_at
        ? (article.published_at as string).slice(0, 10)
        : '';

      rows.push([
        s.relevance_score,
        scoreBand(s.relevance_score as number),
        group,
        s.company,
        s.country,
        s.city,
        s.industry,
        s.signal_type,
        s.use_case,
        s.summary,
        article.title,
        article.publisher,
        publishedDate,
        article.url,
        s.flytbase_mentioned ? 'Yes' : 'No',
        persons,
        entities,
        s.is_duplicate ? 'Yes' : 'No',
        s.drop_reason,
      ].map(esc).join(','));
    }

    const csv = rows.join('\n');
    const filename = `dsp-campaign-signals-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Export failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
