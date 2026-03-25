/**
 * Company name normalization and fuzzy matching utilities
 * Used for matching extracted DSP/SI companies against the FlytBase partners list
 */

/**
 * Normalize a company name for consistent matching.
 * Steps:
 * 1. Lowercase
 * 2. Remove legal/generic suffixes (inc, ltd, llc, gmbh, corp, corporation, solutions, services, etc.)
 * 3. Strip punctuation (keep alphanumeric + spaces)
 * 4. Collapse whitespace and trim
 *
 * Example: "DroneForce Solutions, Inc." → "droneforce"
 */
export function normalizeCompanyName(name: string): string {
  if (!name || typeof name !== 'string') return '';

  let normalized = name.toLowerCase().trim();

  // Remove parenthetical content: "STTL (Service Technique...)" → "STTL"
  normalized = normalized.replace(/\(.*?\)/g, '');

  // Remove legal suffixes at end of name only
  const legalSuffixes = [
    'inc', 'ltd', 'llc', 'gmbh', 'corp', 'corporation', 'limited', 'co', 'plc',
    'pty',        // Australian
    'sas', 'sarl', 'sa', 'eurl', 'sasu', 'sci',  // French
    'bv', 'nv',   // Dutch
    'ag',         // German/Swiss
    'srl', 'spa', // Italian
    'sl',         // Spanish
  ];
  for (const suffix of legalSuffixes) {
    normalized = normalized.replace(new RegExp(`\\b${suffix}\\s*$`), '');
  }

  // Remove generic suffixes only at end (don't strip "Capture Solutions" → "Capture")
  const genericSuffixes = [
    'solutions', 'services', 'technologies', 'technology',
    'systems', 'group',
  ];
  for (const suffix of genericSuffixes) {
    normalized = normalized.replace(new RegExp(`\\b${suffix}\\s*$`), '');
  }

  // Strip punctuation (keep alphanumeric + spaces only)
  normalized = normalized.replace(/[^\w\s]/g, '');

  // Collapse multiple spaces and trim
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Jaccard similarity between two sets of words.
 * Range: [0, 1] where 1 = identical, 0 = no overlap
 */
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

/**
 * Tokenize a normalized string into words, filtering stop words and short tokens.
 */
function wordSet(text: string): Set<string> {
  const stopWords = new Set([
    'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or',
    'is', 'are', 'was', 'were', 'be', 'been', 'by', 'with', 'as',
  ]);

  const tokens = text
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length >= 3 && !stopWords.has(t));

  return new Set(tokens);
}

/**
 * Fuzzy match a company name against a list of candidate names.
 * Returns the best match with a confidence score.
 */
export function fuzzyMatchCompany(
  name: string,
  candidates: string[], // normalized partner names
): { match: string | null; score: number; confidence: 'high' | 'low' | 'none' } {
  const normalizedName = normalizeCompanyName(name);

  if (!normalizedName || candidates.length === 0) {
    return { match: null, score: 0, confidence: 'none' };
  }

  // Special case: exact match
  if (candidates.includes(normalizedName)) {
    return { match: normalizedName, score: 1.0, confidence: 'high' };
  }

  // Jaccard similarity on word sets
  const nameWords = wordSet(normalizedName);
  let bestCandidate: string | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const candidateWords = wordSet(candidate);
    const score = jaccardSimilarity(nameWords, candidateWords);

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  // Determine confidence based on score
  let confidence: 'high' | 'low' | 'none' = 'none';
  if (bestScore >= 0.6) {
    confidence = 'high';
  } else if (bestScore >= 0.4) {
    confidence = 'low';
  }

  return {
    match: bestCandidate,
    score: bestScore,
    confidence,
  };
}
