import type { Article, ArticleWithScore, Run, ScoredArticle } from '@/types';

// ─── Mock Runs ──────────────────────────────────────────────
export const MOCK_RUNS: Run[] = [
  {
    id: 'run_20260315_143022',
    keywords: ['Zipline Deployment'],
    sources: ['google_news'],
    regions: ['US', 'Brazil', 'Singapore', 'Italy'],
    filter_days: 30,
    min_score: 50,
    max_articles: 25,
    status: 'completed',
    articles_fetched: 127,
    articles_stored: 25,
    dedup_removed: 38,
    created_at: '2026-03-15T14:30:22Z',
    completed_at: '2026-03-15T14:30:24Z',
  },
  {
    id: 'run_20260314_101500',
    keywords: ['DJI Dock'],
    sources: ['google_news'],
    regions: ['India', 'Brazil'],
    filter_days: 30,
    min_score: 50,
    max_articles: 25,
    status: 'completed',
    articles_fetched: 95,
    articles_stored: 20,
    dedup_removed: 22,
    created_at: '2026-03-14T10:15:00Z',
    completed_at: '2026-03-14T10:15:02Z',
  },
];

// ─── Mock Articles ──────────────────────────────────────────
const articles: Article[] = [
  {
    id: 'art_001',
    source: 'google_news',
    title: 'Port of Santos Autonomous Drone Security Deployment',
    url: 'https://reuters.com/article/port-santos-drone-security',
    normalized_url: 'reuters.com/article/port-santos-drone-security',
    snippet: 'The Port of Santos has announced a comprehensive autonomous drone security program...',
    publisher: 'Reuters',
    published_at: '2026-03-15T12:00:00Z',
    created_at: '2026-03-15T14:30:22Z',
  },
  {
    id: 'art_002',
    source: 'google_news',
    title: 'Enel Green Power Signs Drone Inspection Contract',
    url: 'https://apnews.com/article/enel-drone-inspection',
    normalized_url: 'apnews.com/article/enel-drone-inspection',
    snippet: 'Enel Green Power has signed a multi-year contract for drone-based power line inspection...',
    publisher: 'AP News',
    published_at: '2026-03-15T11:00:00Z',
    created_at: '2026-03-15T14:30:22Z',
  },
  {
    id: 'art_003',
    source: 'google_news',
    title: 'MPA Singapore Maritime Surveillance Drone Tender',
    url: 'https://straitstimes.com/singapore/mpa-drone-tender',
    normalized_url: 'straitstimes.com/singapore/mpa-drone-tender',
    snippet: 'Maritime and Port Authority of Singapore issues tender for maritime surveillance drones...',
    publisher: 'Straits Times',
    published_at: '2026-03-15T10:00:00Z',
    created_at: '2026-03-15T14:30:22Z',
  },
  {
    id: 'art_004',
    source: 'google_news',
    title: 'Indian Railways to Deploy 200 Drones Across 15 Zones',
    url: 'https://timesofindia.com/article/indian-railways-200-drones-flytbase-2026',
    normalized_url: 'timesofindia.com/article/indian-railways-200-drones-flytbase-2026',
    snippet: 'Indian Railways announces large-scale drone deployment program with FlytBase...',
    publisher: 'Times of India',
    published_at: '2026-03-14T08:00:00Z',
    created_at: '2026-03-14T10:15:00Z',
  },
  {
    id: 'art_005',
    source: 'google_news',
    title: 'Votorantim Mining Expands UAV Fleet for Remote Site Survey',
    url: 'https://miningweekly.com/votorantim-uav-fleet',
    normalized_url: 'miningweekly.com/votorantim-uav-fleet',
    snippet: 'Votorantim Cimentos expands UAV fleet for remote mine site surveying operations...',
    publisher: 'Mining Weekly',
    published_at: '2026-03-13T09:00:00Z',
    created_at: '2026-03-14T10:15:00Z',
  },
  {
    id: 'art_006',
    source: 'google_news',
    title: 'DGCA India Issues New Drone Regulations for Commercial Operations',
    url: 'https://economictimes.com/dgca-drone-regulations',
    normalized_url: 'economictimes.com/dgca-drone-regulations',
    snippet: 'DGCA announces revised drone regulations for commercial and industrial operations...',
    publisher: 'Economic Times',
    published_at: '2026-03-13T07:00:00Z',
    created_at: '2026-03-14T10:15:00Z',
  },
  {
    id: 'art_007',
    source: 'google_news',
    title: 'SE Asian Port Expansion to Feature Autonomous Drone Ops',
    url: 'https://seatrade-maritime.com/se-asian-port-drones',
    normalized_url: 'seatrade-maritime.com/se-asian-port-drones',
    snippet: 'A major port expansion project in Southeast Asia will feature autonomous drone operations...',
    publisher: 'Seatrade Maritime',
    published_at: '2026-03-15T08:00:00Z',
    created_at: '2026-03-15T14:30:22Z',
  },
  {
    id: 'art_008',
    source: 'google_news',
    title: 'Seoul Metro Drone Security Contract Awarded',
    url: 'https://koreaherald.com/seoul-metro-drone-security',
    normalized_url: 'koreaherald.com/seoul-metro-drone-security',
    snippet: 'Seoul Metro awards drone security contract for subway infrastructure monitoring...',
    publisher: 'Korea Herald',
    published_at: '2026-03-14T06:00:00Z',
    created_at: '2026-03-14T10:15:00Z',
  },
];

