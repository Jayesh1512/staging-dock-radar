import { NextRequest, NextResponse } from 'next/server';
import { requireSupabase } from '@/lib/supabase';

/**
 * GET /api/source-candidates/grouped?country=FR
 *
 * Returns source_candidates grouped by normalized_name.
 * Each group = one company with aggregated sources, best score, etc.
 * Used by the "Potential Partners: Multi-Source Intelligence" tab.
 */

interface SourceSignal {
  source_type: string;
  confidence: string;
  raw_score: number;
  signal_keyword: string | null;
  website: string | null;
  linkedin_url: string | null;
  city: string | null;
  employee_count: number | null;
  snippet: string | null;
  source_meta: Record<string, unknown> | null;
  normalized_domain: string | null;
}

interface GroupedCompany {
  normalized_name: string;
  display_name: string;
  website: string | null;
  linkedin_url: string | null;
  normalized_domain: string | null;
  city: string | null;
  employee_count: number | null;
  country_code: string;
  source_count: number;
  sources: SourceSignal[];
  source_types: string[];
  best_score: number;
  best_confidence: string;
  composite_confidence: string;
  has_dock3: boolean;
  dock3_note: string | null;
  key_signal: string;
  status: string;
}

const CONFIDENCE_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

function computeCompositeConfidence(sourceCount: number, bestConfidence: string): string {
  if (sourceCount >= 3) return 'high';
  if (sourceCount >= 2 && bestConfidence === 'high') return 'high';
  if (sourceCount >= 2) return 'medium';
  if (bestConfidence === 'high') return 'high';
  return bestConfidence;
}

