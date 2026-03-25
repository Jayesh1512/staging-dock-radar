import { NextRequest, NextResponse } from 'next/server';
import { requireSupabase } from '@/lib/supabase';
import { normalizeCompanyName } from '@/lib/company-normalize';

/**
 * Extract root domain from a URL (strip www, protocol, path)
 */
function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * GET /api/source-candidates/import/dji-resellers?country=FR
 * Preview: returns what WOULD be imported (no DB write)
 */
export async function GET(req: NextRequest) {
  try {
    const db = requireSupabase();
    const country = req.nextUrl.searchParams.get('country') ?? 'FR';

    const { data: resellers, error } = await db
      .from('dji_resellers')
      .select('*')
      .eq('country_code', country)
      .eq('dealer_type', 'Enterprise Dealer')
      .order('name');

    if (error) throw new Error(error.message);

    // Transform to staging format (preview only)
    const preview = (resellers ?? []).map(r => ({
      company_name: r.name,
      normalized_name: normalizeCompanyName(r.name),
      normalized_domain: extractDomain(r.website),
      website: r.website || null,
      linkedin_url: r.linkedin_url || null,
      city: r.city || r.state || null,
      employee_count: null,
      confidence: 'high',
      entity_type: 'reseller' as const,
      signal_keyword: 'DJI Enterprise Dealer',
      source_meta: {
        dealer_type: r.dealer_type,
        address: r.address,
        phone: r.phone,
        email: r.email,
        dji_reseller_id: r.id,
      },
    }));

    // Check which are already in staging
    const existingNames = new Set<string>();
    if (preview.length > 0) {
      const { data: existing } = await db
        .from('source_candidates')
        .select('normalized_name')
        .eq('source_type', 'dji_reseller_list')
        .eq('country_code', country);
      (existing ?? []).forEach(e => existingNames.add(e.normalized_name));
    }

    const records = preview.map(p => ({
      ...p,
      already_imported: existingNames.has(p.normalized_name),
    }));

    const stats = {
      total: records.length,
      has_website: records.filter(r => r.website).length,
      has_linkedin: records.filter(r => r.linkedin_url).length,
      already_imported: records.filter(r => r.already_imported).length,
      new_records: records.filter(r => !r.already_imported).length,
    };

    return NextResponse.json({ records, stats, country });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/source-candidates/import/dji-resellers
 * Body: { country: "FR" }
 * Actually imports records to source_candidates table
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
        source_type: 'dji_reseller_list',
        country_code: country,
        run_label: `${country} Enterprise Dealers`,
        status: 'running',
      })
      .select()
      .single();

    if (runError) throw new Error(`Failed to create run: ${runError.message}`);

    // 2. Fetch DJI Enterprise Dealers
    const { data: resellers, error: fetchError } = await db
      .from('dji_resellers')
      .select('*')
      .eq('country_code', country)
      .eq('dealer_type', 'Enterprise Dealer')
      .order('name');

    if (fetchError) throw new Error(`Failed to fetch resellers: ${fetchError.message}`);

    const totalInput = resellers?.length ?? 0;

    // 3. Transform and upsert
    let imported = 0;
    let errors = 0;
    const results: { name: string; status: string; error?: string }[] = [];

    for (const r of resellers ?? []) {
      const normalized = normalizeCompanyName(r.name);
      const domain = extractDomain(r.website);

      const record = {
        source_type: 'dji_reseller_list',
        source_run_id: run.id,
        country_code: country,
        company_name: r.name,
        normalized_name: normalized,
        normalized_domain: domain,
        website: r.website || null,
        linkedin_url: r.linkedin_url || null,
        city: r.city || r.state || null,
        employee_count: null as number | null,
        raw_score: 80,
        confidence: 'high',
        entity_type: 'reseller',
        signal_keyword: 'DJI Enterprise Dealer',
        evidence_url: 'https://store.dji.com/where-to-buy',
        snippet: `${r.name} — DJI ${r.dealer_type} in ${r.city || r.state || country}`,
        detected_at: new Date().toISOString(),
        source_meta: {
          dealer_type: r.dealer_type,
          address: r.address,
          phone: r.phone,
          email: r.email,
          dji_reseller_id: r.id,
        },
        status: 'imported',
      };

      const { error: upsertError } = await db
        .from('source_candidates')
        .upsert(record, { onConflict: 'source_type,normalized_name,country_code' });

      if (upsertError) {
        errors++;
        results.push({ name: r.name, status: 'error', error: upsertError.message });
      } else {
        imported++;
        results.push({ name: r.name, status: 'imported' });
      }
    }

    // 4. Update import run
    await db
      .from('source_import_runs')
      .update({
        total_input: totalInput,
        after_dedup: totalInput, // no dedup within source for DJI
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
      errors,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
