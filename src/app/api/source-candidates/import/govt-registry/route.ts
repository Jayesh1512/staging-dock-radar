import { NextRequest, NextResponse } from 'next/server';
import { requireSupabase } from '@/lib/supabase';
import { normalizeCompanyName } from '@/lib/company-normalize';

function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function scoreTier(score: number): string {
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  return 'C';
}

/**
 * GET /api/source-candidates/import/govt-registry?country=FR
 * Preview: returns what WOULD be imported (no DB write)
 */
export async function GET(req: NextRequest) {
  try {
    const db = requireSupabase();
    const country = req.nextUrl.searchParams.get('country') ?? 'FR';

    const { data: companies, error } = await db
      .from('country_registered_companies')
      .select('*')
      .eq('country_code', country)
      .order('composite_score', { ascending: false });

    if (error) throw new Error(error.message);

    const records = (companies ?? []).map(r => {
      const normalized = normalizeCompanyName(r.company_name);
      const domain = extractDomain(r.website);
      return {
        company_name: r.company_name,
        trade_name: r.trade_name || null,
        normalized_name: normalized,
        normalized_domain: domain,
        website: r.website || null,
        linkedin_url: r.linkedin || null,
        city: r.city || null,
        employee_count: r.employee_estimate || null,
        employee_band: r.employee_band,
        score: r.composite_score,
        confidence: r.confidence,
        tier: scoreTier(r.composite_score),
        activity_code: r.activity_code,
        signal_keyword: r.match_keyword || r.notes || null,
        registry_id: r.registry_id,
      };
    });

    // Check which are already in staging
    const existingNames = new Set<string>();
    if (records.length > 0) {
      const { data: existing } = await db
        .from('source_candidates')
        .select('normalized_name')
        .eq('source_type', 'govt_registry')
        .eq('country_code', country);
      (existing ?? []).forEach(e => existingNames.add(e.normalized_name));
    }

    // Cross-reference against DJI Reseller staging for enrichment
    const djiLookup = new Map<string, { website: string; linkedin_url: string }>();
    {
      const { data: djiRecords } = await db
        .from('source_candidates')
        .select('normalized_name,website,linkedin_url')
        .eq('source_type', 'dji_reseller_list')
        .eq('country_code', country);
      for (const d of djiRecords ?? []) {
        if (d.website || d.linkedin_url) {
          djiLookup.set(d.normalized_name, { website: d.website, linkedin_url: d.linkedin_url });
        }
      }
    }

    const enriched = records.map(r => {
      const djiMatch = djiLookup.get(r.normalized_name);
      return {
        ...r,
        already_imported: existingNames.has(r.normalized_name),
        dji_match: !!djiMatch,
        enriched_website: r.website || djiMatch?.website || null,
        enriched_linkedin: r.linkedin_url || djiMatch?.linkedin_url || null,
      };
    });

    const tierA = enriched.filter(r => r.tier === 'A');
    const tierB = enriched.filter(r => r.tier === 'B');
    const tierC = enriched.filter(r => r.tier === 'C');

    const stats = {
      total: enriched.length,
      tier_a: tierA.length,
      tier_b: tierB.length,
      tier_c: tierC.length,
      has_website: enriched.filter(r => r.enriched_website).length,
      has_linkedin: enriched.filter(r => r.enriched_linkedin).length,
      dji_matches: enriched.filter(r => r.dji_match).length,
      already_imported: enriched.filter(r => r.already_imported).length,
    };

    return NextResponse.json({ records: enriched, stats, country });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/source-candidates/import/govt-registry
 * Body: { country: "FR" }
 * Imports ALL tiers (A+B+C) to source_candidates
 */
export async function POST(req: NextRequest) {
  try {
    const db = requireSupabase();
    const body = await req.json();
    const country: string = body.country ?? 'FR';

    // 1. Create import run
    const { data: run, error: runError } = await db
      .from('source_import_runs')
      .insert({
        source_type: 'govt_registry',
        country_code: country,
        run_label: `${country} SIRENE waterfall_v2`,
        status: 'running',
      })
      .select()
      .single();

    if (runError) throw new Error(`Failed to create run: ${runError.message}`);

    // 2. Fetch all registry records
    const { data: companies, error: fetchError } = await db
      .from('country_registered_companies')
      .select('*')
      .eq('country_code', country)
      .order('composite_score', { ascending: false });

    if (fetchError) throw new Error(`Failed to fetch: ${fetchError.message}`);

    const totalInput = companies?.length ?? 0;

    // 3. Cross-reference DJI staging for enrichment
    const djiLookup = new Map<string, { website: string; linkedin_url: string }>();
    {
      const { data: djiRecords } = await db
        .from('source_candidates')
        .select('normalized_name,website,linkedin_url')
        .eq('source_type', 'dji_reseller_list')
        .eq('country_code', country);
      for (const d of djiRecords ?? []) {
        if (d.website || d.linkedin_url) {
          djiLookup.set(d.normalized_name, { website: d.website, linkedin_url: d.linkedin_url });
        }
      }
    }

    // 4. Transform and upsert (individual to handle collisions gracefully)
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    let djiEnriched = 0;
    const seenNames = new Set<string>();

    for (const r of companies ?? []) {
      const normalized = normalizeCompanyName(r.company_name);

      // Skip duplicates within this import (same normalized name)
      if (seenNames.has(normalized)) {
        skipped++;
        continue;
      }
      seenNames.add(normalized);

      const djiMatch = djiLookup.get(normalized);
      if (djiMatch) djiEnriched++;

      const record = {
        source_type: 'govt_registry',
        source_run_id: run.id,
        country_code: country,
        company_name: r.company_name,
        normalized_name: normalized,
        normalized_domain: extractDomain(r.website || djiMatch?.website),
        website: r.website || djiMatch?.website || null,
        linkedin_url: r.linkedin || djiMatch?.linkedin_url || null,
        city: r.city || null,
        employee_count: r.employee_estimate || null,
        raw_score: r.composite_score,
        confidence: r.confidence,
        entity_type: 'unknown' as const,
        signal_keyword: r.notes || r.match_keyword || null,
        evidence_url: null,
        snippet: `${r.company_name} — NAF ${r.activity_code || '?'}, ${r.employee_band ? 'emp band ' + r.employee_band : 'employees unknown'}`,
        detected_at: r.extracted_at || new Date().toISOString(),
        source_meta: {
          registry_id: r.registry_id,
          activity_code: r.activity_code,
          legal_form_code: r.legal_form_code,
          employee_band: r.employee_band,
          company_category: r.company_category,
          founded_date: r.founded_date,
          trade_name: r.trade_name,
          acronym: r.acronym,
          filter_version: r.filter_version,
          rank: r.rank,
        },
        status: 'imported',
      };

      const { error: upsertError } = await db
        .from('source_candidates')
        .upsert(record, { onConflict: 'source_type,normalized_name,country_code' });

      if (upsertError) {
        errors++;
      } else {
        imported++;
      }
    }

    // 5. Update import run
    await db
      .from('source_import_runs')
      .update({
        total_input: totalInput,
        after_dedup: totalInput,
        imported,
        errors,
        status: errors > 0 && imported === 0 ? 'failed' : 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    return NextResponse.json({
      run_id: run.id,
      total_input: totalInput,
      imported,
      skipped,
      errors,
      dji_enriched: djiEnriched,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
