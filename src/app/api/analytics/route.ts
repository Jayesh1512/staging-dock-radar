import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { requireSupabase } from '@/lib/db';
import { DEFAULTS } from '@/lib/constants';

// ── Signal type condensing (translate old 8 types → 5) ────────────────────
const SIGNAL_MAP: Record<string, string> = {
  CONTRACT: 'PROCUREMENT',
  TENDER: 'PROCUREMENT',
  EXPANSION: 'GROWTH',
  FUNDING: 'GROWTH',
  REGULATION: 'REGULATORY',
};
function condense(raw: string): string {
  return SIGNAL_MAP[raw] ?? raw;
}

export interface AnalyticsCountryRow {
  name: string;
  total: number;
  topSignal: string;
  flytbase: number;
}

export interface AnalyticsData {
  stats: {
    total: number;
    countriesCount: number;
    topSignalType: string;
    topSignalCount: number;
    flytbaseCount: number;
  };
  countries: AnalyticsCountryRow[];
}

export interface DrilldownArticle {
  id: string;
  title: string;
  url: string;
  resolved_url: string | null;
  publisher: string | null;
  published_at: string | null;
  signal_type: string;
  relevance_score: number;
  summary: string | null;
  flytbase_mentioned: boolean;
}

export async function GET(request: NextRequest) {
  // ── Drill-down: ?country=X → return articles for that country ────────────
  const country = request.nextUrl.searchParams.get('country');
  if (country) {
    try {
      const db = requireSupabase();
      const { data, error } = await db
        .from('scored_articles')
        .select('signal_type, relevance_score, flytbase_mentioned, summary, articles!article_id(id, title, url, resolved_url, publisher, published_at)')
        .eq('country', country)
        .gte('relevance_score', DEFAULTS.minScore)
        .is('drop_reason', null)
        .eq('is_duplicate', false)
        .order('relevance_score', { ascending: false })
        .limit(50);

      if (error) throw new Error(error.message);

      const articles: DrilldownArticle[] = (data ?? [])
        .filter((r: Record<string, unknown>) => r.articles != null)
        .map((r: Record<string, unknown>) => {
          const art = r.articles as Record<string, unknown>;
          return {
            id: art.id as string,
            title: art.title as string,
            url: art.url as string,
            resolved_url: (art.resolved_url as string | null) ?? null,
            publisher: (art.publisher as string | null) ?? null,
            published_at: (art.published_at as string | null) ?? null,
            signal_type: condense(r.signal_type as string ?? 'OTHER'),
            relevance_score: r.relevance_score as number,
            summary: (r.summary as string | null) ?? null,
            flytbase_mentioned: r.flytbase_mentioned as boolean,
          };
        });

      return NextResponse.json({ articles });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Drilldown error';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // ── Overview (existing) ───────────────────────────────────────────────────
  try {
    const db = requireSupabase();

    // Uncapped query — analytics needs all data, not just 500 rows
    const { data, error } = await db
      .from('scored_articles')
      .select('country, signal_type, flytbase_mentioned, relevance_score, drop_reason, is_duplicate')
      .gte('relevance_score', DEFAULTS.minScore)
      .is('drop_reason', null)
      .eq('is_duplicate', false);

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as {
      country: string | null;
      signal_type: string;
      flytbase_mentioned: boolean;
    }[];

    // ── Stat cards ────────────────────────────────────────────────────────
    const total = rows.length;
    const flytbaseCount = rows.filter(r => r.flytbase_mentioned).length;

    const signalTotals: Record<string, number> = {};
    for (const r of rows) {
      const sig = condense(r.signal_type ?? 'OTHER');
      signalTotals[sig] = (signalTotals[sig] ?? 0) + 1;
    }
    const [[topSignalType, topSignalCount] = ['—', 0]] = Object.entries(signalTotals).sort((a, b) => b[1] - a[1]);

    // ── Country breakdown (exclude null / empty country) ──────────────────
    const countryMap: Record<string, { total: number; signals: Record<string, number>; flytbase: number }> = {};
    for (const r of rows) {
      const c = r.country?.trim();
      if (!c) continue;
      if (!countryMap[c]) countryMap[c] = { total: 0, signals: {}, flytbase: 0 };
      countryMap[c].total++;
      const sig = condense(r.signal_type ?? 'OTHER');
      countryMap[c].signals[sig] = (countryMap[c].signals[sig] ?? 0) + 1;
      if (r.flytbase_mentioned) countryMap[c].flytbase++;
    }

    const countries: AnalyticsCountryRow[] = Object.entries(countryMap)
      .map(([name, d]) => ({
        name,
        total: d.total,
        topSignal: Object.entries(d.signals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—',
        flytbase: d.flytbase,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    const countriesCount = Object.keys(countryMap).length;

    return NextResponse.json({ stats: { total, countriesCount, topSignalType, topSignalCount, flytbaseCount }, countries } satisfies AnalyticsData);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analytics error';
    console.error('[/api/analytics]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
