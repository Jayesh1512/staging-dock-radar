import { NextResponse } from 'next/server';
import { requireSupabase } from '@/lib/db';
import { normalizeCompanyName, fuzzyMatchCompany } from '@/lib/company-normalize';
import { NAF_LABELS, getEmployeeLabel, FR_EMPLOYEE_BANDS } from '@/lib/registry-constants';

/** Map ISO country code → full country name for discovered_companies.countries */
const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  FR: 'France', DE: 'Germany', UK: 'UK', ES: 'Spain', IT: 'Italy',
  NL: 'Netherlands', US: 'US', AU: 'Australia', IN: 'India',
  AE: 'UAE', SA: 'Saudi Arabia', SG: 'Singapore', JP: 'Japan',
  KR: 'South Korea', BR: 'Brazil', CA: 'Canada', MX: 'Mexico',
};

/**
 * POST /api/registry/merge
 * Merge all approved registry rows into discovered_companies.
 * Body: { country_code?: string } — optional filter by country. Default: merge all approved.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { country_code?: string };
    const db = requireSupabase();

    // Fetch approved rows
    let query = db
      .from('country_registered_companies')
      .select('*')
      .eq('qa_status', 'approved');

    if (body.country_code) {
      query = query.eq('country_code', body.country_code.toUpperCase());
    }

    const { data: approvedRows, error: fetchError } = await query;
    if (fetchError) {
      console.error('[/api/registry/merge] Fetch error:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch approved rows' }, { status: 500 });
    }

    if (!approvedRows || approvedRows.length === 0) {
      return NextResponse.json({ merged: 0, created: 0, updated: 0, message: 'No approved rows to merge' });
    }

    // Load existing discovered_companies for dedup
    const { data: discoveredRows } = await db
      .from('discovered_companies')
      .select('normalized_name, display_name');
    const discoveredSet = new Set((discoveredRows ?? []).map(r => r.normalized_name));

    // Load flytbase_partners for known partner flag
    const { data: partnerRows } = await db
      .from('flytbase_partners')
      .select('normalized_name');
    const partnerNames = (partnerRows ?? []).map(r => r.normalized_name);

    let created = 0;
    let updated = 0;
    const mergedIds: string[] = [];

    for (const row of approvedRows) {
      const normalizedName = normalizeCompanyName(row.company_name);
      if (!normalizedName) continue;

      const countryName = COUNTRY_CODE_TO_NAME[row.country_code] ?? row.country_code;
      const industryLabel = row.activity_code ? (NAF_LABELS[row.activity_code] ?? null) : null;

      // Derive employee label and founded year from registry fields
      const empLabel = row.employee_band && row.country_code === 'FR'
        ? (FR_EMPLOYEE_BANDS[row.employee_band]?.label ?? row.employee_band)
        : (row.employee_band ?? null);
      const foundedYear = row.founded_date ? new Date(row.founded_date).getFullYear() : null;

      if (discoveredSet.has(normalizedName)) {
        // UPDATE existing — enrich with registry data
        const updatePayload: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
          enriched_by: 'registry_merge',
        };
        if (row.website) updatePayload.website = row.website;
        if (row.linkedin) updatePayload.linkedin = row.linkedin;
        if (empLabel) updatePayload.employee_count = empLabel;
        if (foundedYear) updatePayload.founded_year = foundedYear;
        if (row.city) updatePayload.city = row.city;
        updatePayload.source = 'country_registry';

        await db
          .from('discovered_companies')
          .update(updatePayload)
          .eq('normalized_name', normalizedName);

        updated++;
      } else {
        // INSERT new discovered company from registry
        const partnerMatch = fuzzyMatchCompany(row.company_name, partnerNames);
        const isPartner = partnerMatch.match !== null && partnerMatch.confidence === 'high';

        const { error: insertError } = await db
          .from('discovered_companies')
          .insert({
            normalized_name: normalizedName,
            display_name: row.company_name,
            types: JSON.stringify(['operator']),
            countries: JSON.stringify([countryName]),
            industries: industryLabel ? JSON.stringify([industryLabel]) : JSON.stringify([]),
            signal_types: JSON.stringify([]),
            mention_count: 0,
            website: row.website || null,
            linkedin: row.linkedin || null,
            enriched_by: 'registry_merge',
            employee_count: empLabel,
            founded_year: foundedYear,
            city: row.city || null,
            source: 'country_registry',
          });

        if (insertError) {
          console.error(`[/api/registry/merge] Insert error for ${row.company_name}:`, insertError);
          continue;
        }

        discoveredSet.add(normalizedName); // Prevent duplicates within same batch
        created++;
      }

      mergedIds.push(row.id);
    }

    // Mark all merged rows
    if (mergedIds.length > 0) {
      // Batch in groups of 100 to avoid query size limits
      for (let i = 0; i < mergedIds.length; i += 100) {
        const batch = mergedIds.slice(i, i + 100);
        await db
          .from('country_registered_companies')
          .update({
            qa_status: 'merged',
            merged_to: 'discovered_companies',
            updated_at: new Date().toISOString(),
          })
          .in('id', batch);
      }
    }

    return NextResponse.json({
      merged: mergedIds.length,
      created,
      updated,
    });
  } catch (err) {
    console.error('[/api/registry/merge] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to merge' },
      { status: 500 },
    );
  }
}
