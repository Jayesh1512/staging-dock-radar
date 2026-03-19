/**
 * Database persistence layer for Dock Radar.
 *
 * All functions use the server-side Supabase client (service-role key).
 * Import only in API routes / server components — never in "use client" files.
 */

import { requireSupabase } from './supabase';
import { dedupKey } from './url-fingerprint';
import { normalizeCountryName, OEM_NAMES } from './constants';
import { normalizeCompanyName } from './company-normalize';
import type { Run, Article, ScoredArticle, ArticleWithScore, DspHitListEntry } from './types';

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
    campaign: run.campaign ?? null,
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
    publisher_url: a.publisher_url ?? null,
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
  try {
    const { data, error } = await db.from('articles')
      .select('id')
      .in('id', articleIds)
      .eq('ever_queued', true);
    if (error) {
      if (error.message.includes('column') && error.message.includes('ever_queued')) {
        console.warn('[db] loadEverQueuedArticleIds: ever_queued column missing, skipping check');
        return new Set();
      }
      throw new Error(`[db] loadEverQueuedArticleIds failed: ${error.message}`);
    }
    return new Set((data ?? []).map((r: { id: string }) => r.id));
  } catch (err: any) {
    if (err.message?.includes('ever_queued')) {
       console.warn('[db] loadEverQueuedArticleIds column error:', err.message);
       return new Set();
    }
    throw err;
  }
}

/**
 * Marks articles as ever_queued = true (called after an article first reaches Step 3).
 * Once set, these articles are skipped in all future scoring runs.
 */
export async function markArticlesAsEverQueued(articleIds: string[]): Promise<void> {
  if (articleIds.length === 0) return;
  const db = requireSupabase();
  try {
    const { error } = await db.from('articles')
      .update({ ever_queued: true })
      .in('id', articleIds);
    if (error) {
       if (error.message.includes('column') && error.message.includes('ever_queued')) {
         console.warn('[db] markArticlesAsEverQueued: ever_queued column missing, ignoring update');
         return;
       }
       throw new Error(`[db] markArticlesAsEverQueued failed: ${error.message}`);
    }
  } catch (err: any) {
    if (err.message?.includes('ever_queued')) {
      console.warn('[db] markArticlesAsEverQueued column error:', err.message);
      return;
    }
    throw err;
  }
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
    industry: s.industry ?? null,
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
    .update({
      persons,
      entities,
      enriched_at: new Date().toISOString(),
    })
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

// ─── DSP Hit List ────────────────────────────────────────────────────────────

/** Upsert FlytBase partners (from CSV upload). Upserts on normalized_name conflict. */
export async function upsertFlytBasePartners(
  partners: Array<{
    name: string;
    normalized_name: string;
    region: string | null;
    type: string;
  }>,
): Promise<{ added: number; updated: number }> {
  if (partners.length === 0) return { added: 0, updated: 0 };
  const db = requireSupabase();

  const rows = partners.map(p => ({
    name: p.name,
    normalized_name: p.normalized_name,
    region: p.region,
    type: p.type,
    last_synced_at: new Date().toISOString(),
  }));

  const { data, error } = await db.from('flytbase_partners')
    .upsert(rows, { onConflict: 'normalized_name' })
    .select('id, created_at, last_synced_at');

  if (error) throw new Error(`[db] upsertFlytBasePartners failed: ${error.message}`);

  // Count adds vs updates by comparing created_at and last_synced_at timestamps
  let added = 0;
  let updated = 0;
  for (const row of (data ?? [])) {
    const createdAt = new Date(row.created_at as string).getTime();
    const syncedAt = new Date(row.last_synced_at as string).getTime();
    // If they're within 1 second, it's a new insert; otherwise it's an update
    if (Math.abs(syncedAt - createdAt) <= 1000) {
      added++;
    } else {
      updated++;
    }
  }

  return { added, updated };
}

/** Load all FlytBase partners, sorted by name */
export async function loadFlytBasePartners(): Promise<
  Array<{ id: string; name: string; normalized_name: string; region: string | null; type: string; website: string | null; linkedin: string | null }>
> {
  const db = requireSupabase();
  const { data, error } = await db.from('flytbase_partners')
    .select('id, name, normalized_name, region, type, website, linkedin')
    .order('name', { ascending: true });

  if (error) throw new Error(`[db] loadFlytBasePartners failed: ${error.message}`);
  return (data ?? []) as Array<{ id: string; name: string; normalized_name: string; region: string | null; type: string; website: string | null; linkedin: string | null }>;
}

/** Log a partner CSV upload event */
export async function logPartnerUpload(entry: {
  filename: string;
  added: number;
  updated: number;
  skipped: number;
  total_partners: number;
}): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.from('partner_upload_log').insert({
    filename: entry.filename,
    added: entry.added,
    updated: entry.updated,
    skipped: entry.skipped,
    total_partners: entry.total_partners,
  });

  if (error) throw new Error(`[db] logPartnerUpload failed: ${error.message}`);
}

