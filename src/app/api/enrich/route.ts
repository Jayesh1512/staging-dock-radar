import { NextResponse } from 'next/server';
import { llmComplete } from '@/lib/llm';
import { ENRICHMENT_SYSTEM_PROMPT, formatEnrichmentPrompt } from '@/lib/enrichment-prompt';
import { fetchArticleBody } from '@/lib/article-body';
import { updateEnrichedScoredArticle, requireSupabase } from '@/lib/db';
import type { Article, Person, Entity } from '@/lib/types';

export async function POST(req: Request) {
  try {
    const { articleId, url, article } = await req.json() as {
      articleId: string;
      url: string;
      article: Article;
    };

    if (!articleId || !url) {
      return NextResponse.json({ error: 'articleId and url are required' }, { status: 400 });
    }

    // ── Cache check: if already enriched, return existing data without LLM call ──
    const db = requireSupabase();
    const { data: existing } = await db
      .from('scored_articles')
      .select('persons, entities, enriched_at')
      .eq('article_id', articleId)
      .single();

    if (existing?.enriched_at) {
      console.log(`[/api/enrich] Cache hit for article ${articleId} (enriched at ${existing.enriched_at})`);
      return NextResponse.json({
        persons: existing.persons ?? [],
        entities: existing.entities ?? [],
        enriched_at: existing.enriched_at,
        cached: true,
      });
    }

    // ── Fetch full article body (no word limit) ──────────────────────────────
    console.log(`[/api/enrich] Fetching full body for ${url}`);
    const { text: body } = await fetchArticleBody(url, article?.source, 0);

    // ── LLM extraction ───────────────────────────────────────────────────────
    const userPrompt = formatEnrichmentPrompt(article, body);
    const raw = await llmComplete(ENRICHMENT_SYSTEM_PROMPT, userPrompt);

    // ── Parse response ───────────────────────────────────────────────────────
    let persons: Person[] = [];
    let entities: Entity[] = [];

    try {
      const parsed = JSON.parse(raw) as { persons?: Person[]; entities?: Entity[] };
      persons = Array.isArray(parsed.persons) ? parsed.persons : [];
      entities = Array.isArray(parsed.entities) ? parsed.entities : [];
    } catch {
      console.warn('[/api/enrich] Failed to parse LLM response:', raw?.slice(0, 200));
      // Return empty rather than error — partial failure is acceptable
    }

    console.log(`[/api/enrich] Extracted ${persons.length} persons, ${entities.length} entities for ${articleId}`);

    // ── Persist to DB ────────────────────────────────────────────────────────
    const enriched_at = new Date().toISOString();
    try {
      await updateEnrichedScoredArticle(articleId, persons, entities);
    } catch (dbErr) {
      console.error('[/api/enrich] DB update failed (non-fatal):', dbErr);
    }

    return NextResponse.json({ persons, entities, enriched_at, cached: false });
  } catch (err) {
    console.error('[/api/enrich] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Enrichment failed' },
      { status: 500 },
    );
  }
}
