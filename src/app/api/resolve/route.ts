import { NextResponse } from 'next/server';
import { resolveUrl, extractOgImage } from '@/lib/article-body';
import { updateArticleResolvedUrl } from '@/lib/db';
import type { ArticleSource } from '@/lib/types';

/**
 * GET /api/resolve?url=<encoded-url>&source=<ArticleSource>
 *
 * Resolves a wrapper/redirect URL to the real article URL using source-aware
 * strategies, then extracts og:image so Slack can show a rich preview.
 *
 * source param is optional — resolution still works without it, but providing
 * it enables the fastest zero-network strategy for known source types
 * (e.g. google_news CBMi decode, alert_rss ?q= extraction).
 *
 * Returns:
 *   { resolvedUrl: string, ogImage: string | null }
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');
    const source = (searchParams.get('source') ?? undefined) as ArticleSource | undefined;
    const articleId = searchParams.get('articleId') ?? undefined;

    if (!url) {
      return NextResponse.json({ error: 'url query param is required' }, { status: 400 });
    }

    // ── Resolve the real article URL ─────────────────────────────────────
    const resolvedUrl = await resolveUrl(url, source);

    // ── Fetch og:image from the resolved URL ─────────────────────────────
    // Only attempt if we actually resolved to a different URL — no point
    // fetching og:image from the original wrapper URL.
    let ogImage: string | null = null;
    if (resolvedUrl !== url) {
      try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 5000);

        const res = await fetch(resolvedUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            Accept: 'text/html,application/xhtml+xml',
          },
        });

        if (res.ok) {
          ogImage = extractOgImage(await res.text());
        }
      } catch {
        // og:image extraction is non-fatal
      }
    }

    // ── Persist resolved URL to DB so future drawer opens skip re-resolution ──
    if (articleId && resolvedUrl !== url) {
      updateArticleResolvedUrl(articleId, resolvedUrl).catch(() => {
        // Non-fatal — Slack message still works even if DB write fails
      });
    }

    return NextResponse.json({ resolvedUrl, ogImage });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Resolve error';
    console.error('[/api/resolve]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
