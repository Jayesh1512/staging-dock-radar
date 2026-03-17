import { DEFAULTS } from './constants';
import type { Article, ArticleWithScore } from './types';

/** Chunk size for scoring API calls (max articles per /api/score request) */
const SCORE_CHUNK_SIZE = 10;

/**
 * Scores articles in chunks to avoid LLM timeouts and token limits.
 * Makes multiple requests to /api/score, each with up to SCORE_CHUNK_SIZE articles.
 * 
 * @param articles - Articles to score
 * @param campaign - Optional campaign identifier (e.g., 'dsp_6mo_sweep')
 * @returns All scored articles
 */
export async function scoreChunked(
  articles: Article[],
  campaign?: string
): Promise<ArticleWithScore[]> {
  if (articles.length === 0) return [];

  const allResults: ArticleWithScore[] = [];

  for (let i = 0; i < articles.length; i += SCORE_CHUNK_SIZE) {
    const chunk = articles.slice(i, i + SCORE_CHUNK_SIZE);
    const chunkNum = Math.floor(i / SCORE_CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(articles.length / SCORE_CHUNK_SIZE);

    console.log(`[scoreChunked] Scoring chunk ${chunkNum}/${totalChunks} (${chunk.length} articles)`);

    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        articles: chunk,
        minScore: DEFAULTS.minScore,
        campaign: campaign ?? null,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? `Score failed (HTTP ${res.status})`);
    }

    const data = await res.json();
    const results: ArticleWithScore[] = data.results ?? [];

    // Truncation detection: warn if <30% of articles got meaningful scores
    const meaningful = results.filter(r => r.scored.relevance_score > 0 || r.scored.company);
    if (meaningful.length < chunk.length * 0.3 && chunk.length > 3) {
      console.warn(
        `[scoreChunked] Possible LLM truncation in chunk ${chunkNum}: ${meaningful.length}/${chunk.length} articles scored meaningfully`
      );
    }

    allResults.push(...results);
  }

  console.log(`[scoreChunked] Complete: scored ${allResults.length} articles total`);
  return allResults;
}
