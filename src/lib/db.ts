/**
 * Database persistence layer for Dock Radar.
 *
 * All functions use the server-side Supabase client (service-role key).
 * Import only in API routes / server components — never in "use client" files.
 */

import { requireSupabase } from './supabase';
import { dedupKey } from './url-fingerprint';
import type { Run, Article, ScoredArticle, ArticleWithScore } from './types';

// ─── Supabase Client ─────────────────────────────────────────────────────────

export { requireSupabase };

// ─── Runs ────────────────────────────────────────────────────────────────────

export async function insertRun(run: Run): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.from('runs').insert({
    id: run.id,
    keywords: run.keywords,
    sources: run.sources,
    regions: run.regions,
    filter_days: run.filter_days,
    min_score: run.min_score,
    max_articles: run.max_articles,
    status: run.status,
    articles_fetched: run.articles_fetched,
    articles_stored: run.articles_stored,
    dedup_removed: run.dedup_removed,
    created_at: run.created_at,
    completed_at: run.completed_at,
  });
  if (error) throw new Error(`[db] insertRun failed: ${error.message}`);
}

export async function updateRunStatus(
  runId: string,
  status: Run['status'],
  stats?: { articles_fetched: number; articles_stored: number; dedup_removed: number },
): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.from('runs').update({
    status,
    completed_at: status === 'completed' ? new Date().toISOString() : null,
    ...(stats ?? {}),
  }).eq('id', runId);
  if (error) throw new Error(`[db] updateRunStatus failed: ${error.message}`);
}

// ─── Articles ────────────────────────────────────────────────────────────────

/**
 * Insert articles, skipping duplicates by normalized_url (UNIQUE constraint).
 * Returns a map of normalized_url → actual DB article ID, so the caller can
 * remap any cross-run duplicate IDs before passing articles to scoring.
 *
 * Why: If Run 2 collects an article that Run 1 already has, the upsert skips it.
 * But the client-generated ID for Run 2 doesn't exist in DB. Without remapping,
 * the scoring FK (scored_articles.article_id → articles.id) would fail.
 */
export async function insertArticles(articles: Article[]): Promise<{ insertedCount: number; idMap: Map<string, string> }> {
  if (articles.length === 0) return { insertedCount: 0, idMap: new Map() };
  const db = requireSupabase();

  const rows = articles.map((a) => ({
    id: a.id,
    run_id: a.run_id,
    source: a.source,
    title: a.title,
    url: a.url,
    normalized_url: a.normalized_url,
    snippet: a.snippet,
    publisher: a.publisher,
    published_at: a.published_at,
    resolved_url: a.resolved_url ?? null,
    created_at: a.created_at,
  }));

  // Upsert: new articles are inserted; duplicates by normalized_url are skipped
  const { error } = await db.from('articles')
    .upsert(rows, { onConflict: 'normalized_url', ignoreDuplicates: true });

  if (error) throw new Error(`[db] insertArticles failed: ${error.message}`);

  // Query back actual DB IDs for all normalized_urls — handles cross-run remapping
  const normalizedUrls = articles.map(a => a.normalized_url);
  const { data: dbRows, error: selectErr } = await db.from('articles')
    .select('id, normalized_url')
    .in('normalized_url', normalizedUrls);

  if (selectErr) throw new Error(`[db] insertArticles select failed: ${selectErr.message}`);

  // Map: normalized_url → DB article ID
  const urlToDbId = new Map((dbRows ?? []).map((r: { id: string; normalized_url: string }) => [r.normalized_url, r.id]));

  // Map: client article ID → DB article ID (for remapping)
  const idMap = new Map<string, string>();
  for (const a of articles) {
    const dbId = urlToDbId.get(a.normalized_url);
    if (dbId && dbId !== a.id) {
      idMap.set(a.id, dbId); // cross-run duplicate: remap to existing DB ID
    }
  }

  const insertedCount = articles.filter(a => !idMap.has(a.id)).length;
  return { insertedCount, idMap };
}

/**
 * Returns a Set of article IDs (from the provided list) that already have ever_queued = true.
 * Used by the score route to skip re-scoring articles already in Step 3.
 */
export async function loadEverQueuedArticleIds(articleIds: string[]): Promise<Set<string>> {
  if (articleIds.length === 0) return new Set();
  const db = requireSupabase();
  const { data, error } = await db.from('articles')
    .select('id')
    .in('id', articleIds)
    .eq('ever_queued', true);
  if (error) throw new Error(`[db] loadEverQueuedArticleIds failed: ${error.message}`);
  return new Set((data ?? []).map((r: { id: string }) => r.id));
}

/**
 * Marks articles as ever_queued = true (called after an article first reaches Step 3).
 * Once set, these articles are skipped in all future scoring runs.
 */
