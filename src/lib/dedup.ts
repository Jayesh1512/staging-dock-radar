import type { RawArticle } from './google-news-rss';
import type { Article, ArticleWithScore } from './types';
import { DEFAULTS } from './constants';

// ─── Text normalization ─────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or',
  'by', 'with', 'is', 'it', 'its', 'was', 'are', 'has', 'have', 'from',
  'that', 'this', 'will', 'be', 'as', 'not',
]);

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordSet(title: string): Set<string> {
  return new Set(
    normalizeTitle(title)
      .split(' ')
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

/** Jaccard similarity on word sets. Range [0, 1]. */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((w) => b.has(w)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

// ─── Deduplication ─────────────────────────────────────────────────────────

/**
 * SCOPE: Cross-keyword deduplication **within a single collection run**.
 *
 * Handles the case where multiple keyword searches (e.g. "DJI Dock" and
 * "Drone Deployment") return the same article. The second occurrence is
 * removed; the first-fetched copy is kept.
 *
 * Two-stage approach:
 *   Stage 1 — Exact URL dedup   (O(n),   cheap — always run first)
 *   Stage 2 — Title similarity  (O(n²),  on the already URL-deduped set)
 *
 * ⚠️  KNOWN GAP — Historical deduplication across runs:
 * If a future run fetches an article already collected in a prior run it will
 * NOT be caught here. This requires a DB-level comparison against persisted
 * articles and is explicitly deferred to the database integration phase.
 * Do NOT expand this function's scope to cross-run comparison.
 */
export function deduplicateWithinRun(
  articles: RawArticle[],
  threshold: number = DEFAULTS.titleSimilarity,
): { deduplicated: RawArticle[]; removedCount: number } {
  // Stage 1: Exact URL dedup — O(n)
  const seenUrls = new Set<string>();
  const urlDeduped: RawArticle[] = [];
  for (const article of articles) {
    if (!seenUrls.has(article.normalized_url)) {
      seenUrls.add(article.normalized_url);
      urlDeduped.push(article);
    }
  }

  // Stage 2: Title similarity dedup — O(n²) on the smaller URL-deduped set
  const wordSets = urlDeduped.map((a) => wordSet(a.title));
  const dropped = new Set<number>();
  const kept: RawArticle[] = [];

  for (let i = 0; i < urlDeduped.length; i++) {
    if (dropped.has(i)) continue;
    kept.push(urlDeduped[i]);
    for (let j = i + 1; j < urlDeduped.length; j++) {
      if (dropped.has(j)) continue;
      if (jaccardSimilarity(wordSets[i], wordSets[j]) >= threshold) {
        dropped.add(j); // keep earlier-fetched article (i), discard later (j)
      }
    }
  }

  return {
    deduplicated: kept,
    removedCount: articles.length - kept.length,
  };
}

/**
 * After merging parallel collects (e.g. Google News + Latest 24h + LinkedIn), the same story
 * can appear twice with different client ids. Collapse by normalized_url; first occurrence wins.
 */
export function dedupeArticlesByNormalizedUrl(articles: Article[]): {
  deduped: Article[];
  removedCount: number;
} {
  const seen = new Set<string>();
  const deduped: Article[] = [];
  for (const a of articles) {
    const key = (a.normalized_url || '').trim().toLowerCase() || a.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(a);
  }
  return { deduped, removedCount: articles.length - deduped.length };
}

// ─── Gate 2: Post-scoring semantic deduplication ────────────────────────────

/** Jaccard similarity on raw word tokens from a plain string (no stop-word filter — summaries are already concise). */
function jaccardWords(a: string, b: string): number {
  const tokenize = (s: string) => new Set(s.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const setA = tokenize(a);
  const setB = tokenize(b);
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Gate 2: Semantic deduplication on a scored batch.
 *
 * Marks an article as duplicate when it shares the same company + country + signal_type
 * as a higher-scored article AND its summary has Jaccard similarity >= 0.75 against that article.
 *
 * Processing order: highest score first. The top-scored article is always kept;
 * lower-scored semantic twins get is_duplicate = true and surface in the Dropped section.
 *
 * Scope: within a single scoring batch. Cross-run dedup requires DB (Phase 2).
 */
export function gateTwoDedup(articles: ArticleWithScore[]): ArticleWithScore[] {
  const sorted = [...articles].sort((a, b) => b.scored.relevance_score - a.scored.relevance_score);
  const keepers: ArticleWithScore[] = [];
  const result: ArticleWithScore[] = [];

  for (const candidate of sorted) {
    const isDup = keepers.some((kept) => {
      // Skip semantic dedup if company is null — prevents false-positive matches
      // between unrelated articles that both failed company extraction
      if (!kept.scored.company || !candidate.scored.company) return false;
      if (
        kept.scored.company !== candidate.scored.company ||
        kept.scored.country !== candidate.scored.country ||
        kept.scored.signal_type !== candidate.scored.signal_type
      ) return false;

      const a = kept.scored.summary ?? '';
      const b = candidate.scored.summary ?? '';

      // Check summary similarity OR title similarity (catches same-content posts with different LLM summaries)
      const summaryMatch = a && b && jaccardWords(a, b) >= DEFAULTS.titleSimilarity;
      const titleMatch = jaccardWords(kept.article.title, candidate.article.title) >= DEFAULTS.titleSimilarity;
      return summaryMatch || titleMatch;
    });

    if (isDup) {
      result.push({ ...candidate, scored: { ...candidate.scored, is_duplicate: true, drop_reason: 'Similar story already captured in this run' } });
    } else {
      keepers.push(candidate);
      result.push(candidate);
    }
  }

  return result;
}