/** Load upload history, newest first (capped at 50) */
export async function loadUploadHistory(): Promise<
  Array<{
    id: string;
    filename: string;
    uploaded_at: string;
    added: number;
    updated: number;
    skipped: number;
    total_partners: number;
  }>
> {
  const db = requireSupabase();
  const { data, error } = await db.from('partner_upload_log')
    .select('id, filename, uploaded_at, added, updated, skipped, total_partners')
    .order('uploaded_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(`[db] loadUploadHistory failed: ${error.message}`);
  return (data ?? []) as Array<{
    id: string;
    filename: string;
    uploaded_at: string;
    added: number;
    updated: number;
    skipped: number;
    total_partners: number;
  }>;
}

/** Load hit list data: scored articles with score >= 50, not dropped, not duplicate */
export async function loadHitListData(): Promise<
  Array<{
    id: string;
    article_id: string;
    relevance_score: number;
    company: string | null;
    country: string | null;
    industry: string | null;
    signal_type: string;
    created_at: string;
    entities: ScoredArticle['entities'];
    persons: ScoredArticle['persons'];
    title: string;
    url: string;
    published_at: string | null;
  }>
> {
  const db = requireSupabase();
  const { data, error } = await db.from('scored_articles')
    .select(`
      id,
      article_id,
      relevance_score,
      company,
      country,
      industry,
      signal_type,
      created_at,
      entities,
      persons,
      articles!article_id(title, url, published_at)
    `)
    .gte('relevance_score', 50)
    .is('drop_reason', null)
    .eq('is_duplicate', false);

  if (error) throw new Error(`[db] loadHitListData failed: ${error.message}`);

  // Map articles FK to flat object
  return (data ?? []).map((row: any) => ({
    id: row.id,
    article_id: row.article_id,
    relevance_score: row.relevance_score,
    company: row.company,
    country: row.country,
    industry: row.industry,
    signal_type: row.signal_type,
    created_at: row.created_at,
    entities: (row.entities as ScoredArticle['entities']) ?? [],
    persons: (row.persons as ScoredArticle['persons']) ?? [],
    title: row.articles?.[0]?.title ?? '',
    url: row.articles?.[0]?.url ?? '',
    published_at: row.articles?.[0]?.published_at ?? null,
  }));
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
    keywords: (row.keywords as string[]) ?? [],
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
    campaign: (row.campaign as string) ?? null,
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
    industry: (row.industry as string) ?? null,
    created_at: row.created_at as string,
  };
}

// ─── Discovered Companies & Contacts ─────────────────────────────────────────

export interface DiscoveredCompanyRow {
  normalized_name: string;
  display_name: string;
  types: string[];
  website: string | null;
  linkedin: string | null;
  countries: string[];
  industries: string[];
  signal_types: string[];
  mention_count: number;
  first_seen_at: string;
  last_seen_at: string;
  enriched_at: string | null;
  enriched_by: string | null;
}

/**
 * Upsert discovered companies from scored article entities.
 * Within each article, entities are deduped by normalized name (types merged).
 * OEM names are forced to type='oem'.
 * Country names are normalized via COUNTRY_NAME_MAP.
 */