export async function markArticlesAsEverQueued(articleIds: string[]): Promise<void> {
  if (articleIds.length === 0) return;
  const db = requireSupabase();
  const { error } = await db.from('articles')
    .update({ ever_queued: true })
    .in('id', articleIds);
  if (error) throw new Error(`[db] markArticlesAsEverQueued failed: ${error.message}`);
}

/** Update resolved_url on an article (set during scoring body fetch) */
export async function updateArticleResolvedUrl(articleId: string, resolvedUrl: string): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.from('articles').update({ resolved_url: resolvedUrl }).eq('id', articleId);
  if (error) console.error(`[db] updateArticleResolvedUrl failed: ${error.message}`);
}

// ─── Scored Articles ─────────────────────────────────────────────────────────

/**
 * Look up existing scored articles by article IDs.
 * Used by D4 scoring cache to skip redundant LLM calls for already-scored articles.
 * Returns a map of article_id → ScoredArticle.
 */
export async function loadScoredByArticleIds(articleIds: string[]): Promise<Map<string, ScoredArticle>> {
  if (articleIds.length === 0) return new Map();
  const db = requireSupabase();
  const { data, error } = await db.from('scored_articles')
    .select('*')
    .in('article_id', articleIds);
  if (error) throw new Error(`[db] loadScoredByArticleIds failed: ${error.message}`);
  return new Map(
    (data ?? []).map((row: Record<string, unknown>) => [row.article_id as string, mapScoredArticle(row)]),
  );
}

export interface DedupKeys {
  /** URL fingerprints already in scored_articles (for pre-score skip) */
  existingUrlFingerprints: Set<string>;
  /** Keys "url_fingerprint|company|country|city" for duplicate detection (post-score) */
  existingDedupKeys: Set<string>;
}

/**
 * Load URL fingerprints and (url_fingerprint + entities) keys from scored_articles.
 * Used to skip scoring when URL params already seen, and to mark duplicates when URL + company/country/city match.
 */
export async function loadDedupKeysFromScoredArticles(): Promise<DedupKeys> {
  const db = requireSupabase();
  const { data, error } = await db.from('scored_articles')
    .select('url_fingerprint, company, country, city');
  if (error) throw new Error(`[db] loadDedupKeysFromScoredArticles failed: ${error.message}`);
  const rows = (data ?? []) as { url_fingerprint?: string | null; company?: string | null; country?: string | null; city?: string | null }[];
  const existingUrlFingerprints = new Set<string>();
  const existingDedupKeys = new Set<string>();
  for (const r of rows) {
    const fp = r.url_fingerprint;
    if (typeof fp === 'string' && fp.length > 0) {
      existingUrlFingerprints.add(fp);
      existingDedupKeys.add(dedupKey(fp, r.company ?? null, r.country ?? null, r.city ?? null));
    }
  }
  return { existingUrlFingerprints, existingDedupKeys };
}

export async function insertScoredArticles(scored: ScoredArticle[]): Promise<void> {
  if (scored.length === 0) return;
  const db = requireSupabase();

  const rows = scored.map((s) => ({
    id: s.id,
    article_id: s.article_id,
    normalized_url: s.normalized_url ?? null,
    url_fingerprint: s.url_fingerprint ?? null,
    relevance_score: s.relevance_score,
    company: s.company,
    country: s.country,
    city: s.city,
    use_case: s.use_case,
    signal_type: s.signal_type,
    summary: s.summary,
    flytbase_mentioned: s.flytbase_mentioned,
    persons: s.persons,
    entities: s.entities,
    drop_reason: s.drop_reason,
    is_duplicate: s.is_duplicate,
    status: s.status,
    actions_taken: s.actions_taken,
    reviewed_at: s.reviewed_at,
    dismissed_at: s.dismissed_at,
    slack_sent_at: s.slack_sent_at,
    created_at: s.created_at,
  }));

  // upsert by article_id — re-scoring overwrites previous score
  const { error } = await db.from('scored_articles')
    .upsert(rows, { onConflict: 'article_id' });
  if (error) throw new Error(`[db] insertScoredArticles failed: ${error.message}`);
}

/** Persist enriched persons + entities after the lazy enrichment pass on drawer open */
export async function updateEnrichedScoredArticle(
  articleId: string,
  persons: ScoredArticle['persons'],
  entities: ScoredArticle['entities'],
): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.from('scored_articles')
    .update({ persons, entities, enriched_at: new Date().toISOString() })
    .eq('article_id', articleId);
  if (error) throw new Error(`[db] updateEnrichedScoredArticle failed: ${error.message}`);
}

/** Update scored article status and action fields (used by Step 3 actions) */
export async function updateScoredArticle(
  articleId: string,
  updates: Partial<Pick<ScoredArticle, 'status' | 'actions_taken' | 'reviewed_at' | 'dismissed_at' | 'slack_sent_at'>>,
): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.from('scored_articles')
    .update(updates)
    .eq('article_id', articleId);
  if (error) console.error(`[db] updateScoredArticle failed: ${error.message}`);
}

