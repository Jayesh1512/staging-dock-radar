import { NextResponse } from 'next/server';
import { requireSupabase } from '@/lib/db';
import {
  getEmployeeEstimate,
  computeScoreBreakdown,
  deriveConfidence,
  detectMatchKeyword,
} from '@/lib/registry-constants';

/**
 * POST /api/registry/import
 * Import a CSV file into country_registered_companies.
 * Accepts multipart form data with a CSV file, or JSON body with { file_path } for server-side files.
 *
 * CSV columns (France): siren,company_name,trade_name,acronym,naf_code,legal_form_code,
 *   employee_band,has_employees,company_category,created_date,composite_score,rank,
 *   region,signal_source,filter_version,extracted_at,notes
 */
export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    let csvText: string;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }
      csvText = await file.text();
    } else {
      // JSON body with inline CSV text or file reference
      const body = await req.json() as { csv?: string };
      if (!body.csv) {
        return NextResponse.json({ error: 'csv field is required' }, { status: 400 });
      }
      csvText = body.csv;
    }

    // Parse CSV
    const lines = csvText.split('\n').filter(l => l.trim());
    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV must have a header row and at least one data row' }, { status: 400 });
    }

    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
      return row;
    });

    // Map CSV columns → country_registered_companies columns + compute confidence + breakdown
    const records = rows.map(row => {
      const countryCode = row.region || 'FR';
      const employeeBand = row.employee_band || null;

      // Compute score breakdown from raw fields
      const breakdown = computeScoreBreakdown({
        company_name: row.company_name || '',
        activity_code: row.naf_code || null,
        employee_band: employeeBand,
        company_category: row.company_category || null,
        legal_form_code: row.legal_form_code || null,
        founded_date: row.created_date || null,
        country_code: countryCode,
      });

      const confidence = deriveConfidence(breakdown);
      const matchKeyword = row.match_keyword || detectMatchKeyword(row.company_name || '') || null;

      return {
        registry_id: row.siren || row.registry_id || '',
        company_name: row.company_name || '',
        trade_name: row.trade_name || null,
        acronym: row.acronym || null,
        activity_code: row.naf_code || row.activity_code || null,
        legal_form_code: row.legal_form_code || null,
        employee_band: employeeBand,
        employee_estimate: getEmployeeEstimate(countryCode, employeeBand ?? ''),
        has_employees: row.has_employees === 'True' || row.has_employees === 'true',
        company_category: row.company_category || null,
        founded_date: row.created_date || row.founded_date || null,
        country_code: countryCode,
        signal_source: row.signal_source || null,
        filter_version: row.filter_version || null,
        extracted_at: row.extracted_at || null,
        match_keyword: matchKeyword,
        composite_score: parseInt(row.composite_score || '0', 10) || 0,
        confidence,
        score_breakdown: breakdown,
        rank: parseInt(row.rank || '0', 10) || null,
        notes: row.notes || null,
        qa_status: 'pending',
      };
    }).filter(r => r.registry_id && r.company_name);

    if (records.length === 0) {
      return NextResponse.json({ error: 'No valid rows found in CSV' }, { status: 400 });
    }

    // Upsert in batches of 100
    const db = requireSupabase();
    const BATCH_SIZE = 10;
    let imported = 0;
    let skipped = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const { error, count } = await db
        .from('country_registered_companies')
        .upsert(batch, {
          onConflict: 'registry_id,country_code',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error(`[/api/registry/import] Batch ${i / BATCH_SIZE + 1} error:`, error);
        skipped += batch.length;
      } else {
        imported += batch.length;
      }
    }

    // Count by confidence tier
    const tiers = { high: 0, medium: 0, low: 0 };
    for (const r of records) {
      tiers[r.confidence]++;
    }

    return NextResponse.json({
      success: true,
      total_rows: records.length,
      imported,
      skipped,
      confidence_tiers: tiers,
      country: records[0]?.country_code ?? 'unknown',
    });
  } catch (err) {
    console.error('[/api/registry/import] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to import' },
      { status: 500 },
    );
  }
}
