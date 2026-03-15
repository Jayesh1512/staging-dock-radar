import { NextResponse } from 'next/server';
import { llmComplete, getActiveLLMInfo } from '@/lib/llm';
import { SCORING_SYSTEM_PROMPT, formatBatchScoringPrompt } from '@/lib/scoring-prompt';
import { fetchArticleBody } from '@/lib/article-body';
import { insertScoredArticles, updateArticleResolvedUrl, loadScoredByArticleIds } from '@/lib/db';
import { gateTwoDedup } from '@/lib/dedup';
import { articleMatchesRegions } from '@/lib/utils';
import type { Article, ScoredArticle, ArticleWithScore, SignalType } from '@/lib/types';

/** Strip markdown code fences that some LLMs add even when told not to */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return fenced ? fenced[1].trim() : text.trim();
}

const VALID_SIGNAL_TYPES: SignalType[] = [
  'DEPLOYMENT', 'CONTRACT', 'TENDER', 'PARTNERSHIP',
  'EXPANSION', 'FUNDING', 'REGULATION', 'OTHER',
];

function parseToScoredArticle(articleId: string, raw: Record<string, unknown>): ScoredArticle {
  const signalType = VALID_SIGNAL_TYPES.includes(raw.signal_type as SignalType)
    ? (raw.signal_type as SignalType)
    : 'OTHER';

  return {
    id: `scored_${articleId}_${Date.now()}`,
    article_id: articleId,
    relevance_score: typeof raw.relevance_score === 'number'
      ? Math.max(0, Math.min(100, Math.round(raw.relevance_score)))
      : 0,
    company: typeof raw.company === 'string' ? raw.company : null,
    country: typeof raw.country === 'string' ? raw.country : null,
    city: typeof raw.city === 'string' ? raw.city : null,
    use_case: typeof raw.use_case === 'string' ? raw.use_case : null,
    signal_type: signalType,
    summary: typeof raw.summary === 'string' ? raw.summary : null,
    flytbase_mentioned: raw.flytbase_mentioned === true,
    persons: Array.isArray(raw.persons) ? raw.persons : [],
    entities: Array.isArray(raw.entities) ? raw.entities : [],
    drop_reason: typeof raw.drop_reason === 'string' ? raw.drop_reason : null,
    is_duplicate: false,
    status: 'new',
    actions_taken: [],
    reviewed_at: null,
    dismissed_at: null,
    slack_sent_at: null,
    created_at: new Date().toISOString(),
  };
}

function parseBatchResponse(raw: string, articles: Article[]): ArticleWithScore[] {
  const json = extractJson(raw);
  let arr: Record<string, unknown>[];

  try {
    const parsed = JSON.parse(json);
    arr = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    console.error('[/api/score] Batch JSON parse failed, applying fallback for all articles');
    return articles.map((article) => ({
      article,
      scored: parseToScoredArticle(article.id, {
        relevance_score: 0,
        drop_reason: 'LLM response could not be parsed',
      }),
    }));
  }

  // Match by article id for robustness; fall back to positional index
  const byId = new Map(arr.map((item) => [item.id as string, item]));

  return articles.map((article, i) => {
    const rawItem = byId.get(article.id) ?? arr[i] ?? {};
    const scored = parseToScoredArticle(article.id, rawItem);
    return { article, scored };
  });
}

