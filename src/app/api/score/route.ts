import { NextResponse } from 'next/server';
import { llmComplete, getActiveLLMInfo } from '@/lib/llm';
import {
  SCORING_SYSTEM_PROMPT,
  LINKEDIN_SCORING_SYSTEM_PROMPT,
  CAMPAIGN_SCORING_SYSTEM_PROMPT,
  LINKEDIN_CAMPAIGN_SCORING_SYSTEM_PROMPT,
  formatBatchScoringPrompt,
  formatLinkedInBatchScoringPrompt,
} from '@/lib/scoring-prompt';
import { fetchArticleBody } from '@/lib/article-body';
import { insertScoredArticles, updateArticleResolvedUrl, loadScoredByArticleIds, loadDedupKeysFromScoredArticles, loadEverQueuedArticleIds, markArticlesAsEverQueued } from '@/lib/db';
import { gateTwoDedup } from '@/lib/dedup';
import { urlFingerprint, dedupKey } from '@/lib/url-fingerprint';
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
    industry: typeof raw.industry === 'string' ? raw.industry : null,
    is_duplicate: false,
    status: 'new',
    actions_taken: [],
    reviewed_at: null,
    dismissed_at: null,
    slack_sent_at: null,
    enriched_at: null,
    created_at: new Date().toISOString(),
  };
}

function parseBatchResponse(raw: string, articles: Article[]): ArticleWithScore[] {
  const json = extractJson(raw);
  let arr: Record<string, unknown>[];

  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      arr = parsed;
    } else if (typeof parsed === 'object' && parsed !== null) {
      // OpenAI json_object mode wraps arrays in an object like {"results": [...]}
      // Find the first array value and use it
      const arrayVal = Object.values(parsed).find((v) => Array.isArray(v)) as Record<string, unknown>[] | undefined;
      arr = arrayVal ?? [parsed];
    } else {
      arr = [parsed];
    }
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

  // Truncation detection: LLM returned fewer items than expected
  if (arr.length < articles.length) {
    console.warn(`[/api/score] LLM truncation detected: expected ${articles.length} items, got ${arr.length}. Scoring in smaller batches may help.`);
  }

  // Match by article id for robustness; fall back to positional index
  const byId = new Map(arr.map((item) => [item.id as string, item]));

  return articles.map((article, i) => {
    const rawItem = byId.get(article.id) ?? arr[i] ?? {};
    const scored = parseToScoredArticle(article.id, rawItem);
    return { article, scored };
  });
}

