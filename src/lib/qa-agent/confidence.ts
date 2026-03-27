/**
 * Confidence scoring for QA Agent.
 *
 * Weights are used ONLY for ranking — every company appears in the report
 * regardless of score. The formula is shown as a footnote in the HTML report.
 *
 * Source weights:
 *   DJI Dealer list      0.5  (can sell Dock, doesn't mean they do)
 *   Google Search         1.0  (appeared in "DJI Dock" country search)
 *   Comet Intelligence    1.5  (curated DJI Dock authorization data)
 *   ChatGPT Deep Research 0.5  (secondary source, article cross-references)
 *   Serper website scan   1.5  (+0.5 if ≥10 hits, +0.25 if ≥5)
 *   LinkedIn posts        1.0  (+0.5 if ≥4 matches, +0.25 if ≥2)
 *
 * Thresholds: ≥4.0 → high, ≥2.0 → medium, ≥0.5 → low, else → none
 */

interface ConfidenceContext {
  serper_hits?: number;
  linkedin_mentions?: number;
}

const SOURCE_WEIGHTS: Record<string, number> = {
  dji_dealer: 0.5,
  google_search: 1.0,
  comet: 1.5,
  chatgpt: 0.5,
  serper_website: 1.5,
  linkedin_posts: 1.0,
};

function serperAmplifier(hits: number): number {
  if (hits >= 10) return 0.5;
  if (hits >= 5) return 0.25;
  return 0;
}

function linkedinAmplifier(mentions: number): number {
  if (mentions >= 4) return 0.5;
  if (mentions >= 2) return 0.25;
  return 0;
}

export function computeConfidence(
  sourcesConfirmed: string[],
  ctx: ConfidenceContext = {},
): { score: number; level: 'high' | 'medium' | 'low' | 'none' } {
  let score = 0;

  for (const source of sourcesConfirmed) {
    const weight = SOURCE_WEIGHTS[source];
    if (weight !== undefined) {
      score += weight;
    }
  }

  // Amplifiers for evidence strength
  if (sourcesConfirmed.includes('serper_website') && ctx.serper_hits) {
    score += serperAmplifier(ctx.serper_hits);
  }
  if (sourcesConfirmed.includes('linkedin_posts') && ctx.linkedin_mentions) {
    score += linkedinAmplifier(ctx.linkedin_mentions);
  }

  score = Math.round(score * 100) / 100;

  const level: 'high' | 'medium' | 'low' | 'none' =
    score >= 4.0 ? 'high'
    : score >= 2.0 ? 'medium'
    : score >= 0.5 ? 'low'
    : 'none';

  return { score, level };
}

/** Human-readable formula for the report footnote */
export const CONFIDENCE_FORMULA_NOTE = `Confidence Score = sum of source weights: DJI Dealer (0.5) + Google Search (1.0) + Comet (1.5) + ChatGPT (0.5) + Serper Website (1.5, +0.5 if ≥10 hits) + LinkedIn (1.0, +0.5 if ≥4 matches). Thresholds: ≥4.0 = high, ≥2.0 = medium, ≥0.5 = low. All companies appear regardless of score.`;

/**
 * Pick the best evidence URL from all available sources.
 * Priority: Serper hit with "dock" in path → LinkedIn Dock post → pre-loaded evidence → website
 */
export function pickEvidenceUrl(
  serperBestUrl: string | null,
  linkedinBestUrl: string | null,
  preloadedEvidence: string | null,
  website: string | null,
): string | null {
  if (serperBestUrl) return serperBestUrl;
  if (linkedinBestUrl) return linkedinBestUrl;
  if (preloadedEvidence) return preloadedEvidence;
  return website;
}

/**
 * Merge dock models from all sources.
 * Input: preloaded "Dock 1, 2, 3" + serper variant "Dock 2, Dock 3" + linkedin text
 * Output: deduped "Dock 1, 2, 3"
 */
export function mergeDockModels(
  preloaded: string | null,
  serperVariant: string | null,
): string {
  const models = new Set<string>();

  const parse = (s: string | null) => {
    if (!s) return;
    // Extract dock numbers
    const matches = s.match(/dock\s*([123])/gi);
    if (matches) {
      for (const m of matches) {
        const num = m.replace(/dock\s*/i, '');
        models.add(num);
      }
    }
    // Check for generic "Dock" without number
    if (/dock/i.test(s) && !matches) {
      models.add('generic');
    }
  };

  parse(preloaded);
  parse(serperVariant);

  if (models.size === 0) return '';

  const nums = [...models].filter(m => m !== 'generic').sort();
  if (nums.length > 0) return 'Dock ' + nums.join(', ');
  return 'Dock (generic)';
}
