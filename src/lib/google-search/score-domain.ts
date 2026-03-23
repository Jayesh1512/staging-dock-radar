/**
 * Tiered keyword scorer for Google Dock Crawler.
 *
 * Tier 1 (40pts): Direct DJI Dock signals
 * Tier 2 (25pts): Drone-in-a-box / BVLOS / regulatory
 * Tier 3 (10pts): Industry verticals
 *
 * Each keyword capped at 3 mentions max.
 */

export interface SignalMatch {
  tier: string;
  keyword: string;
  count: number;
  points: number;
}

export interface DomainScore {
  slug: string;
  totalScore: number;
  signals: SignalMatch[];
  tier1Hit: boolean;
  tier2Hit: boolean;
  topSignal: string;
  signalCount: number;
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
      'drone-in-a-box',
      'drone in a box',
      'bvlos',
      'sora',
      'luc',
      'beyond visual line of sight',
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

export function scoreDomain(slug: string, text: string): DomainScore {
  const lowerText = text.toLowerCase();
  const signals: SignalMatch[] = [];
  let totalScore = 0;

  for (const [tierName, config] of Object.entries(TIERS)) {
    for (const keyword of config.keywords) {
      // Use a simple global search — regex-escape the keyword
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = lowerText.match(new RegExp(escaped, 'gi'));
      const count = matches?.length ?? 0;

      if (count > 0) {
        const cappedCount = Math.min(count, MAX_MENTIONS);
        const points = config.weight * cappedCount;
        totalScore += points;
        signals.push({ tier: tierName, keyword, count, points });
      }
    }
  }

  // Sort signals by points desc
  signals.sort((a, b) => b.points - a.points);

  return {
    slug,
    totalScore,
    signals,
    tier1Hit: signals.some(s => s.tier === 'tier1'),
    tier2Hit: signals.some(s => s.tier === 'tier2'),
    topSignal: signals[0]?.keyword ?? 'none',
    signalCount: signals.length,
  };
}