/** Build exclude keywords: request body wins, else env EXCLUDE_TITLE_KEYWORDS (comma-separated) */
function getExcludeTitleKeywords(body: { excludeTitleKeywords?: string[] }): string[] {
  if (Array.isArray(body.excludeTitleKeywords) && body.excludeTitleKeywords.length > 0) {
    return body.excludeTitleKeywords.map((s) => String(s).trim()).filter(Boolean);
  }
  const env = process.env.EXCLUDE_TITLE_KEYWORDS;
  if (!env || typeof env !== 'string') return [];
  return env.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Articles whose title contains any of the keywords (case-insensitive) are excluded from Step 2. */
function filterExcludedByTitle(articles: Article[], excludeKeywords: string[]): { included: Article[]; excluded: Article[] } {
  if (excludeKeywords.length === 0) return { included: articles, excluded: [] };
  const lower = excludeKeywords.map((k) => k.toLowerCase());
  const included: Article[] = [];
  const excluded: Article[] = [];
  for (const a of articles) {
    const titleLower = a.title.toLowerCase();
    if (lower.some((kw) => titleLower.includes(kw))) excluded.push(a);
    else included.push(a);
  }
  return { included, excluded };
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { articles: Article[]; selectedRegions?: string[]; excludeTitleKeywords?: string[]; minScore?: number; campaign?: string };
    const { articles: rawArticles, minScore = 0, campaign } = body;
    const isCampaign = !!campaign;

    if (!Array.isArray(rawArticles) || rawArticles.length === 0) {
      return NextResponse.json({ error: 'Non-empty articles array is required' }, { status: 400 });
    }

    const MAX_BATCH = 50;
    if (rawArticles.length > MAX_BATCH) {
      return NextResponse.json(
        { error: `Batch too large: ${rawArticles.length} articles sent but the scoring limit is ${MAX_BATCH}. This is a configuration mismatch — MAX_BATCH in score/route.ts must equal DEFAULTS.maxArticles in constants.ts. Update both values together.` },
        { status: 400 },
      );
    }

    // ── Pre-score filter: exclude articles by title keywords (never proceed to scoring) ───
    const excludeKeywords = getExcludeTitleKeywords(body);
    const { included: articles, excluded: excludedArticles } = filterExcludedByTitle(rawArticles, excludeKeywords);
    if (excludedArticles.length > 0) {
      console.log(`[/api/score] Pre-score filter: ${excludedArticles.length} articles excluded (title matches exclude list), ${articles.length} to process`);
      excludedArticles.forEach((a) => console.log(`  excluded: "${a.title.slice(0, 60)}"`));
    }
    if (articles.length === 0) {
      return NextResponse.json({
        results: [],
        provider: '',
        model: '',
        excludedCount: excludedArticles.length,
        excludedIds: excludedArticles.map((a) => a.id),
        message: `All ${rawArticles.length} articles were excluded by title filter. None scored.`,
      });
    }

    // ── Ever-queued gate: skip articles already in Step 3 from a previous run ────
    // Once an article reaches the queue, re-scoring it wastes LLM calls and creates duplicates.
    let everQueuedIds = new Set<string>();
    try {
      everQueuedIds = await loadEverQueuedArticleIds(articles.map(a => a.id));
    } catch (eqErr) {
      console.warn('[/api/score] ever_queued lookup failed (non-fatal):', eqErr instanceof Error ? eqErr.message : eqErr);
    }
    const everQueuedArticles = articles.filter(a => everQueuedIds.has(a.id));
    const articlesToProcess = articles.filter(a => !everQueuedIds.has(a.id));
    if (everQueuedArticles.length > 0) {
      console.log(`[/api/score] ever_queued gate: ${everQueuedArticles.length} articles skipped (already reached queue in a prior run), ${articlesToProcess.length} to process`);
      everQueuedArticles.forEach(a => console.log(`  ever-queued skip: "${a.title.slice(0, 60)}"`));
    }
    if (articlesToProcess.length === 0 && excludedArticles.length === 0) {
      return NextResponse.json({
        results: [],
        provider: '',
        model: '',
        excludedCount: excludedArticles.length,
        excludedIds: excludedArticles.map(a => a.id),
        message: `All ${rawArticles.length} articles were already in the queue from a previous run. Nothing to score.`,
      });
    }

    // ── URL fingerprint + entities dedup: skip scoring if this URL fingerprint already exists in scored_articles ───
    let dedupKeys = { existingUrlFingerprints: new Set<string>(), existingDedupKeys: new Set<string>() };
    try {
      dedupKeys = await loadDedupKeysFromScoredArticles();
    } catch (urlErr) {
      console.warn('[/api/score] Dedup keys lookup failed (non-fatal):', urlErr instanceof Error ? urlErr.message : urlErr);
    }
    const urlDedup = articlesToProcess.filter((a) => dedupKeys.existingUrlFingerprints.has(urlFingerprint(a.url)));
    const articlesForPipeline = articlesToProcess.filter((a) => !dedupKeys.existingUrlFingerprints.has(urlFingerprint(a.url)));
    if (urlDedup.length > 0) {
      console.log(`[/api/score] URL fingerprint dedup: ${urlDedup.length} articles skipped (URL params already in scored_articles), ${articlesForPipeline.length} to process`);
      urlDedup.forEach((a) => console.log(`  url-dedup: "${a.title.slice(0, 50)}"`));
    }

    // ── Protect existing real scores from URL-dedup overwrite ────────────────
    // If a URL-dedup article already has a real scored record (prior LLM score),
    // do NOT overwrite it with a zero-score placeholder. Only write placeholders
    // for articles that have never been scored before.
    let urlDedupExistingScores: Map<string, ScoredArticle> = new Map();
    if (urlDedup.length > 0) {
      try {
        urlDedupExistingScores = await loadScoredByArticleIds(urlDedup.map(a => a.id));
        const preserved = [...urlDedupExistingScores.keys()];
        if (preserved.length > 0) console.log(`[/api/score] URL-dedup: ${preserved.length} articles have existing scores — preserving, skipping overwrite`);
      } catch (e) {
        console.warn('[/api/score] URL-dedup existing score lookup failed (non-fatal):', e);
      }
    }
    // urlDedupNew → no prior score → write a placeholder
    // urlDedupPreserved → already have a real score → return existing record unchanged
    const urlDedupNew = urlDedup.filter(a => !urlDedupExistingScores.has(a.id));
    const urlDedupPreserved = urlDedup.filter(a => urlDedupExistingScores.has(a.id));

    if (articlesForPipeline.length === 0) {
      const urlDedupScored: ScoredArticle[] = urlDedupNew.map((a) => ({
        id: `scored_${a.id}_${Date.now()}`,
        article_id: a.id,
        normalized_url: a.normalized_url,
        url_fingerprint: urlFingerprint(a.url),
        relevance_score: 0,
        company: null,
        country: null,
        city: null,
        use_case: null,
        signal_type: 'OTHER' as const,
        summary: null,
        flytbase_mentioned: false,
        persons: [],
        entities: [],
        drop_reason: 'Already captured in a previous run',
        is_duplicate: true,
        status: 'new' as const,
        actions_taken: [],
        reviewed_at: null,
        dismissed_at: null,
        slack_sent_at: null,
        enriched_at: null,
        created_at: new Date().toISOString(),
      }));
      try {
        if (urlDedupScored.length > 0) await insertScoredArticles(urlDedupScored);
      } catch (e) {
        console.error('[/api/score] DB write url-dedup failed (non-fatal):', e);
      }
      const preservedResults: ArticleWithScore[] = urlDedupPreserved.map(a => ({
        article: a,
        scored: urlDedupExistingScores.get(a.id)!,
      }));
      return NextResponse.json({
        results: [
          ...urlDedupNew.map((a) => ({ article: a, scored: urlDedupScored.find((s) => s.article_id === a.id)! })),
          ...preservedResults,
        ],
        provider: '',
        model: '',
        excludedCount: excludedArticles.length,
        excludedIds: excludedArticles.map((a) => a.id),
        message: `All ${articles.length} articles were URL dedup (already scored). None scored.`,
      });
    }

    const { provider, model } = getActiveLLMInfo();

    // ── D4: Scoring cache — skip LLM for articles already scored ────────────
    let cachedMap: Map<string, ScoredArticle> = new Map();
    try {
      cachedMap = await loadScoredByArticleIds(articlesForPipeline.map(a => a.id));
    } catch (cacheErr) {
      // Cache miss is non-fatal — just score everything
      console.warn('[/api/score] Cache lookup failed (non-fatal):', cacheErr instanceof Error ? cacheErr.message : cacheErr);
    }

    const toScore = articlesForPipeline.filter(a => !cachedMap.has(a.id));
    const cached = articlesForPipeline.filter(a => cachedMap.has(a.id));
    if (cached.length > 0) console.log(`[/api/score] D4 cache: ${cached.length} hits, ${toScore.length} to score`);

    // Fetch article bodies for uncached articles only (no LLM cost)
    console.log(`[/api/score] Fetching bodies for ${toScore.length} articles...`);
    const bodyResults = toScore.length > 0
      ? await Promise.all(toScore.map((a) => {
          // LinkedIn: we already captured post content in snippet during collection.
          // Provide it as "body" to the LLM prompt (helps scoring without extra fetch).
          if (a.source === 'linkedin') return Promise.resolve({ text: a.snippet ?? '', resolvedUrl: a.url });
          return fetchArticleBody(a.url, a.source);
        }))
      : [];
    const skippedLinkedIn = toScore.filter(a => a.source === 'linkedin').length;
    const fetchedCount = bodyResults.filter(r => r.text).length;
    const resolvedCount = bodyResults.filter((r, i) => r.resolvedUrl !== toScore[i]?.url).length;
    if (toScore.length > 0) console.log(`[/api/score] Bodies: ${fetchedCount} fetched, ${skippedLinkedIn} LinkedIn skipped, ${resolvedCount} URLs resolved`);

    // LLM scoring — only for uncached articles
    let llmResults: ArticleWithScore[] = [];
    if (toScore.length > 0) {
      const bodies = bodyResults.map(r => r.text);

      // Build resolved URL map by article id (robust even when we split batches)
      const resolvedUrlById = new Map<string, string>();
      for (let i = 0; i < toScore.length; i++) {
        const a = toScore[i];
        const resolvedUrl = bodyResults[i]?.resolvedUrl;
        if (resolvedUrl) resolvedUrlById.set(a.id, resolvedUrl);
      }

      // Split: LinkedIn posts vs all other sources (Google News/NewsAPI/etc)
      const liArticles: Article[] = [];
      const liBodies: string[] = [];
      const otherArticles: Article[] = [];
      const otherBodies: string[] = [];

      for (let i = 0; i < toScore.length; i++) {
        const a = toScore[i];
        const b = bodies[i] ?? '';
        if (a.source === 'linkedin') {
          liArticles.push(a);
          liBodies.push(b);
        } else {
          otherArticles.push(a);
          otherBodies.push(b);
        }
      }

      const results: ArticleWithScore[] = [];

      if (liArticles.length > 0) {
        const systemPrompt = isCampaign ? LINKEDIN_CAMPAIGN_SCORING_SYSTEM_PROMPT : LINKEDIN_SCORING_SYSTEM_PROMPT;
        const userPrompt = formatLinkedInBatchScoringPrompt(liArticles, liBodies, isCampaign);
        const rawText = await llmComplete(systemPrompt, userPrompt);
        results.push(...parseBatchResponse(rawText, liArticles));
      }

      if (otherArticles.length > 0) {
        const systemPrompt = isCampaign ? CAMPAIGN_SCORING_SYSTEM_PROMPT : SCORING_SYSTEM_PROMPT;
        const userPrompt = formatBatchScoringPrompt(otherArticles, otherBodies, isCampaign);
        const rawText = await llmComplete(systemPrompt, userPrompt);
        results.push(...parseBatchResponse(rawText, otherArticles));
      }

      // Enrich with resolved URLs
      llmResults = results.map((r) => {
        const resolvedUrl = resolvedUrlById.get(r.article.id);
        if (!resolvedUrl || resolvedUrl === r.article.url) return r;
        return { ...r, article: { ...r.article, resolved_url: resolvedUrl } };
      });
    }

    // Restore cached results — set url_fingerprint + normalized_url for persist and dedup
    const cachedResults: ArticleWithScore[] = cached.map(a => ({
      article: a,
      scored: {
        ...cachedMap.get(a.id)!,
        normalized_url: a.normalized_url,
        url_fingerprint: urlFingerprint(a.url),
        drop_reason: null,
        is_duplicate: false,
      },
    }));

    const llmResultsWithUrl = llmResults.map(r => ({
      ...r,
      scored: {
        ...r.scored,
        normalized_url: r.article.normalized_url,
        url_fingerprint: urlFingerprint(r.article.url),
      },
    }));

    const allResults = [...cachedResults, ...llmResultsWithUrl];

    // Mark duplicates by URL fingerprint + entities (company, country, city): same story if same URL params and same entities
    const dedupKeysMutable = new Set(dedupKeys.existingDedupKeys);
    const allResultsWithDedup = allResults.map((r) => {
      const key = dedupKey(
        r.scored.url_fingerprint ?? urlFingerprint(r.article.url),
        r.scored.company,
        r.scored.country,
        r.scored.city,
      );
      const alreadySeen = dedupKeysMutable.has(key);
      if (alreadySeen) {
        dedupKeysMutable.add(key);
        return {
          ...r,
          scored: {
            ...r.scored,
            is_duplicate: true,
            drop_reason: r.scored.drop_reason ?? 'Same story already captured from this company',
          },
        };
      }
      dedupKeysMutable.add(key);
      return r;
    });

    // Gate 4: Post-scoring semantic dedup — marks lower-scored duplicates.
    // Runs server-side so is_duplicate flags are persisted correctly to DB.
    const dedupedResults = gateTwoDedup(allResultsWithDedup);
    const dupCount = dedupedResults.filter(r => r.scored.is_duplicate).length;
    if (dupCount > 0) console.log(`[/api/score] Gate 2 dedup: ${dupCount} semantic duplicates marked`);

    // ── R8: Freshness boost — articles published within 24h receive +10 relevance points ─
    // Applied before ever_queued marking so the boosted score drives queue eligibility.
    // Only boosts non-dropped, non-duplicate articles with base score >= freshnessBoostMinScore.
    // Cached articles get the boost too — giving borderline articles a second-chance window.
    const FRESHNESS_BOOST_POINTS = 10;
    const FRESHNESS_BOOST_MIN_SCORE = 25;
    const FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000;
    const runTime = Date.now();
    const freshnessResults = dedupedResults.map(r => {
      if (r.scored.drop_reason || r.scored.is_duplicate) return r;
      if (r.scored.relevance_score < FRESHNESS_BOOST_MIN_SCORE) return r;
      if (!r.article.published_at) return r;
      const publishedAt = new Date(r.article.published_at).getTime();
      if (runTime - publishedAt > FRESHNESS_WINDOW_MS) return r;
      return {
        ...r,
        scored: {
          ...r.scored,
          relevance_score: Math.min(100, r.scored.relevance_score + FRESHNESS_BOOST_POINTS),
        },
      };
    });
    const freshCount = freshnessResults.filter((r, i) => r.scored.relevance_score !== dedupedResults[i].scored.relevance_score).length;
    if (freshCount > 0) console.log(`[/api/score] Freshness boost: ${freshCount} articles boosted +${FRESHNESS_BOOST_POINTS} points (published within 24h)`);

    freshnessResults.forEach((r) => {
      const cacheTag = cachedMap.has(r.article.id) ? ' [CACHED]' : '';
      console.log(`[/api/score] ${provider}/${model} → "${r.article.title.slice(0, 60)}" score=${r.scored.relevance_score}${r.scored.is_duplicate ? ' [DUP]' : ''}${cacheTag}`);
    });

    // ── Mark newly queue-eligible articles as ever_queued ────────────────────
    // An article is queue-eligible if: score >= minScore AND no drop_reason AND not a duplicate.
    // We mark them now so future runs skip them entirely, preventing duplicate queue entries.
    const newlyEligibleIds = freshnessResults
      .filter(r => !r.scored.drop_reason && !r.scored.is_duplicate && r.scored.relevance_score >= minScore)
      .map(r => r.article.id);
    if (newlyEligibleIds.length > 0) {
      try {
        await markArticlesAsEverQueued(newlyEligibleIds);
        console.log(`[/api/score] Marked ${newlyEligibleIds.length} articles as ever_queued (score >= ${minScore}, no drop)`);
      } catch (eqErr) {
        console.error('[/api/score] markArticlesAsEverQueued failed (non-fatal):', eqErr instanceof Error ? eqErr.message : eqErr);
      }
    }

    // ── Persist to Supabase ──────────────────────────────────────────────────
    // Only write placeholder records for URL-dedup articles that have no prior real score.
    const urlDedupScored: ScoredArticle[] = urlDedupNew.map((a) => ({
      id: `scored_${a.id}_${Date.now()}`,
      article_id: a.id,
      normalized_url: a.normalized_url,
      url_fingerprint: urlFingerprint(a.url),
      relevance_score: 0,
      company: null,
      country: null,
      city: null,
      use_case: null,
      signal_type: 'OTHER' as const,
      summary: null,
      flytbase_mentioned: false,
      persons: [],
      entities: [],
      drop_reason: 'Already captured in a previous run',
      is_duplicate: true,
      status: 'new' as const,
      actions_taken: [],
      reviewed_at: null,
      dismissed_at: null,
      slack_sent_at: null,
      enriched_at: null,
      created_at: new Date().toISOString(),
    }));

    try {
      // Upsert pipeline results + new url-dedup placeholders only (preserved scores untouched)
      await insertScoredArticles([
        ...freshnessResults.map(r => r.scored),
        ...urlDedupScored,
      ]);

      // Update resolved URLs for newly scored articles only
      const urlUpdates = llmResults
        .filter(r => r.article.resolved_url && r.article.resolved_url !== r.article.url)
        .map(r => updateArticleResolvedUrl(r.article.id, r.article.resolved_url!));
      if (urlUpdates.length > 0) await Promise.all(urlUpdates);

      console.log(`[/api/score] DB: ${freshnessResults.length} scored + ${urlDedupScored.length} url-dedup placeholders + ${urlDedupPreserved.length} preserved (${cached.length} from cache)`);
    } catch (dbErr) {
      // DB write failure is non-fatal — data still returned to client
      console.error('[/api/score] DB write failed (non-fatal):', dbErr instanceof Error ? dbErr.message : dbErr);
    }

    const urlDedupResults: ArticleWithScore[] = [
      ...urlDedupNew.map((a) => ({ article: a, scored: urlDedupScored.find((s) => s.article_id === a.id)! })),
      ...urlDedupPreserved.map((a) => ({ article: a, scored: urlDedupExistingScores.get(a.id)! })),
    ];

    return NextResponse.json({
      results: [...freshnessResults, ...urlDedupResults],
      provider,
      model,
      excludedCount: excludedArticles.length,
      excludedIds: excludedArticles.map((a) => a.id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scoring error';
    console.error('[/api/score]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
