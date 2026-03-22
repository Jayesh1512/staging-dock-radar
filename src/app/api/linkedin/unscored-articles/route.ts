import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function requireSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars not set');
  return createClient(url, key);
}

/**
 * GET /api/linkedin/unscored-articles
 * Returns LinkedIn articles that have NOT been scored yet (ever_queued = false
 * and no matching row in scored_articles). Capped at 500 to avoid overloading.
 */
export async function GET() {
  try {
    const db = requireSupabase();

    // Fetch LinkedIn articles not yet ever_queued, ordered by newest first.
    // We fetch a wide net (500) then the scoring pipeline's own dedup/ever_queued
    // gates will handle any edge cases.
    const { data, error } = await db
      .from('articles')
      .select('*')
      .eq('source', 'linkedin')
      .eq('ever_queued', false)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw new Error(error.message);

    const articles = data ?? [];

    // Secondary filter: exclude any article_ids already in scored_articles
    // (some may be scored but ever_queued flag not set due to an old bug)
    let scoredIds = new Set<string>();
    if (articles.length > 0) {
      const ids = articles.map((a: { id: string }) => a.id);
      const { data: scoredRows } = await db
        .from('scored_articles')
        .select('article_id')
        .in('article_id', ids);
      scoredIds = new Set((scoredRows ?? []).map((r: { article_id: string }) => r.article_id));
    }

    const unscored = articles.filter((a: { id: string }) => !scoredIds.has(a.id));

    return NextResponse.json({ articles: unscored, total: unscored.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
