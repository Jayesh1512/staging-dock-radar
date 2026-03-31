import { NextRequest, NextResponse } from 'next/server';
import { requireSupabase } from '@/lib/supabase';
import { llmComplete } from '@/lib/llm';

/**
 * POST /api/utilities/company-enrichment/classify-batch
 *
 * Fetches French companies with dock_verified = true from
 * multi_sources_companies_import, then in a SINGLE LLM call per company:
 *   1. Classifies as DSP / buyer / 3rd_party
 *   2. Generates a personalised outreach email
 *
 * Query params:
 *   limit  — max companies to process (default 50, max 200)
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

// ─── Combined system prompt: classify + email in one shot ────────────────────

const SYSTEM_PROMPT = `
You are a senior BD intelligence analyst at FlytBase — a B2B autonomous drone software platform.

You have TWO tasks for each company. Complete BOTH in one JSON response.

═══ TASK 1: CLASSIFY ═══

Classify the company into exactly one category:
- "DSP" = operator / drone service provider / systems integrator / reseller that deploys or integrates (commercial service work for third-party clients).
- "buyer" = enterprise/corporate/government deploying drones for its own internal operations (end-client).
- "3rd_party" = anything else (OEM hardware makers, pure hardware reseller without deployment/integration, media/regulator/unknown).

Classification rules:
1. operator (DSP): commercially offers drone services to third-party clients.
   buyer: corporates/enterprises/government deploying drones for internal use.
2. MAKER-OPERATOR HYBRID: If a company both manufactures drones and commercially deploys services to third-party clients → "DSP".
3. OEM RULE: ${OEM_LIST} = OEMs → "3rd_party".
4. If uncertain → "3rd_party" with low confidence.

═══ TASK 2: OUTREACH EMAIL ═══

Write a SHORT, personalised cold outreach email for this company.

FlytBase provides:
- Cloud-based fleet management for DJI Dock, Dock 2, and Dock 3
- Autonomous mission planning, scheduling, and real-time monitoring
- Multi-dock orchestration from a single dashboard
- AI-powered analytics, live video streaming, and automated alerts
- Enterprise-grade security, APIs, and integrations

Email rules:
1. Subject line: Short, specific, no clickbait. Reference the company or their use case.
2. Body: 3-4 short paragraphs max. Warm opening → evidence-based hook → FlytBase value prop → soft CTA.
3. Tone: Professional but conversational. No jargon overload.
4. If DSP/operator: emphasise scaling operations, managing multiple docks, serving more clients with less manual effort.
5. If buyer/enterprise: emphasise simplifying their internal drone program — automated missions, compliance, centralised control.
6. If 3rd_party (reseller/dealer): emphasise the partner program — resell FlytBase alongside DJI Dock hardware, increase deal size, recurring SaaS revenue.
7. Keep the email under 150 words.
8. Sign off as "The FlytBase Team".

═══ OUTPUT ═══

Output JSON only. No markdown. No extra keys.
{
  "category": "DSP" | "buyer" | "3rd_party",
  "confidence": <number 0-1>,
  "reason": <string: 1 sentence explaining the classification>,
  "email_subject": <string: email subject line>,
  "email_body": <string: full email body with line breaks as \\n>
}
`.trim();

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const limitParam = req.nextUrl.searchParams.get('limit');
    const limit = Math.max(1, Math.min(200, Number(limitParam) || 50));

    const db = requireSupabase();

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
Classify this company AND write a personalised outreach email.

Company:
- display_name: ${displayName}
- country_code: ${countryCode}
- website: ${website ?? '(null)'}
- linkedin: ${linkedin ?? '(null)'}
- role: ${role ?? '(null)'}
- dock_models: ${dockModels ?? '(null)'}

Evidence / verifications (may be partial):
${evidenceLines || '(none)'}

Return the JSON with all fields (category, confidence, reason, email_subject, email_body).
`.trim();

      const firstEvidenceUrl = verifications.find((v) => v.url)?.url ?? null;

      try {
        const raw = await llmComplete(SYSTEM_PROMPT, userPrompt);
        const jsonText = extractJson(raw);
        const parsed = JSON.parse(jsonText) as {
          category?: 'DSP' | 'buyer' | '3rd_party';
          confidence?: number;
          reason?: string;
          email_subject?: string;
          email_body?: string;
        };

        results.push({
          display_name: displayName,
          role,
          website,
          linkedin,
          evidence_url: firstEvidenceUrl,
          country_code: countryCode,
          category: parsed.category ?? 'error',
          confidence:
            typeof parsed.confidence === 'number'
              ? Math.max(0, Math.min(1, parsed.confidence))
              : 0.3,
          reason:
            typeof parsed.reason === 'string' ? parsed.reason : 'No reason provided by model',
          email_subject: parsed.email_subject ?? null,
          email_body: parsed.email_body ?? null,
          error: null,
        });
      } catch (err) {
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
          email_subject: null,
          email_body: null,
          error: err instanceof Error ? err.message : 'Classification failed',
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
