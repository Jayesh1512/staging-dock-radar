import { NextResponse } from 'next/server';
import { llmComplete } from '@/lib/llm';

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

type ClassifyCompanyInput = {
  display_name: string;
  website: string | null;
  linkedin: string | null;
  role: string | null;
  dock_models: string | null;
  country_code: string;
  verifications: VerificationEntry[];
};

const OEM_LIST = 'DJI, Skydio, Autel, Parrot, senseFly, Zipline, Wing, Joby, Manna, Matternet, EHang, Flytrex, Elbit Systems, AeroVironment';

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return (fenced?.[1] ?? text).trim();
}

async function fetchWebContent(url: string, maxChars = 2500): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DockRadarBot/1.0; +https://dock-radar.com)' },
    });
    clearTimeout(timeout);
    if (!res.ok) return '';
    const html = await res.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, maxChars);
  } catch {
    return '';
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { company?: ClassifyCompanyInput };
    const company = body.company;

    if (!company || !company.display_name) {
      return NextResponse.json({ error: 'company.display_name is required' }, { status: 400 });
    }

    // Fetch website and LinkedIn content in parallel
    const [websiteContent, linkedinContent] = await Promise.all([
      company.website ? fetchWebContent(company.website) : Promise.resolve(''),
      company.linkedin ? fetchWebContent(company.linkedin) : Promise.resolve(''),
    ]);

    const systemPrompt = `
You are a BD intelligence analyst specializing in the commercial drone industry.

Your task has two parts:
1. Classify the given company into exactly one category.
2. Draft a concise, personalized outreach email for the BD team to send.

CLASSIFICATION CATEGORIES:
- "DSP" = operator / drone service provider / systems integrator / reseller+deploy/integrate (commercially offers drone services to third-party clients).
- "buyer" = enterprise/corporate/government deploying drones for its own internal operations (end-client).
- "3rd_party" = anything else (OEM hardware makers, pure hardware reseller without deployment/integration, media/regulator/unknown).

CLASSIFICATION RULES (must follow):
1. OPERATOR vs BUYER:
   - DSP: commercially offers drone services to third-party clients.
   - buyer: corporates/enterprises/government deploying drones for internal use.
   Both are valuable, but they are different categories.
2. MAKER-OPERATOR HYBRID:
   If a company both manufactures drones AND commercially deploys services to third-party clients, classify as "DSP" (not "OEM").
3. OEM RULE:
   OEM list (must not be DSP/buyer): ${OEM_LIST}
   If the company appears to be an OEM hardware maker, output "3rd_party".
4. If you cannot determine reliably, output "3rd_party" with low confidence.

EMAIL DRAFTING RULES:
- Draft a short, professional BD outreach email (subject + body, ~100-150 words).
- Tailor the email angle to the category:
  * DSP: Position DJI Dock infrastructure as a way to scale their operations and win more contracts. Reference specific services or verticals mentioned in their evidence.
  * buyer: Position DJI Dock as enabling their internal operations (efficiency, safety, compliance). Reference their specific use case or industry.
  * 3rd_party: If a reseller/integrator, position as a partnership opportunity. If OEM or media, draft a generic introduction noting shared interest in the drone ecosystem.
- Reference at least one specific detail from the evidence, website, or LinkedIn content to show you've done your homework.
- Sign off as "The Dock Radar Team".
- Do NOT invent facts — only use what is available in the provided data.

Output JSON only. No markdown. No extra keys.
Schema:
{
  "category": "DSP" | "buyer" | "3rd_party",
  "confidence": <number 0-1>,
  "reason": <string, 1 sentence>,
  "draft_email": {
    "subject": <string>,
    "body": <string, plain text with line breaks as \\n>
  }
}
`.trim();

    const evidenceLines = (company.verifications ?? []).slice(0, 12).map((v) => {
      const url = v.url ?? '';
      const keywords = Array.isArray(v.keywords_matched) && v.keywords_matched.length ? v.keywords_matched.join(', ') : '';
      const note = v.note ?? '';
      return `- ${v.method}: hits=${v.hits}; relevance=${v.relevance}; url=${url || '(none)'}; note=${note}; keywords=[${keywords}]`;
    }).join('\n');

    const userPrompt = `
Classify this company and draft an outreach email based on all available data below.

COMPANY METADATA:
- display_name: ${company.display_name}
- country_code: ${company.country_code}
- website: ${company.website ?? '(null)'}
- linkedin: ${company.linkedin ?? '(null)'}
- role: ${company.role ?? '(null)'}
- dock_models: ${company.dock_models ?? '(null)'}

WEBSITE CONTENT (scraped):
${websiteContent || '(not available)'}

LINKEDIN PAGE CONTENT (scraped):
${linkedinContent || '(not available)'}

DATABASE EVIDENCE / VERIFICATIONS (up to 12 entries):
${evidenceLines || '(none)'}

Now decide the category using the rules, then draft the outreach email. Return the JSON schema only.
`.trim();

    const raw = await llmComplete(systemPrompt, userPrompt);
    const jsonText = extractJson(raw);

    const parsed = JSON.parse(jsonText) as {
      category?: 'DSP' | 'buyer' | '3rd_party';
      confidence?: number;
      reason?: string;
      draft_email?: { subject?: string; body?: string };
    };

    const category = parsed.category;
    const confidenceNum = typeof parsed.confidence === 'number' ? parsed.confidence : 0.3;
    const confidence = Math.max(0, Math.min(1, confidenceNum));
    const reason = typeof parsed.reason === 'string' ? parsed.reason : 'No reason provided by model';
    const draft_email = parsed.draft_email && typeof parsed.draft_email === 'object'
      ? {
          subject: typeof parsed.draft_email.subject === 'string' ? parsed.draft_email.subject : '',
          body: typeof parsed.draft_email.body === 'string' ? parsed.draft_email.body : '',
        }
      : null;

    if (!category || !['DSP', 'buyer', '3rd_party'].includes(category)) {
      return NextResponse.json({ error: 'Model returned invalid category' }, { status: 500 });
    }

    return NextResponse.json({
      category,
      confidence,
      reason,
      draft_email,
      sources_used: {
        website_scraped: websiteContent.length > 0,
        linkedin_scraped: linkedinContent.length > 0,
        evidence_count: (company.verifications ?? []).length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Classification failed' },
      { status: 500 },
    );
  }
}
