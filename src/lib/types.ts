export type SignalType = 'DEPLOYMENT' | 'CONTRACT' | 'TENDER' | 'PARTNERSHIP' | 'EXPANSION' | 'FUNDING' | 'REGULATION' | 'OTHER';
export type ArticleStatus = 'new' | 'reviewed' | 'dismissed';
export type ArticleAction = 'slack' | 'bookmarked' | 'email';
export type ArticleSource = 'google_news' | 'newsapi' | 'linkedin' | 'facebook';

export interface Run {
  id: string;
  keywords: string[];
  sources: ArticleSource[];
  regions: string[];
  filter_days: number;
  min_score: number;
  max_articles: number;
  status: 'running' | 'completed' | 'failed';
  articles_fetched: number;
  articles_stored: number;
  dedup_removed: number;
  created_at: string;
  completed_at: string | null;
  /** Non-null for campaign runs (e.g. 'dsp_6mo_sweep') */
  campaign?: string | null;
}

export interface Article {
  id: string;
  run_id: string;
  source: ArticleSource;
  title: string;
  url: string;
  normalized_url: string;
  snippet: string | null;
  publisher: string | null;
  published_at: string | null;
  created_at: string;
  /** Real article URL after following redirects, captured during scoring body fetch.
   *  Undefined at collection time; set by /api/score once article body is fetched.
   *  Used by Slack for unfurl so og:image shows instead of the Google News page. */
  resolved_url?: string;
  /** True once this article has reached Step 3 (Active Queue) in any run.
   *  Prevents the same article from re-entering the queue in future runs. */
  ever_queued?: boolean;
}

export interface Person {
  name: string;
  role: string;
  organization: string;
}

export interface Entity {
  name: string;
  type: 'buyer' | 'operator' | 'regulator' | 'partner' | 'si' | 'oem';
}

export interface ScoredArticle {
  id: string;
  article_id: string;
  /** Canonical URL for dedup (legacy) */
  normalized_url?: string | null;
  /** URL params fingerprint + entities used for dedup: same fingerprint + same company/country/city = duplicate */
  url_fingerprint?: string | null;
  relevance_score: number;
  company: string | null;
  country: string | null;
  city: string | null;
  use_case: string | null;
  signal_type: SignalType;
  summary: string | null;
  flytbase_mentioned: boolean;
  persons: Person[];
  entities: Entity[];
  drop_reason: string | null;
  is_duplicate: boolean;
  status: ArticleStatus;
  actions_taken: ArticleAction[];
  reviewed_at: string | null;
  dismissed_at: string | null;
  slack_sent_at: string | null;
  /** Set after lazy enrichment completes on drawer open. Null = not yet enriched. */
  enriched_at: string | null;
  /** Industry classification from campaign scoring (null for regular runs) */
  industry?: string | null;
  created_at: string;
}

export interface ArticleWithScore {
  article: Article;
  scored: ScoredArticle;
}

export interface PipelineStats {
  totalFetched: number;
  afterDedup: number;
  afterDateFilter: number;
  afterScoreFilter: number;
  stored: number;
  dedupRemoved: number;
  scoreFilterRemoved: number;
}

export interface CollectResult {
  articles: Article[];
  stats: PipelineStats;
  runId: string;
  keywords: string[];
  regions: string[];
  filterDays: number;
}

export interface ConfigItem {
  label: string;
  value: string | number | boolean;
  editable: boolean;
  type: 'number' | 'text' | 'select';
  options?: { label: string; value: string }[];
  onChange?: (value: string | number | boolean) => void;
}
