import type { ArticleSource, SignalType } from './types';

export const SCORE_BANDS = [
  { min: 90, max: 100, label: 'Hot Lead', bg: '#F0FDF4', text: '#16A34A' },
  { min: 70, max: 89, label: 'Strong Signal', bg: '#DBEAFE', text: '#2563EB' },
  { min: 50, max: 69, label: 'Moderate Signal', bg: '#FEFCE8', text: '#CA8A04' },
  { min: 30, max: 49, label: 'Background Intel', bg: '#F3F4F6', text: '#6B7280' },
  { min: 0, max: 29, label: 'Noise', bg: '#FEF2F2', text: '#991B1B' },
] as const;

export function getScoreBand(score: number) {
  return SCORE_BANDS.find((b) => score >= b.min && score <= b.max) ?? SCORE_BANDS[4];
}

export const SIGNAL_BADGE_COLORS: Record<SignalType, { bg: string; text: string }> = {
  DEPLOYMENT: { bg: '#DCFCE7', text: '#166534' },
  CONTRACT: { bg: '#DBEAFE', text: '#1E40AF' },
  TENDER: { bg: '#F3E8FF', text: '#6B21A8' },
  PARTNERSHIP: { bg: '#FFF7ED', text: '#C2410C' },
  EXPANSION: { bg: '#FEF9C3', text: '#A16207' },
  FUNDING: { bg: '#CFFAFE', text: '#0E7490' },
  REGULATION: { bg: '#FEE2E2', text: '#991B1B' },
  OTHER: { bg: '#F3F4F6', text: '#4B5563' },
};

export const SOURCE_BADGE_COLORS: Record<ArticleSource, { bg: string; text: string }> = {
  google_news: { bg: '#FEF9C3', text: '#A16207' },
  linkedin: { bg: '#DBEAFE', text: '#1E40AF' },
  facebook: { bg: '#EEF2FF', text: '#4338CA' },
};

export const SOURCE_LABELS: Record<ArticleSource, string> = {
  google_news: 'Google News',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
};

export const ENTITY_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  buyer: { bg: '#DCFCE7', text: '#166534' },
  operator: { bg: '#DBEAFE', text: '#1E40AF' },
  regulator: { bg: '#FEE2E2', text: '#991B1B' },
  partner: { bg: '#FFF7ED', text: '#C2410C' },
  si: { bg: '#F3E8FF', text: '#6B21A8' },
  oem: { bg: '#F3F4F6', text: '#4B5563' },
};

export const REGION_GROUPS = [
  { continent: 'Americas', countries: ['US', 'Canada', 'Brazil', 'Mexico'] },
  { continent: 'Europe', countries: ['UK', 'Germany', 'France', 'Italy'] },
  { continent: 'Asia Pacific', countries: ['India', 'Singapore', 'Japan', 'Australia', 'South Korea'] },
  { continent: 'Middle East & Africa', countries: ['UAE', 'Saudi Arabia', 'South Africa'] },
] as const;

export const ALL_COUNTRIES = REGION_GROUPS.flatMap((g) => [...g.countries]);

/**
 * Default region selection for new sessions — 8 high-signal markets covering
 * major drone deployment activity across all continents.
 * Maps to 8 Google News editions for multi-region collection.
 */
export const CORE_8_REGIONS = ['US', 'UK', 'France', 'Australia', 'Italy', 'Singapore', 'UAE', 'Brazil'] as const;

export const DEFAULTS = {
  maxArticles: 40,
  filterDays: 7,
  minScore: 50,
  titleSimilarity: 0.80,
  /** Points added to relevance_score for articles published within freshnessWindowHours */
  freshnessBoostPoints: 10,
  /** Minimum base score required to receive the freshness boost */
  freshnessBoostMinScore: 25,
  /** Hours since publication within which an article receives the freshness boost */
  freshnessBoostWindowHours: 24,
} as const;

/** Preset day values for the date range filter */
export const DATE_PRESETS = [1, 3, 7, 14, 30, 60, 90] as const;

/** Human-readable labels for select date presets. Presets not listed show the raw number. */
export const DATE_PRESET_LABELS: Record<number, string> = {
  1: 'Today',
  3: '3 Days',
};

/**
 * Maps LLM-returned country name variants → canonical region key used in REGION_GROUPS.
 * Keeps filtering robust when the LLM uses shorthand ("US", "UK") or full names.
 */
export const COUNTRY_NAME_TO_REGION_KEY: Record<string, string> = {
  'united states': 'US', 'usa': 'US', 'u.s.': 'US', 'us': 'US', 'america': 'US',
  'canada': 'Canada',
  'brazil': 'Brazil', 'brasil': 'Brazil',
  'mexico': 'Mexico',
  'united kingdom': 'UK', 'uk': 'UK', 'england': 'UK', 'britain': 'UK', 'great britain': 'UK',
  'germany': 'Germany', 'deutschland': 'Germany',
  'france': 'France',
  'italy': 'Italy',
  'india': 'India',
  'singapore': 'Singapore',
  'japan': 'Japan',
  'australia': 'Australia',
  'south korea': 'South Korea', 'korea': 'South Korea',
  'united arab emirates': 'UAE', 'uae': 'UAE', 'emirates': 'UAE',
  'saudi arabia': 'Saudi Arabia', 'ksa': 'Saudi Arabia',
  'south africa': 'South Africa',
};
