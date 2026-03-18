import { NextResponse } from 'next/server';
import { upsertFlytBasePartners, loadFlytBasePartners, logPartnerUpload, loadUploadHistory } from '@/lib/db';
import { normalizeCompanyName } from '@/lib/company-normalize';

interface UploadRequest {
  csv: string;
  filename?: string;
}

interface Normalization {
  original: string;
  normalized: string;
}

interface UploadResponse {
  success: boolean;
  added: number;
  updated: number;
  skipped: number;
  total_partners: number;
  normalizations: Normalization[];
}

/**
 * POST /api/hitlist/upload
 * Parses CSV text, normalizes partner names, upserts to database.
 * Returns cleanup summary showing what was normalized.
 */
export async function GET() {
  try {
    const history = await loadUploadHistory();
    return NextResponse.json(history);
  } catch (err) {
    console.error('[/api/hitlist/upload GET] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load history' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const { csv, filename } = (await req.json()) as UploadRequest;

    if (!csv || typeof csv !== 'string') {
      return NextResponse.json({ error: 'csv field is required' }, { status: 400 });
    }

    // ── Parse CSV ──
    const lines = csv.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length === 0) {
      return NextResponse.json({ error: 'CSV is empty' }, { status: 400 });
    }

    const partners: Array<{
      name: string;
      normalized_name: string;
      region: string | null;
      type: string;
    }> = [];
    const normalizations: Normalization[] = [];
    let skipped = 0;

    // Skip header row (region,Partner or similar)
    const headerLine = lines[0].toLowerCase();
    const startIdx = headerLine.includes('partner') || headerLine.includes('region') ? 1 : 0;

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];

      // Parse CSV with quote handling
      // Simple parser: split by comma, strip quotes if present
      const parts = line.split(',').map(p => {
        let trimmed = p.trim();
        // Strip quotes if wrapped
        if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
          trimmed = trimmed.slice(1, -1);
        }
        return trimmed;
      });

      if (parts.length < 2) {
        skipped++;
        continue;
      }

      const region = parts[0] || 'Unassigned';
      const partnerName = parts[1];

      if (!partnerName || partnerName.length === 0) {
        skipped++;
        continue;
      }

      const normalized = normalizeCompanyName(partnerName);
      if (!normalized) {
        skipped++;
        continue;
      }

      // Track normalizations (only if changed significantly)
      if (normalized !== partnerName.toLowerCase()) {
        normalizations.push({
          original: partnerName,
          normalized,
        });
      }

      partners.push({
        name: partnerName,
        normalized_name: normalized,
        region: region && region !== 'Unassigned' ? region : null,
        type: 'partner',
      });
    }

    if (partners.length === 0) {
      return NextResponse.json({
        success: true,
        added: 0,
        updated: 0,
        skipped,
        total_partners: 0,
        normalizations: [],
      });
    }

    // ── Deduplicate by normalized_name (keep first occurrence) ──
    const seen = new Set<string>();
    const dedupedPartners = partners.filter(p => {
      if (seen.has(p.normalized_name)) {
        skipped++;
        return false;
      }
      seen.add(p.normalized_name);
      return true;
    });

    // ── Upsert to database ──
    const { added, updated } = await upsertFlytBasePartners(dedupedPartners);

    // ── Get total count ──
    const allPartners = await loadFlytBasePartners();

    // ── Log upload event (non-fatal) ──
    const uploadFilename = filename || `upload-${new Date().toISOString().split('T')[0]}.csv`;
    try {
      await logPartnerUpload({
        filename: uploadFilename,
        added,
        updated,
        skipped,
        total_partners: allPartners.length,
      });
    } catch (logErr) {
      console.warn('[/api/hitlist/upload] Failed to log upload event (non-fatal):', logErr);
    }

    return NextResponse.json({
      success: true,
      added,
      updated,
      skipped,
      total_partners: allPartners.length,
      normalizations: normalizations.slice(0, 20), // Limit to first 20 for response size
    });
  } catch (err) {
    console.error('[/api/hitlist/upload] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    );
  }
}