export async function upsertDiscoveredFromArticles(
  articles: Array<{
    article_id: string;
    entities: Array<{ name: string; type: string }>;
    persons: Array<{ name: string; role: string; organization: string }>;
    country: string | null;
    industry: string | null;
    signal_type: string;
  }>,
): Promise<{ companiesUpserted: number; contactsUpserted: number }> {
  const db = requireSupabase();
  const now = new Date().toISOString();

  // ── Aggregate companies across all articles ──
  const companyAgg = new Map<string, {
    display_name: string;
    types: Set<string>;
    countries: Set<string>;
    industries: Set<string>;
    signal_types: Set<string>;
    article_ids: Set<string>;
  }>();

  // ── Aggregate contacts ──
  const contactAgg = new Map<string, {
    name: string;
    name_normalized: string;
    role: string;
    organization: string;
    company_normalized_name: string | null;
    source_article_id: string;
  }>();

  for (const article of articles) {
    // Within-article entity dedup: normalize names, merge types
    const articleEntities = new Map<string, { display_name: string; types: Set<string> }>();

    for (const entity of (article.entities ?? [])) {
      if (!entity.name) continue;
      const norm = normalizeCompanyName(entity.name);
      if (!norm) continue;

      // OEM check: force type to 'oem' for known manufacturers
      const entityType = OEM_NAMES.has(norm) ? 'oem' : (entity.type || 'operator');

      const existing = articleEntities.get(norm);
      if (existing) {
        existing.types.add(entityType);
      } else {
        articleEntities.set(norm, { display_name: entity.name, types: new Set([entityType]) });
      }
    }

    // Aggregate into global map
    const normalizedCountry = article.country ? normalizeCountryName(article.country) : null;

    for (const [norm, entry] of articleEntities) {
      const existing = companyAgg.get(norm);
      if (existing) {
        entry.types.forEach(t => existing.types.add(t));
        if (normalizedCountry) existing.countries.add(normalizedCountry);
        if (article.industry) existing.industries.add(article.industry);
        existing.signal_types.add(article.signal_type);
        existing.article_ids.add(article.article_id);
      } else {
        companyAgg.set(norm, {
          display_name: entry.display_name,
          types: new Set(entry.types),
          countries: new Set(normalizedCountry ? [normalizedCountry] : []),
          industries: new Set(article.industry ? [article.industry] : []),
          signal_types: new Set([article.signal_type]),
          article_ids: new Set([article.article_id]),
        });
      }
    }

    // Aggregate persons → contacts
    for (const person of (article.persons ?? [])) {
      if (!person.name) continue;
      const nameNorm = person.name.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
      if (!nameNorm) continue;

      // Try to link person to a discovered company via their organization
      let companyNorm: string | null = null;
      if (person.organization) {
        const orgNorm = normalizeCompanyName(person.organization);
        if (orgNorm && companyAgg.has(orgNorm)) {
          companyNorm = orgNorm;
        }
      }

      const dedupKey = `${nameNorm}|${companyNorm ?? ''}`;
      if (!contactAgg.has(dedupKey)) {
        contactAgg.set(dedupKey, {
          name: person.name,
          name_normalized: nameNorm,
          role: person.role || '',
          organization: person.organization || '',
          company_normalized_name: companyNorm,
          source_article_id: article.article_id,
        });
      }
    }
  }

  // ── Upsert companies ──
  let companiesUpserted = 0;
  if (companyAgg.size > 0) {
    const rows = Array.from(companyAgg.entries()).map(([norm, entry]) => ({
      normalized_name: norm,
      display_name: entry.display_name,
      types: JSON.stringify(Array.from(entry.types)),
      countries: JSON.stringify(Array.from(entry.countries)),
      industries: JSON.stringify(Array.from(entry.industries)),
      signal_types: JSON.stringify(Array.from(entry.signal_types)),
      mention_count: entry.article_ids.size,
      first_seen_at: now,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
    }));

    // Upsert in batches of 50
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error } = await db.from('discovered_companies').upsert(batch, {
        onConflict: 'normalized_name',
        ignoreDuplicates: false,
      });
      if (error) {
        console.error('[db] upsertDiscoveredCompanies batch failed:', error.message);
      } else {
        companiesUpserted += batch.length;
      }
    }

    // For existing rows: merge arrays and update counts via RPC or manual update
    // Supabase upsert overwrites — so we need to merge with existing data
    for (const [norm, entry] of companyAgg) {
      const { data: existing } = await db.from('discovered_companies')
        .select('types, countries, industries, signal_types, mention_count, first_seen_at')
        .eq('normalized_name', norm)
        .single();

      if (existing) {
        const mergedTypes = Array.from(new Set([...(existing.types as string[] || []), ...entry.types]));
        const mergedCountries = Array.from(new Set([...(existing.countries as string[] || []), ...entry.countries]));
        const mergedIndustries = Array.from(new Set([...(existing.industries as string[] || []), ...entry.industries]));
        const mergedSignals = Array.from(new Set([...(existing.signal_types as string[] || []), ...entry.signal_types]));
        const mergedCount = Math.max(existing.mention_count ?? 0, entry.article_ids.size);

        await db.from('discovered_companies')
          .update({
            types: mergedTypes,
            countries: mergedCountries,
            industries: mergedIndustries,
            signal_types: mergedSignals,
            mention_count: mergedCount,
            last_seen_at: now,
            updated_at: now,
          })
          .eq('normalized_name', norm);
      }
    }
  }

  // ── Upsert contacts ──
  let contactsUpserted = 0;
  if (contactAgg.size > 0) {
    const contactRows = Array.from(contactAgg.values()).map(c => ({
      company_normalized_name: c.company_normalized_name,
      name: c.name,
      name_normalized: c.name_normalized,
      role: c.role,
      organization: c.organization,
      source_article_id: c.source_article_id,
      enriched_by: 'scoring',
      created_at: now,
      updated_at: now,
    }));

    // Insert contacts, skip on conflict (same name + same company)
    for (let i = 0; i < contactRows.length; i += 50) {
      const batch = contactRows.slice(i, i + 50);
      const { error } = await db.from('discovered_contacts').upsert(batch, {
        onConflict: 'name_normalized,company_normalized_name',
        ignoreDuplicates: true,
      });
      if (error) {
        // Partial index conflicts may cause errors for null company — insert one by one
        for (const row of batch) {
          const { error: singleErr } = await db.from('discovered_contacts').upsert(row, {
            onConflict: 'name_normalized,company_normalized_name',
            ignoreDuplicates: true,
          });
          if (!singleErr) contactsUpserted++;
        }
      } else {
        contactsUpserted += batch.length;
      }
    }
  }

  return { companiesUpserted, contactsUpserted };
}