function matchesCompositePriority(g: GroupedCompany): boolean {
  // 2+ sources OR high confidence
  if (g.source_count >= 2) return true;
  if (g.composite_confidence === 'high') return true;
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const db = requireSupabase();
    const country = req.nextUrl.searchParams.get('country') ?? 'FR';

    // Fetch all candidates for this country
    const { data: candidates, error } = await db
      .from('source_candidates')
      .select('*')
      .eq('country_code', country)
      .eq('status', 'imported')
      .order('raw_score', { ascending: false });

    if (error) throw new Error(error.message);

    // Group by normalized_name
    const groupMap = new Map<string, typeof candidates>();

    for (const c of candidates ?? []) {
      const key = c.normalized_name;
      const existing = groupMap.get(key) ?? [];
      existing.push(c);
      groupMap.set(key, existing);
    }

    // Also group by normalized_domain for cross-source matching
    // (e.g., NETPIX with different normalized names but same domain)
    const domainMap = new Map<string, string>(); // domain → canonical normalized_name
    for (const [name, records] of groupMap.entries()) {
      for (const r of records) {
        if (r.normalized_domain) {
          const existing = domainMap.get(r.normalized_domain);
          if (existing && existing !== name) {
            // Domain collision — merge the smaller group into the larger
            const existingGroup = groupMap.get(existing) ?? [];
            const currentGroup = groupMap.get(name) ?? [];
            if (currentGroup.length <= existingGroup.length) {
              existingGroup.push(...currentGroup);
              groupMap.set(existing, existingGroup);
              groupMap.delete(name);
            } else {
              currentGroup.push(...existingGroup);
              groupMap.set(name, currentGroup);
              groupMap.delete(existing);
              domainMap.set(r.normalized_domain, name);
            }
          } else {
            domainMap.set(r.normalized_domain, name);
          }
        }
      }
    }

    // Build grouped companies
    const groups: GroupedCompany[] = [];

    for (const [normalizedName, records] of groupMap.entries()) {
      // Aggregate sources
      const sourceTypes = [...new Set(records.map(r => r.source_type))];
      const sourceCount = sourceTypes.length;

      // Best values across sources
      let bestScore = 0;
      let bestConfidence = 'low';
      let bestWebsite: string | null = null;
      let bestLinkedin: string | null = null;
      let bestDomain: string | null = null;
      let bestCity: string | null = null;
      let bestEmployeeCount: number | null = null;
      let displayName = '';
      let hasDock3 = false;
      let dock3Note: string | null = null;
      const signals: string[] = [];

      const sources: SourceSignal[] = records.map(r => {
        // Track best values
        if (r.raw_score > bestScore) bestScore = r.raw_score;
        if (CONFIDENCE_RANK[r.confidence] > CONFIDENCE_RANK[bestConfidence]) bestConfidence = r.confidence;
        if (r.website && !bestWebsite) bestWebsite = r.website;
        if (r.linkedin_url && !bestLinkedin) bestLinkedin = r.linkedin_url;
        if (r.normalized_domain && !bestDomain) bestDomain = r.normalized_domain;
        if (r.city && !bestCity) bestCity = r.city;
        if (r.employee_count && !bestEmployeeCount) bestEmployeeCount = r.employee_count;
        // Extract employee count from source_meta.employee_band if not in column
        if (!bestEmployeeCount) {
          const meta = r.source_meta as Record<string, unknown> | null;
          const band = meta?.employee_band as string | undefined;
          if (band && band !== 'NN' && band !== '00') {
            // SIRENE employee bands: 01=1-2, 02=3-5, 03=6-9, 11=10-19, 12=20-49, 21=50-99, etc.
            const bandMap: Record<string, number> = { '01': 2, '02': 4, '03': 8, '11': 15, '12': 35, '21': 75, '22': 150, '31': 350, '32': 750, '41': 1500, '42': 3500, '51': 7500, '52': 10000 };
            bestEmployeeCount = bandMap[band] ?? null;
          }
        }

        // Use shortest non-all-caps name as display name, or first
        if (!displayName || (r.company_name.length < displayName.length && r.company_name !== r.company_name.toUpperCase())) {
          displayName = r.company_name;
        }
        // Fallback: if all are uppercase, just use first
        if (!displayName) displayName = r.company_name;

        // Check for Dock 3 authorization
        const meta = r.source_meta as Record<string, unknown> | null;
        if (meta?.dock3_authorized === 'Yes') {
          hasDock3 = true;
          dock3Note = `DJI Dock 3 Authorized${meta.comet_file ? '' : ''}`;
        }

        // Collect signal keywords
        if (r.signal_keyword) signals.push(r.signal_keyword);

        return {
          source_type: r.source_type,
          confidence: r.confidence,
          raw_score: r.raw_score,
          signal_keyword: r.signal_keyword,
          website: r.website,
          linkedin_url: r.linkedin_url,
          city: r.city,
          employee_count: r.employee_count,
          snippet: r.snippet,
          source_meta: meta,
          normalized_domain: r.normalized_domain,
        };
      });

      // If display name is still all-caps and we have a better one from sources, use it
      if (displayName === displayName.toUpperCase()) {
        // Check if any source has a nicer name
        const nicerName = records.find(r => r.company_name !== r.company_name.toUpperCase());
        if (nicerName) displayName = nicerName.company_name;
      }

      const compositeConfidence = computeCompositeConfidence(sourceCount, bestConfidence);

      // Build key signal string
      const keySignal = signals.filter(Boolean).slice(0, 2).join(' + ') || '—';

      groups.push({
        normalized_name: normalizedName,
        display_name: displayName || normalizedName,
        website: bestWebsite,
        linkedin_url: bestLinkedin,
        normalized_domain: bestDomain,
        city: bestCity,
        employee_count: bestEmployeeCount,
        country_code: country,
        source_count: sourceCount,
        sources,
        source_types: sourceTypes,
        best_score: bestScore,
        best_confidence: bestConfidence,
        composite_confidence: compositeConfidence,
        has_dock3: hasDock3,
        dock3_note: dock3Note,
        key_signal: keySignal,
        status: 'imported',
      });
    }

    // Sort: multi-source first, then by composite confidence, then by score
    groups.sort((a, b) => {
      // Multi-source first
      if (a.source_count !== b.source_count) return b.source_count - a.source_count;
      // Then by confidence
      if (CONFIDENCE_RANK[a.composite_confidence] !== CONFIDENCE_RANK[b.composite_confidence]) {
        return CONFIDENCE_RANK[b.composite_confidence] - CONFIDENCE_RANK[a.composite_confidence];
      }
      // Then by has_dock3
      if (a.has_dock3 !== b.has_dock3) return a.has_dock3 ? -1 : 1;
      // Then by has website
      if (!!a.website !== !!b.website) return a.website ? -1 : 1;
      // Then by score
      return b.best_score - a.best_score;
    });

    // Stats
    const multiSource = groups.filter(g => g.source_count >= 2).length;
    const dock3Count = groups.filter(g => g.has_dock3).length;
    const hasWebsite = groups.filter(g => g.website).length;
    const highConf = groups.filter(g => g.composite_confidence === 'high').length;
    const medConf = groups.filter(g => g.composite_confidence === 'medium').length;
    const lowConf = groups.filter(g => g.composite_confidence === 'low').length;
    const compositePriorityCount = groups.filter(g => matchesCompositePriority(g)).length;

    // Tag each group with priority match
    const tagged = groups.map((g, i) => ({
      ...g,
      rank: i + 1,
      matches_composite_priority: matchesCompositePriority(g),
    }));

    return NextResponse.json({
      country,
      total_candidates: candidates?.length ?? 0,
      total_companies: groups.length,
      stats: {
        multi_source: multiSource,
        dock3_confirmed: dock3Count,
        has_website: hasWebsite,
        high_confidence: highConf,
        medium_confidence: medConf,
        low_confidence: lowConf,
        composite_priority_matches: compositePriorityCount,
      },
      companies: tagged,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
