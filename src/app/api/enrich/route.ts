import { NextResponse } from 'next/server';
import { llmComplete } from '@/lib/llm';
import { ENRICHMENT_SYSTEM_PROMPT, formatEnrichmentPrompt } from '@/lib/enrichment-prompt';
import { fetchArticleBody } from '@/lib/article-body';
import { updateEnrichedScoredArticle, requireSupabase } from '@/lib/db';
import type { Article, Person, Entity } from '@/lib/types';

function norm(s: unknown): string {
  return String(s ?? '').trim().toLowerCase();
}

function mergePersons(base: Person[], incoming: Person[]): Person[] {
  const out: Person[] = [];
  const seen = new Set<string>();
  const add = (p: Person) => {
    const key = `${norm(p.name)}|${norm(p.organization)}|${norm((p as any).linkedin_url)}`;
    if (!norm(p.name)) return;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(p);
  };
  for (const p of base) add(p);
  for (const p of incoming) {
    // If we already have same person/org, prefer to keep linkedin_url if new has it
    const keyNoLinkedIn = `${norm(p.name)}|${norm(p.organization)}|`;
    const existingIdx = out.findIndex((x) => `${norm(x.name)}|${norm(x.organization)}|` === keyNoLinkedIn);
    if (existingIdx >= 0) {
      const existing = out[existingIdx];
      const existingLinkedIn = (existing as any).linkedin_url;
      const incomingLinkedIn = (p as any).linkedin_url;
      out[existingIdx] = {
        ...existing,
        role: existing.role || p.role,
        organization: existing.organization || p.organization,
        ...(incomingLinkedIn && !existingLinkedIn ? { linkedin_url: incomingLinkedIn } : {}),
      };
      continue;
    }
    add(p);
  }
  return out;
}

function mergeEntities(base: Entity[], incoming: Entity[]): Entity[] {
  const out: Entity[] = [];
  const seen = new Set<string>();
  const add = (e: Entity) => {
    const key = `${norm(e.name)}|${norm(e.type)}|${norm((e as any).linkedin_url)}`;
    if (!norm(e.name)) return;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(e);
  };
  for (const e of base) add(e);
  for (const e of incoming) {
    const keyNoLinkedIn = `${norm(e.name)}|${norm(e.type)}|`;
    const existingIdx = out.findIndex((x) => `${norm(x.name)}|${norm(x.type)}|` === keyNoLinkedIn);
    if (existingIdx >= 0) {
      const existing = out[existingIdx];
      const existingLinkedIn = (existing as any).linkedin_url;
      const incomingLinkedIn = (e as any).linkedin_url;
      out[existingIdx] = {
        ...existing,
        ...(incomingLinkedIn && !existingLinkedIn ? { linkedin_url: incomingLinkedIn } : {}),
      };
      continue;
    }
    add(e);
  }
  return out;
}

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
      const parsed = JSON.parse(raw) as {
        persons?: Person[];
        entities?: Entity[];
      };
      persons = Array.isArray(parsed.persons) ? parsed.persons : [];
      entities = Array.isArray(parsed.entities) ? parsed.entities : [];
    } catch {
      console.warn('[/api/enrich] Failed to parse LLM response:', raw?.slice(0, 200));
      // Return empty rather than error — partial failure is acceptable
    }

    console.log(`[/api/enrich] Extracted ${persons.length} persons, ${entities.length} entities for ${articleId}`);

    // Merge with scoring-time extraction so enrichment appends (never overwrites).
    // This prevents UI "links disappearing" when enrichment returns a smaller set.
    const mergedPersons = mergePersons((existing?.persons ?? []) as Person[], persons);
    const mergedEntities = mergeEntities((existing?.entities ?? []) as Entity[], entities);

    // ── Persist to DB ────────────────────────────────────────────────────────
    const enriched_at = new Date().toISOString();
    try {
      await updateEnrichedScoredArticle(articleId, mergedPersons, mergedEntities);
    } catch (dbErr) {
      console.error('[/api/enrich] DB update failed (non-fatal):', dbErr);
    }

    return NextResponse.json({ persons: mergedPersons, entities: mergedEntities, enriched_at, cached: false });
  } catch (err) {
    console.error('[/api/enrich] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Enrichment failed' },
      { status: 500 },
    );
  }
}
