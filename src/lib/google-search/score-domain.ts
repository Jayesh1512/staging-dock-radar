/**
 * Tiered keyword scorer for Google Search Crawler.
 *
 * Two scores:
 *   - totalScore: raw additive (for display/ranking)
 *   - normalizedScore: 0-100 (for pipeline import)
 *
 * Normalized: min(100, min(t1,3)×20 + min(t2,3)×12 + min(t3,3)×4 + volBonus)
 * Freshness bonus applied separately: ≤3mo → +5, 3-6mo → +3, else → 0
 *
 * Each keyword capped at 3 mentions. Each tier capped at 3 total.
 */

export interface SignalMatch {
  tier: string;
  keyword: string;
  count: number;       // raw occurrence count
  points: number;      // weight × cappedCount (used in totalScore)
}

export interface DomainScore {
  slug: string;
  totalScore: number;        // raw additive score (for display/ranking)
  normalizedScore: number;   // 0-100 pipeline score
  signals: SignalMatch[];
  tier1Hit: boolean;
  tier2Hit: boolean;
  topSignal: string;
  signalCount: number;
  // Tier counts (capped) for source_meta storage
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
}

const TIERS = {
  tier1: {
    weight: 40,
    keywords: [
      'dji dock',
      'dock 2',
      'dock 3',
    ],
  },
  tier2: {
    weight: 25,
    keywords: [
      'bvlos',
      'sora',
      'luc',
    ],
  },
  tier3: {
    weight: 10,
    keywords: [
      'énergie',
      'sécurité',
      'oil and gas',
      'solar',
      'infrastructure',
      'mining',
      'construction',
      'railway',
      'pipeline',
      'wind farm',
      'inspection',
      'surveillance',
    ],
  },
};

const MAX_MENTIONS = 3;

// ── Freshness bonus ──

export interface FreshnessBand {
  band: 'fresh' | 'warm' | 'stale' | 'unknown';
  label: string;
  bonus: number;
}

/**
 * Determine freshness band from a Google result date string.
 * Supports Dutch/French date formats (e.g. "27 févr. 2025", "29 mrt 2025").
 */
export function getFreshnessBand(lastSeen: string | null | undefined, refDate?: Date): FreshnessBand {
  if (!lastSeen) return { band: 'unknown', label: 'No date', bonus: 0 };

  const ref = refDate ?? new Date();
  const MONTH_MAP: Record<string, number> = {
    // English
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    // French
    janv: 0, févr: 1, mars: 2, avr: 3, mai: 4, juin: 5, juil: 6, août: 7, sept: 8, déc: 11,
    // Dutch
    mrt: 2, mei: 4, okt: 9,
  };

  const parts = lastSeen.trim().split(/\s+/);
  if (parts.length < 3) return { band: 'unknown', label: 'No date', bonus: 0 };

  const day = parseInt(parts[0]);
  const monthStr = parts[1].toLowerCase().replace(/\./g, '');
  const year = parseInt(parts[2]);
  const monthNum = MONTH_MAP[monthStr];

  if (isNaN(day) || monthNum === undefined || isNaN(year)) {
    return { band: 'unknown', label: 'No date', bonus: 0 };
  }

  const date = new Date(year, monthNum, day);
  const diffMonths = (ref.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 30.44);

  if (diffMonths <= 3)  return { band: 'fresh', label: 'Recent',  bonus: 5 };
  if (diffMonths <= 6)  return { band: 'warm',  label: '3-6mo',   bonus: 3 };
  return { band: 'stale', label: '6mo+', bonus: 0 };
}

// ── Scoring ──

export function scoreDomain(slug: string, text: string): DomainScore {
  const lowerText = text.toLowerCase();
  const signals: SignalMatch[] = [];
  let totalScore = 0;
  let tier1Count = 0;
  let tier2Count = 0;
  let tier3Count = 0;

  for (const [tierName, config] of Object.entries(TIERS)) {
    for (const keyword of config.keywords) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = lowerText.match(new RegExp(escaped, 'gi'));
      const count = matches?.length ?? 0;

      if (count > 0) {
        const cappedCount = Math.min(count, MAX_MENTIONS);
        const points = config.weight * cappedCount;
        totalScore += points;
        signals.push({ tier: tierName, keyword, count, points });

        // Accumulate capped counts per tier
        if (tierName === 'tier1') tier1Count += cappedCount;
        else if (tierName === 'tier2') tier2Count += cappedCount;
        else tier3Count += cappedCount;
      }
    }
  }

  // Sort signals by points desc
  signals.sort((a, b) => b.points - a.points);

  // Cap tier totals for normalization (prevent multi-keyword inflation)
  const t1Cap = Math.min(tier1Count, 3);
  const t2Cap = Math.min(tier2Count, 3);
  const t3Cap = Math.min(tier3Count, 3);
  const volBonus = (t1Cap + t2Cap + t3Cap) > 3 ? 5 : 0;

  // Normalized 0-100 score (without freshness — that's applied at import time)
  // Weights: T1×20 + T2×12 + T3×4 + volume bonus
  // Range: T1-only = 60, T1+T2+T3 max = 100, T3-only max = 17
  const normalizedScore = Math.min(100,
    t1Cap * 20 + t2Cap * 12 + t3Cap * 4 + volBonus
  );

  return {
    slug,
    totalScore,
    normalizedScore,
    signals,
    tier1Hit: signals.some(s => s.tier === 'tier1'),
    tier2Hit: signals.some(s => s.tier === 'tier2'),
    topSignal: signals[0]?.keyword ?? 'none',
    signalCount: signals.length,
    tier1Count,
    tier2Count,
    tier3Count,
  };
}

