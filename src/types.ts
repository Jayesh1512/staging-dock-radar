// ─── Enums & Unions ─────────────────────────────────────────
export type SignalType =
  | 'DEPLOYMENT'
  | 'CONTRACT'
  | 'TENDER'
  | 'PARTNERSHIP'
  | 'EXPANSION'
  | 'FUNDING'
  | 'REGULATION'
  | 'OTHER';

export type ArticleStatus = 'new' | 'reviewed' | 'dismissed';
export type ArticleAction = 'slack' | 'bookmarked' | 'email';
export type ArticleSource = 'google_news' | 'linkedin' | 'facebook';

// ─── Core Data Models ───────────────────────────────────────
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
}

export interface Article {
  id: string;
  source: ArticleSource;
  title: string;
  url: string;
  normalized_url: string;
  snippet: string | null;
  publisher: string | null;
  published_at: string | null;
  created_at: string;
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
  created_at: string;
}

export interface ArticleWithScore {
  article: Article;
  scored: ScoredArticle;
}

// ─── Pipeline ───────────────────────────────────────────────
export interface PipelineStats {
  totalFetched: number;
  afterDedup: number;
  afterDateFilter: number;
  stored: number;
  dedupRemoved: number;
}

// ─── Config ─────────────────────────────────────────────────
export interface ConfigItem {
  label: string;
  value: string | number | boolean;
  editable: boolean;
  type: 'number' | 'text' | 'select';
  options?: { label: string; value: string }[];
  onChange?: (value: string | number | boolean) => void;
}

// ─── Slack ──────────────────────────────────────────────────
export interface SlackMessage {
  id: string;
  article_id: string;
  scored_id: string;
  channel_id: string;
  message_ts: string;
  message_text: string;
  sent_at: string;
}

// Phase 2: add RunArticle interface
// Phase 2: add EnrichedContact interface
