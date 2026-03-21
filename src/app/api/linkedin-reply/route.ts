import { NextResponse } from 'next/server';
import { llmComplete } from '@/lib/llm';

const SYSTEM_PROMPT = `You are a BD operator and ecosystem builder at FlytBase replying to a LinkedIn post.

Write one LinkedIn reply (1–2 lines max) that:
- Acknowledges a specific detail from the post (not generic praise)
- Adds a brief forward-looking take on drones or physical AI as real-world infrastructure
- Feels collaborative, invites connection — not a pitch

Style: BD/founder voice, short sentences, no buzzwords, no emojis or hashtags unless in the original post. Do NOT mention FlytBase unless the post already references it.

Return JSON: { "reply": "<the reply text>" }`;

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      company?: string;
      summary?: string;
      use_case?: string;
      signal_type?: string;
    };

    const userPrompt = `CONTEXT:
- Company: ${body.company || 'Unknown'}
- Post summary: ${body.summary || 'No summary available'}
- Use case / industry: ${body.use_case || 'Not specified'}
- Signal type: ${body.signal_type || 'Not specified'}

Write the LinkedIn reply now.`;

    const raw = await llmComplete(SYSTEM_PROMPT, userPrompt);

    let reply: string;
    try {
      const parsed = JSON.parse(raw) as { reply?: string };
      reply = parsed.reply?.trim() ?? raw.trim();
    } catch {
      // If JSON parse fails, use raw text directly
      reply = raw.trim();
    }

    return NextResponse.json({ reply });
  } catch (err) {
    console.error('[/api/linkedin-reply] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate reply' },
      { status: 500 },
    );
  }
}
