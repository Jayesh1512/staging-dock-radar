import { NextRequest, NextResponse } from 'next/server';
import { requireSupabase } from '@/lib/supabase';
import { llmComplete } from '@/lib/llm';

/**
 * POST /api/utilities/company-enrichment/classify-batch
 *
 * Fetches French companies with dock_verified = true from
 * multi_sources_companies_import, then classifies each one using the LLM.
 *
 * Query params:
 *   limit  — max companies to process (default 50, max 200)
 *
 * Returns { total, results: ClassifiedCompanyResult[] }
 */

type VerificationEntry = {
  method: string;
  hits: number;
  url: string | null;
  relevance: string;
  at: string;
  keywords_matched: string[];
  post_date: string | null;
  note: string | null;
};

const OEM_LIST =
  'DJI, Skydio, Autel, Parrot, senseFly, Zipline, Wing, Joby, Manna, Matternet, EHang, Flytrex, Elbit Systems, AeroVironment';

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return (fenced?.[1] ?? text).trim();
}

export async function POST(req: NextRequest) {
  try {
    const limitParam = req.nextUrl.searchParams.get('limit');
    const limit = Math.max(1, Math.min(200, Number(limitParam) || 50));

    const db = requireSupabase();

    // Fetch French verified companies
    const { data: rows, error } = await db
      .from('multi_sources_companies_import')
      .select('*')
      .eq('country_code', 'FR')
      .eq('dock_verified', true)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) {
      return NextResponse.json({ total: 0, results: [] });
    }

    const systemPrompt = `
You are a BD intelligence analyst.

Classify the given company into exactly one category:
- "DSP" = operator / drone service provider / systems integrator / reseller+deploy/integrate (commercial service work for third-party clients).
- "buyer" = enterprise/corporate/government deploying drones for its own internal operations (end-client).
- "3rd_party" = anything else (OEM hardware makers, pure hardware reseller without deployment/integration, media/regulator/unknown).

Rules you MUST follow (adapted from Dock Radar scoring rules):
1. OPERATOR vs BUYER:
   - operator (DSP): commercially offers drone services to third-party clients.
   - buyer: corporates/enterprises/government deploying drones for internal use.
   Both are valuable, but they are different categories.
2. MAKER-OPERATOR HYBRID:
   If a company both manufactures drones and commercially deploys services to third-party clients, classify as "DSP" (not "OEM").
3. OEM RULE:
   OEM list (must not be DSP/buyer):
   ${OEM_LIST}
   If the company appears to be an OEM hardware maker, output "3rd_party".
4. If you cannot determine reliably, output "3rd_party" with low confidence.

Output JSON only. No markdown. No extra keys.
Schema:
{
  "category": "DSP" | "buyer" | "3rd_party",
  "confidence": <number 0-1>,
  "reason": <string short, 1 sentence>
}
`.trim();

    // Process each company sequentially (to avoid rate-limiting)
    const results = [];

    for (const rawRow of rows) {
      const row = rawRow as unknown as Record<string, unknown>;
      const displayName = (row.display_name ?? row.company_name ?? row.normalized_name ?? '') as string;
      const website = (row.website ?? null) as string | null;
      const linkedin = (row.linkedin ?? null) as string | null;
      const role = (row.role ?? null) as string | null;
      const dockModels = (row.dock_models ?? null) as string | null;
      const countryCode = (row.country_code ?? 'FR') as string;
      const verifications = (row.verifications ?? []) as VerificationEntry[];

      // Build evidence lines
      const evidenceLines = verifications
        .slice(0, 12)
        .map((v) => {
          const url = v.url ?? '';
          const keywords =
            Array.isArray(v.keywords_matched) && v.keywords_matched.length
              ? v.keywords_matched.join(', ')
              : '';
          const note = v.note ?? '';
          return `- ${v.method}: hits=${v.hits}; relevance=${v.relevance}; url=${url || '(none)'}; note=${note}; keywords=[${keywords}]`;
        })
        .join('\n');

      const userPrompt = `
Classify this company based on the available context.

Company:
- display_name: ${displayName}
- country_code: ${countryCode}
- website: ${website ?? '(null)'}
- linkedin: ${linkedin ?? '(null)'}
- role: ${role ?? '(null)'}
- dock_models: ${dockModels ?? '(null)'}

Evidence / verifications (may be partial):
${evidenceLines || '(none)'}

Now decide category using the rules and return the JSON schema only.
`.trim();

      // Pick first evidence URL for display
      const firstEvidenceUrl = verifications.find((v) => v.url)?.url ?? null;

      try {
        const raw = await llmComplete(systemPrompt, userPrompt);
        const jsonText = extractJson(raw);
        const parsed = JSON.parse(jsonText) as {
          category?: 'DSP' | 'buyer' | '3rd_party';
          confidence?: number;
          reason?: string;
        };

        const category = parsed.category;
        const confidence =
          typeof parsed.confidence === 'number'
            ? Math.max(0, Math.min(1, parsed.confidence))
            : 0.3;
        const reason =
          typeof parsed.reason === 'string' ? parsed.reason : 'No reason provided by model';

        results.push({
          display_name: displayName,
          role,
          website,
          linkedin,
          evidence_url: firstEvidenceUrl,
          country_code: countryCode,
          category: category ?? 'error',
          confidence,
          reason,
          error: null,
        });
      } catch (classifyErr) {
        results.push({
          display_name: displayName,
          role,
          website,
          linkedin,
          evidence_url: firstEvidenceUrl,
          country_code: countryCode,
          category: 'error',
          confidence: 0,
          reason: '',
          error: classifyErr instanceof Error ? classifyErr.message : 'Classification failed',
        });
      }
    }

    return NextResponse.json({ total: results.length, results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Batch classification failed' },
      { status: 500 },
    );
  }
}
