import { NextResponse } from 'next/server';

/**
 * POST /api/slack
 * Body: { message: string, articleUrl?: string }
 *
 * Posts a message to the #dock-radar Slack channel via the Slack Web API.
 *
 * Why unfurl_links is false:
 *   Google News RSS URLs use client-side JavaScript redirects — they cannot be
 *   resolved to the actual article URL server-side (no HTTP 302, binary protobuf
 *   encoding). Enabling unfurl causes Slack to show a generic "Google News" card
 *   instead of the article image. The message instead uses Slack's <URL|label>
 *   hyperlink format so the URL is clickable without being displayed raw.
 *
 *   The proper fix for article images is to store the resolved article URL at
 *   scoring time (captured from res.url in fetchArticleBody) — deferred to Phase 2.
 *
 * Env vars required:
 *   SLACK_BOT_TOKEN   — xoxb-... bot token (needs chat:write scope)
 *   SLACK_CHANNEL_ID  — Channel ID (C0XYZABC) or name (#dock-radar)
 */
export async function POST(req: Request) {
  try {
    const { message } = await req.json() as { message: string; articleUrl?: string };

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const token = process.env.SLACK_BOT_TOKEN;
    const channel = process.env.SLACK_CHANNEL_ID;

    if (!token || !channel) {
      return NextResponse.json(
        { error: 'SLACK_BOT_TOKEN and SLACK_CHANNEL_ID must be set in environment variables' },
        { status: 500 },
      );
    }

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel,
        text: message,
        // true: Slack unfurls the URL in the message for og:image preview.
        // Works when resolved_url (real article URL) is set on the article.
        // Falls back to "Google News" card if only the raw redirect URL is available.
        unfurl_links: true,
        unfurl_media: true,
      }),
    });

    const data = await res.json() as { ok: boolean; error?: string; ts?: string };

    if (!data.ok) {
      console.error('[/api/slack] Slack API error:', data.error);
      return NextResponse.json({ error: data.error ?? 'Slack API error' }, { status: 500 });
    }

    console.log(`[/api/slack] Posted to ${channel}, ts=${data.ts}`);
    return NextResponse.json({ ok: true, ts: data.ts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[/api/slack]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
