import type { ArticleSource, SignalType } from './types';

// ─── Score Bands ────────────────────────────────────────────
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

// ─── Signal Type Badge Colors ───────────────────────────────
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

// ─── Source Badge Colors ────────────────────────────────────
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

// ─── Region Hierarchy ───────────────────────────────────────
export const REGION_GROUPS = [
  {
    continent: 'Americas',
    countries: ['US', 'Canada', 'Brazil', 'Mexico'],
  },
  {
    continent: 'Europe',
    countries: ['UK', 'Germany', 'France', 'Italy'],
  },
  {
    continent: 'Asia Pacific',
    countries: ['India', 'Singapore', 'Japan', 'Australia', 'South Korea'],
  },
  {
    continent: 'Middle East & Africa',
    countries: ['UAE', 'Saudi Arabia', 'South Africa'],
  },
] as const;

export const ALL_COUNTRIES = REGION_GROUPS.flatMap((g) => g.countries);

// ─── Defaults ───────────────────────────────────────────────
export const DEFAULTS = {
  maxArticles: 50,
  filterDays: 30,
  minScore: 50,
  titleSimilarity: 0.8,
} as const;

// ─── Date Presets ───────────────────────────────────────────
export const DATE_PRESETS = [7, 14, 30, 60, 90] as const;

// ─── Entity Type Colors ─────────────────────────────────────
export const ENTITY_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  buyer: { bg: '#DCFCE7', text: '#166534' },
  operator: { bg: '#DBEAFE', text: '#1E40AF' },
  regulator: { bg: '#FEE2E2', text: '#991B1B' },
  partner: { bg: '#FFF7ED', text: '#C2410C' },
  si: { bg: '#F3E8FF', text: '#6B21A8' },
  oem: { bg: '#F3F4F6', text: '#4B5563' },
};
