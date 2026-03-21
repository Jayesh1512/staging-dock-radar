import { NextResponse } from 'next/server';
import { llmComplete } from '@/lib/llm';

const SYSTEM_PROMPT = `You are a BD operator at FlytBase writing a LinkedIn connection request.

Write a 2-line LinkedIn connection request that:
- References something specific about their work or industry
- Positions the sender as a peer operator in drone autonomy
- Ends with a natural reason to connect
- No pitch, no mention of FlytBase unless relevant, no emojis

Style: direct, curious, founder/BD voice. Keep it under 300 characters (LinkedIn limit).

Return JSON: { "message": "<the connection request text>" }`;

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      company_name?: string;
      industry?: string;
      signal_type?: string;
      region?: string;
    };

    const userPrompt = `CONTEXT:
- Company: ${body.company_name || 'Unknown'}
- Industry: ${body.industry || 'Not specified'}
- Signal: ${body.signal_type || 'Not specified'}
- Region: ${body.region || 'Not specified'}

Write the LinkedIn connection request now.`;

    const raw = await llmComplete(SYSTEM_PROMPT, userPrompt);

    let message: string;
    try {
      const parsed = JSON.parse(raw) as { message?: string };
      message = parsed.message?.trim() ?? raw.trim();
    } catch {
      message = raw.trim();
    }

    return NextResponse.json({ message });
  } catch (err) {
    console.error('[/api/linkedin-connect] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate connection request' },
      { status: 500 },
    );
  }
}