export async function POST(req: Request) {
  try {
    const { articles, selectedRegions = [] } = await req.json() as { articles: Article[]; selectedRegions?: string[] };

    if (!Array.isArray(articles) || articles.length === 0) {
      return NextResponse.json({ error: 'Non-empty articles array is required' }, { status: 400 });
    }

    const MAX_BATCH = 30;
    if (articles.length > MAX_BATCH) {
      return NextResponse.json(
        { error: `Batch too large: ${articles.length} articles (max ${MAX_BATCH}). Reduce maxArticles in Step 1.` },
        { status: 400 },
      );
    }

    const { provider, model } = getActiveLLMInfo();

    // ── D4: Scoring cache — skip LLM for articles already scored ────────────
    let cachedMap: Map<string, ScoredArticle> = new Map();
    try {
      cachedMap = await loadScoredByArticleIds(articles.map(a => a.id));
    } catch (cacheErr) {
      // Cache miss is non-fatal — just score everything
      console.warn('[/api/score] Cache lookup failed (non-fatal):', cacheErr instanceof Error ? cacheErr.message : cacheErr);
    }

    const toScore = articles.filter(a => !cachedMap.has(a.id));
    const cached = articles.filter(a => cachedMap.has(a.id));
    if (cached.length > 0) console.log(`[/api/score] D4 cache: ${cached.length} hits, ${toScore.length} to score`);

    // Fetch article bodies for uncached articles only (no LLM cost)
    console.log(`[/api/score] Fetching bodies for ${toScore.length} articles...`);
    const bodyResults = toScore.length > 0
      ? await Promise.all(toScore.map((a) => fetchArticleBody(a.url)))
      : [];
    const fetchedCount = bodyResults.filter(r => r.text).length;
    const resolvedCount = bodyResults.filter((r, i) => r.resolvedUrl !== toScore[i]?.url).length;
    if (toScore.length > 0) console.log(`[/api/score] Bodies fetched: ${fetchedCount}/${toScore.length}, URLs resolved: ${resolvedCount}`);

    // LLM scoring — only for uncached articles
    let llmResults: ArticleWithScore[] = [];
    if (toScore.length > 0) {
      const bodies = bodyResults.map(r => r.text);
      const rawText = await llmComplete(SCORING_SYSTEM_PROMPT, formatBatchScoringPrompt(toScore, bodies));
      llmResults = parseBatchResponse(rawText, toScore);

      // Enrich with resolved URLs
      llmResults = llmResults.map((r, i) => {
        const resolvedUrl = bodyResults[i]?.resolvedUrl;
        if (!resolvedUrl || resolvedUrl === r.article.url) return r;
        return { ...r, article: { ...r.article, resolved_url: resolvedUrl } };
      });
    }

    // Restore cached results — clear filter fields so they're recalculated below
    const cachedResults: ArticleWithScore[] = cached.map(a => ({
      article: a,
      scored: { ...cachedMap.get(a.id)!, drop_reason: null, is_duplicate: false },
    }));

    const allResults = [...cachedResults, ...llmResults];

    // Gate 3: Region filter — use LLM-extracted country (authoritative), not RSS edition.
    // Google News RSS gl/ceid are localization params, not geographic filters.
    const regionFiltered = selectedRegions.length > 0
      ? allResults.map((r) => {
          if (articleMatchesRegions(r.scored.country, selectedRegions)) return r;
          return {
            ...r,
            scored: {
              ...r.scored,
              drop_reason: `Outside selected regions (${r.scored.country ?? 'unknown country'})`,
            },
          };
        })
      : allResults;

    const regionDropped = regionFiltered.filter(r => r.scored.drop_reason?.startsWith('Outside selected regions')).length;
    if (regionDropped > 0) console.log(`[/api/score] Region filter: ${regionDropped} articles dropped (outside selected regions)`);

    // Gate 4: Post-scoring semantic dedup — marks lower-scored duplicates.
    // Runs server-side so is_duplicate flags are persisted correctly to DB.
    const dedupedResults = gateTwoDedup(regionFiltered);
    const dupCount = dedupedResults.filter(r => r.scored.is_duplicate).length;
    if (dupCount > 0) console.log(`[/api/score] Gate 2 dedup: ${dupCount} semantic duplicates marked`);

    dedupedResults.forEach((r) => {
      const cacheTag = cachedMap.has(r.article.id) ? ' [CACHED]' : '';
      console.log(`[/api/score] ${provider}/${model} → "${r.article.title.slice(0, 60)}" score=${r.scored.relevance_score}${r.scored.is_duplicate ? ' [DUP]' : ''}${cacheTag}`);
    });

    // ── Persist to Supabase ──────────────────────────────────────────────────
    try {
      // Upsert all results — updates drop_reason/is_duplicate for cached articles
      await insertScoredArticles(dedupedResults.map(r => r.scored));

      // Update resolved URLs for newly scored articles only
      const urlUpdates = llmResults
        .filter(r => r.article.resolved_url && r.article.resolved_url !== r.article.url)
        .map(r => updateArticleResolvedUrl(r.article.id, r.article.resolved_url!));
      if (urlUpdates.length > 0) await Promise.all(urlUpdates);

      console.log(`[/api/score] DB: ${dedupedResults.length} scored articles persisted (${cached.length} from cache)`);
    } catch (dbErr) {
      // DB write failure is non-fatal — data still returned to client
      console.error('[/api/score] DB write failed (non-fatal):', dbErr instanceof Error ? dbErr.message : dbErr);
    }

    return NextResponse.json({ results: dedupedResults, provider, model });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scoring error';
    console.error('[/api/score]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