/** Load all discovered companies for hitlist overlay */
export async function loadDiscoveredCompanies(): Promise<DiscoveredCompanyRow[]> {
  const db = requireSupabase();
  const { data, error } = await db.from('discovered_companies')
    .select('*')
    .order('mention_count', { ascending: false });

  if (error) throw new Error(`[db] loadDiscoveredCompanies failed: ${error.message}`);
  return (data ?? []) as DiscoveredCompanyRow[];
}

/** Bulk update website/linkedin for discovered companies (Comet enrichment) */
export async function enrichDiscoveredCompanies(
  entries: Array<{ name: string; website?: string; linkedin?: string }>,
): Promise<{ updated: number; not_found: number }> {
  const db = requireSupabase();
  const now = new Date().toISOString();
  let updated = 0;
  let not_found = 0;

  for (const entry of entries) {
    const norm = normalizeCompanyName(entry.name);
    if (!norm) { not_found++; continue; }

    const updateFields: Record<string, unknown> = {
      enriched_at: now,
      enriched_by: 'comet',
      updated_at: now,
    };
    if (entry.website) updateFields.website = entry.website;
    if (entry.linkedin) updateFields.linkedin = entry.linkedin;

    const { data, error } = await db.from('discovered_companies')
      .update(updateFields)
      .eq('normalized_name', norm)
      .select('normalized_name');

    if (error || !data || data.length === 0) {
      not_found++;
    } else {
      updated++;
    }
  }

  return { updated, not_found };
}