// ─── Mock Scored Articles ───────────────────────────────────
const scored: ScoredArticle[] = [
  {
    id: 'sc_001', article_id: 'art_001', relevance_score: 92,
    company: 'Port of Santos', country: 'Brazil', city: 'Santos',
    use_case: 'Port Security', signal_type: 'DEPLOYMENT',
    summary: 'Port of Santos has initiated a comprehensive autonomous drone security program covering perimeter surveillance, vessel tracking, and contraband detection across its 13km waterfront.',
    flytbase_mentioned: false,
    persons: [{ name: 'Carlos Mendes', role: 'Port Security Director', organization: 'Port of Santos' }],
    entities: [
      { name: 'Port of Santos', type: 'buyer' },
      { name: 'DJI', type: 'oem' },
    ],
    drop_reason: null, is_duplicate: false,
    status: 'new', actions_taken: [], reviewed_at: null, dismissed_at: null, slack_sent_at: null,
    created_at: '2026-03-15T14:30:24Z',
  },
  {
    id: 'sc_002', article_id: 'art_002', relevance_score: 90,
    company: 'Enel Green Power', country: 'Italy', city: null,
    use_case: 'Power Line Inspection', signal_type: 'CONTRACT',
    summary: 'Enel Green Power has signed a multi-year contract for drone-based power line inspection covering 15,000km of transmission infrastructure across Southern Italy.',
    flytbase_mentioned: false,
    persons: [{ name: 'Marco Rossi', role: 'Head of Grid Operations', organization: 'Enel Green Power' }],
    entities: [
      { name: 'Enel Green Power', type: 'buyer' },
      { name: 'Skydio', type: 'oem' },
    ],
    drop_reason: null, is_duplicate: false,
    status: 'new', actions_taken: [], reviewed_at: null, dismissed_at: null, slack_sent_at: null,
    created_at: '2026-03-15T14:30:24Z',
  },
  {
    id: 'sc_003', article_id: 'art_003', relevance_score: 72,
    company: null, country: 'Singapore', city: 'Singapore',
    use_case: 'Maritime Surveillance', signal_type: 'TENDER',
    summary: 'Maritime and Port Authority of Singapore has issued an open tender for autonomous maritime surveillance drones to patrol the Straits of Malacca approaches.',
    flytbase_mentioned: false,
    persons: [],
    entities: [{ name: 'MPA Singapore', type: 'regulator' }],
    drop_reason: null, is_duplicate: false,
    status: 'new', actions_taken: [], reviewed_at: null, dismissed_at: null, slack_sent_at: null,
    created_at: '2026-03-15T14:30:24Z',
  },
  {
    id: 'sc_004', article_id: 'art_004', relevance_score: 85,
    company: 'Indian Railways', country: 'India', city: 'Delhi',
    use_case: 'Rail Survey', signal_type: 'DEPLOYMENT',
    summary: 'Indian Railways has announced a large-scale drone deployment program covering 15 zones across the country. FlytBase has been named as the software platform of choice for fleet management and autonomous mission planning.',
    flytbase_mentioned: true,
    persons: [
      { name: 'Rajesh Kumar', role: 'Director of Technology', organization: 'Indian Railways' },
      { name: 'Priya Sharma', role: 'Drone Program Lead', organization: 'Indian Railways' },
    ],
    entities: [
      { name: 'Indian Railways', type: 'buyer' },
      { name: 'FlytBase', type: 'partner' },
      { name: 'DJI', type: 'oem' },
    ],
    drop_reason: null, is_duplicate: false,
    status: 'new', actions_taken: [], reviewed_at: null, dismissed_at: null, slack_sent_at: null,
    created_at: '2026-03-14T10:15:02Z',
  },
  {
    id: 'sc_005', article_id: 'art_005', relevance_score: 78,
    company: 'Votorantim', country: 'Brazil', city: null,
    use_case: 'Mining Survey', signal_type: 'DEPLOYMENT',
    summary: 'Votorantim Cimentos is expanding its UAV fleet for remote mine site surveying operations across three states in Brazil.',
    flytbase_mentioned: false,
    persons: [],
    entities: [{ name: 'Votorantim', type: 'buyer' }],
    drop_reason: null, is_duplicate: false,
    status: 'new', actions_taken: [], reviewed_at: null, dismissed_at: null, slack_sent_at: null,
    created_at: '2026-03-14T10:15:02Z',
  },
  {
    id: 'sc_006', article_id: 'art_006', relevance_score: 55,
    company: null, country: 'India', city: null,
    use_case: 'Regulatory', signal_type: 'REGULATION',
    summary: 'DGCA has announced revised drone regulations for commercial and industrial operations, easing restrictions for beyond-visual-line-of-sight flights.',
    flytbase_mentioned: false,
    persons: [],
    entities: [{ name: 'DGCA', type: 'regulator' }],
    drop_reason: null, is_duplicate: false,
    status: 'new', actions_taken: [], reviewed_at: null, dismissed_at: null, slack_sent_at: null,
    created_at: '2026-03-14T10:15:02Z',
  },
  {
    id: 'sc_007', article_id: 'art_007', relevance_score: 61,
    company: null, country: 'Indonesia', city: null,
    use_case: 'Port Security', signal_type: 'EXPANSION',
    summary: 'A major port expansion project in Southeast Asia plans to incorporate autonomous drone operations for perimeter security and cargo monitoring.',
    flytbase_mentioned: false,
    persons: [],
    entities: [],
    drop_reason: null, is_duplicate: false,
    status: 'new', actions_taken: [], reviewed_at: null, dismissed_at: null, slack_sent_at: null,
    created_at: '2026-03-15T14:30:24Z',
  },
  {
    id: 'sc_008', article_id: 'art_008', relevance_score: 91,
    company: 'Seoul Metro', country: 'South Korea', city: 'Seoul',
    use_case: 'Infrastructure Monitoring', signal_type: 'CONTRACT',
    summary: 'Seoul Metro has awarded a drone security contract for subway infrastructure monitoring using autonomous indoor drones.',
    flytbase_mentioned: false,
    persons: [{ name: 'Kim Jae-won', role: 'CTO', organization: 'Seoul Metro' }],
    entities: [
      { name: 'Seoul Metro', type: 'buyer' },
      { name: 'DroneSense', type: 'si' },
    ],
    drop_reason: null, is_duplicate: false,
    status: 'reviewed', actions_taken: ['slack'], reviewed_at: '2026-03-14T12:00:00Z',
    dismissed_at: null, slack_sent_at: '2026-03-14T11:55:00Z',
    created_at: '2026-03-14T10:15:02Z',
  },
];

// ─── Combine into ArticleWithScore ──────────────────────────
export const MOCK_ARTICLES_WITH_SCORES: ArticleWithScore[] = scored.map((s) => ({
  article: articles.find((a) => a.id === s.article_id)!,
  scored: s,
}));

// ─── Run → articles mapping ────────────────────────────────
export const RUN_ARTICLE_MAP: Record<string, string[]> = {
  'run_20260315_143022': ['art_001', 'art_002', 'art_003', 'art_007'],
  'run_20260314_101500': ['art_004', 'art_005', 'art_006', 'art_008'],
};

// ─── Helpers ────────────────────────────────────────────────
export function getArticlesForRun(runId: string): ArticleWithScore[] {
  const ids = RUN_ARTICLE_MAP[runId] ?? [];
  return MOCK_ARTICLES_WITH_SCORES.filter((a) => ids.includes(a.article.id));
}

export function getQueueArticles(): ArticleWithScore[] {
  return MOCK_ARTICLES_WITH_SCORES.filter((a) => a.scored.status === 'new');
}

export function getReviewedArticles(): ArticleWithScore[] {
  return MOCK_ARTICLES_WITH_SCORES.filter((a) => a.scored.status === 'reviewed');
}
