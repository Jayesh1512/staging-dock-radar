import { NextResponse } from 'next/server';
import { updateScoredArticle } from '@/lib/db';
import type { ArticleAction } from '@/lib/types';

/**
 * PATCH /api/articles/action
 * Body: { articleId, action, ... }
 *
 * Persists Step 3 actions (slack, bookmark, review, dismiss) to the DB.
 * Called fire-and-forget from the client — UI state is already updated optimistically.
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json() as {
      articleId: string;
      action: 'slack' | 'bookmark' | 'review' | 'dismiss';
      actions_taken?: ArticleAction[];
    };

    const { articleId, action, actions_taken } = body;

    if (!articleId || !action) {
      return NextResponse.json({ error: 'articleId and action are required' }, { status: 400 });
    }

    const now = new Date().toISOString();

    switch (action) {
      case 'slack':
        await updateScoredArticle(articleId, {
          actions_taken: actions_taken ?? ['slack'],
          slack_sent_at: now,
        });
        break;
      case 'bookmark':
        await updateScoredArticle(articleId, {
          actions_taken: actions_taken ?? ['bookmarked'],
        });
        break;
      case 'review':
        await updateScoredArticle(articleId, {
          status: 'reviewed',
          reviewed_at: now,
        });
        break;
      case 'dismiss':
        await updateScoredArticle(articleId, {
          status: 'dismissed',
          dismissed_at: now,
        });
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[/api/articles/action]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