// ─── Queries (for D3 — load on startup) ──────────────────────────────────────

/** Load all runs, newest first */
export async function loadRuns(): Promise<Run[]> {
  const db = requireSupabase();
  const { data, error } = await db.from('runs')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`[db] loadRuns failed: ${error.message}`);
  return (data ?? []).map(mapRun);
}

/** Load all articles + scores for a specific run */
export async function loadRunArticles(runId: string): Promise<ArticleWithScore[]> {
  const db = requireSupabase();

  const { data, error } = await db.from('articles')
    .select('*, scored_articles(*)')
    .eq('run_id', runId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`[db] loadRunArticles failed: ${error.message}`);

  return (data ?? [])
    .filter((row: Record<string, unknown>) => row.scored_articles)
    .map((row: Record<string, unknown>) => ({
      article: mapArticle(row),
      scored: mapScoredArticle(
        Array.isArray(row.scored_articles)
          ? row.scored_articles[0] as Record<string, unknown>
          : row.scored_articles as Record<string, unknown>,
      ),
    }));
}

/** Load recent scored articles across all runs (for Step 3 queue restoration).
 *  Capped at 500 to prevent memory explosion on large datasets. */
export async function loadAllScoredArticles(): Promise<ArticleWithScore[]> {
  const db = requireSupabase();

  const { data, error } = await db.from('articles')
    .select('*, scored_articles(*)')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw new Error(`[db] loadAllScoredArticles failed: ${error.message}`);

  return (data ?? [])
    .filter((row: Record<string, unknown>) => {
      const sa = row.scored_articles;
      return Array.isArray(sa) ? sa.length > 0 : sa != null;
    })
    .map((row: Record<string, unknown>) => ({
      article: mapArticle(row),
      scored: mapScoredArticle(
        Array.isArray(row.scored_articles)
          ? row.scored_articles[0] as Record<string, unknown>
          : row.scored_articles as Record<string, unknown>,
      ),
    }));
}

// ─── Row mappers ─────────────────────────────────────────────────────────────

function mapRun(row: Record<string, unknown>): Run {
  return {
    id: row.id as string,
    keywords: row.keywords as string[],
    sources: row.sources as Run['sources'],
    regions: row.regions as string[],
    filter_days: row.filter_days as number,
    min_score: row.min_score as number,
    max_articles: row.max_articles as number,
    status: row.status as Run['status'],
    articles_fetched: row.articles_fetched as number,
    articles_stored: row.articles_stored as number,
    dedup_removed: row.dedup_removed as number,
    created_at: row.created_at as string,
    completed_at: (row.completed_at as string) ?? null,
  };
}

function mapArticle(row: Record<string, unknown>): Article {
  return {
    id: row.id as string,
    run_id: row.run_id as string,
    source: row.source as Article['source'],
    title: row.title as string,
    url: row.url as string,
    normalized_url: row.normalized_url as string,
    snippet: (row.snippet as string) ?? null,
    publisher: (row.publisher as string) ?? null,
    published_at: (row.published_at as string) ?? null,
    resolved_url: (row.resolved_url as string) ?? undefined,
    ever_queued: (row.ever_queued as boolean) ?? false,
    created_at: row.created_at as string,
  };
}

function mapScoredArticle(row: Record<string, unknown>): ScoredArticle {
  return {
    id: row.id as string,
    article_id: row.article_id as string,
    normalized_url: (row.normalized_url as string) ?? undefined,
    url_fingerprint: (row.url_fingerprint as string) ?? undefined,
    relevance_score: row.relevance_score as number,
    company: (row.company as string) ?? null,
    country: (row.country as string) ?? null,
    city: (row.city as string) ?? null,
    use_case: (row.use_case as string) ?? null,
    signal_type: row.signal_type as ScoredArticle['signal_type'],
    summary: (row.summary as string) ?? null,
    flytbase_mentioned: row.flytbase_mentioned as boolean,
    persons: (row.persons as ScoredArticle['persons']) ?? [],
    entities: (row.entities as ScoredArticle['entities']) ?? [],
    drop_reason: (row.drop_reason as string) ?? null,
    is_duplicate: row.is_duplicate as boolean,
    status: row.status as ScoredArticle['status'],
    actions_taken: (row.actions_taken as ScoredArticle['actions_taken']) ?? [],
    reviewed_at: (row.reviewed_at as string) ?? null,
    dismissed_at: (row.dismissed_at as string) ?? null,
    slack_sent_at: (row.slack_sent_at as string) ?? null,
    enriched_at: (row.enriched_at as string) ?? null,
    created_at: row.created_at as string,
  };
}
