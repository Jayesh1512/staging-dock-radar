/* ─── QA Agent Types ─── */

/** Input per company — pre-loaded evidence from Steps 1-4 */
export interface QACompanyInput {
  name: string;
  domain: string;
  website?: string | null;
  linkedin_url?: string | null;
  country: string;
  city?: string | null;
  role?: string; // Dealer | System Integrator | Solution Provider | Operator | Media
  sources_preloaded: string[]; // dji_dealer, google_search, comet, chatgpt
  dock_models_preloaded?: string | null; // "Dock 1, 2, 3"
  evidence_url_preloaded?: string | null;
  notes_preloaded?: string | null;
}

/** Request body for QA Agent */
export interface QAVerifyRequest {
  companies: QACompanyInput[];
  country: string;
  runLabel?: string;
  skipLinkedin?: boolean;
  skipSerper?: boolean;
}

/** Serper site-search result */
export interface SerperVerifyResult {
  found: boolean;
  hits: number;
  variant: string | null; // "Dock 2, Dock 3"
  best_url: string | null;
  relevance: 'direct' | 'indirect' | 'mention_only';
  mentions: Array<{ url: string; title: string; snippet: string }>;
  error: string | null;
}

/** DB-driven batch verify request */
export interface VerifyBatchRequest {
  countryCodes: string[];
  dryRun?: boolean;
  offset?: number;     // for chunked execution
  limit?: number;      // max records per call (default 200)
}

/** LinkedIn Serper-based check result */
export interface LinkedInVerifyResult {
  found: boolean;
  mentions: number;
  best_url: string | null;
  error: string | null;
}

/** Final output per company */
export interface QACompanyOutput {
  name: string;
  domain: string;
  country: string;
  city: string | null;
  role: string;
  website: string | null;
  linkedin_url: string | null;

  dock_confirmed: boolean;
  dock_models: string; // merged from all sources
  confidence: 'high' | 'medium' | 'low' | 'none';
  confidence_score: number; // 0.0 - 6.0+

  sources_confirmed: string[]; // which sources confirmed Dock
  evidence_url: string | null;
  evidence_summary: string; // one-liner

  serper: SerperVerifyResult | null;
  linkedin: LinkedInVerifyResult | null;

  notes: string;
}

/** Summary stats */
export interface QASummary {
  total: number;
  confirmed: number;
  high: number;
  medium: number;
  low: number;
  none: number;
  serper_credits_used: number;
}

/** NDJSON stream event types */
export type QAStreamEvent =
  | { type: 'log'; data: string }
  | { type: 'progress'; data: { current: number; total: number; name: string } }
  | { type: 'step'; data: { name: string; step: 'serper' | 'linkedin'; found: boolean; hits?: number; variant?: string | null; mentions?: number } }
  | { type: 'result'; data: QACompanyOutput }
  | { type: 'summary'; data: QASummary }
  | { type: 'report'; data: { path: string } }
  | { type: 'done'; data: null }
  | { type: 'error'; data: string };
