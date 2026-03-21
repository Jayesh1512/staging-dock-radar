import type { ArticleSource, SignalType } from './types';

export const SCORE_BANDS = [
  { min: 75, max: 100, label: 'High Value', bg: '#F0FDF4', text: '#16A34A' },
  { min: 50, max: 74, label: 'Strong Signal', bg: '#DBEAFE', text: '#2563EB' },
  { min: 25, max: 49, label: 'Weak Signal', bg: '#FEFCE8', text: '#CA8A04' },
  { min: 0, max: 24, label: 'Noise', bg: '#FEF2F2', text: '#991B1B' },
] as const;

export function getScoreBand(score: number) {
  return SCORE_BANDS.find((b) => score >= b.min && score <= b.max) ?? SCORE_BANDS[3];
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
  newsapi: { bg: '#F3E8FF', text: '#6B21A8' },
  linkedin: { bg: '#DBEAFE', text: '#1E40AF' },
  facebook: { bg: '#EEF2FF', text: '#4338CA' },
};

export const SOURCE_LABELS: Record<ArticleSource, string> = {
  google_news: 'Google News',
  newsapi: 'NewsAPI',
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
  maxArticles: 50,
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

// ─── DSP 6-Month Campaign ──────────────────────────────────────────────────

export const CAMPAIGN_NAME = 'dsp_6mo_sweep';

export const CAMPAIGN_WEST_REGIONS = ['US', 'Canada', 'Mexico', 'Brazil', 'UK', 'Germany', 'France', 'Italy'] as const;
export const CAMPAIGN_EAST_REGIONS = ['India', 'Singapore', 'Japan', 'Australia', 'South Korea', 'UAE', 'Saudi Arabia', 'South Africa'] as const;

export const CAMPAIGN_KEYWORDS = [
  // DJI Dock product family — catches any DSP/operator using DJI dock hardware
  'DJI Dock',
  'DJI Dock 2',
  'DJI Dock 3',
  // Vendor-agnostic dock / drone-in-a-box signals
  'autonomous drone station',
  'drone dock',
  'drone docking station',
] as const;

/** Campaign industry taxonomy (LLM output stored as raw text) */
export const CAMPAIGN_INDUSTRIES = [
  'Energy & Utilities',
  'Public Safety & Emergency Response',
  'Oil & Gas / Industrial Assets',
  'Mining & Natural Resources',
  'Construction & Infrastructure',
  'Ports, Maritime & Logistics Hubs',
  'Agriculture & Forestry',
  'Perimeter Security & Smart Facilities',
  'Water & Environmental Utilities',
] as const;

// ─── Campaign Registry ──────────────────────────────────────────────────────

export interface CampaignConfig {
  /** DB value stored in runs.campaign — never change after data exists */
  id: string;
  /** Short display label shown in tabs and cards */
  label: string;
  /** One-line angle descriptor for the campaign header */
  tagline: string;
  /** 2–3 sentence intent description for the demo/overview view */
  intent: string;
  keywords: readonly string[];
  westRegions: readonly string[];
  eastRegions: readonly string[];
  status: 'completed' | 'active' | 'planned';
}

export const CAMPAIGNS: readonly CampaignConfig[] = [
  {
    id: 'dsp_6mo_sweep',
    label: 'C1 · Hardware Dock',
    tagline: 'Hardware brand sweep — 6 keywords',
    intent: 'Identifies drone operators and SIs by explicit DJI Dock product name and dock hardware terms. Highest precision: if an article mentions the hardware by name, the operator is actively deploying. Started Sep 2025, 52 buckets completed.',
    keywords: ['DJI Dock', 'DJI Dock 2', 'DJI Dock 3', 'autonomous drone station', 'drone dock', 'drone docking station'],
    westRegions: CAMPAIGN_WEST_REGIONS,
    eastRegions: CAMPAIGN_EAST_REGIONS,
    status: 'completed',
  },
  {
    id: 'dsp_op_direct',
    label: 'C2 · Direct Operators',
    tagline: 'Operator behavior signals — 5 keywords',
    intent: 'Catches DSPs running autonomous/unattended missions without naming the hardware brand. Focuses on what operators DO rather than which product they use. "drone dock" added from C1 to catch hardware-agnostic dock operators (non-DJI). Expected to surface 40–60% net new companies vs C1.',
    keywords: ['drone-in-a-box', 'autonomous drone station', 'unattended drone operations', 'remote drone deployment', 'drone dock'],
    westRegions: CAMPAIGN_WEST_REGIONS,
    eastRegions: CAMPAIGN_EAST_REGIONS,
    status: 'completed',
  },
  {
    id: 'dsp_op_adjacent',
    label: 'C3 · Adjacent Ops',
    tagline: 'Dock-adjacent operations — 5 keywords',
    intent: 'Widens the TOFU funnel to companies evaluating dock drones via patrol, surveillance, and inspection signals. Highest volume, lowest precision — expect a larger 25–49 band. Run after C2 analysis is complete.',
    keywords: ['persistent drone surveillance', 'automated drone patrol', 'drone inspection services', 'drone base station', 'autonomous drone inspection'],
    westRegions: CAMPAIGN_WEST_REGIONS,
    eastRegions: CAMPAIGN_EAST_REGIONS,
    status: 'active',
  },
] as const;

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
  // Additional common LLM outputs
  'north america': 'US',
  'multiple': 'Multiple',
  'global': 'Multiple',
};

/**
 * Normalize a country string from LLM output to a canonical display name.
 * Returns the input as-is if not in the known map.
 */
export function normalizeCountryName(country: string): string {
  if (!country) return country;
  return COUNTRY_NAME_TO_REGION_KEY[country.toLowerCase().trim()] ?? country;
}

/** Maps canonical country name → macro-region for hit-score calculation */
export const COUNTRY_TO_MACRO_REGION: Record<string, string> = {
  // Americas
  'US': 'Americas', 'Canada': 'Americas', 'Brazil': 'Americas', 'Mexico': 'Americas', 'Chile': 'Americas', 'North America': 'Americas',
  // Europe
  'UK': 'Europe', 'Germany': 'Europe', 'France': 'Europe', 'Italy': 'Europe', 'Spain': 'Europe',
  'Austria': 'Europe', 'Turkey': 'Europe', 'Lithuania': 'Europe', 'Netherlands': 'Europe',
  'Switzerland': 'Europe', 'Belgium': 'Europe', 'Sweden': 'Europe', 'Norway': 'Europe',
  'Denmark': 'Europe', 'Finland': 'Europe', 'Poland': 'Europe', 'Portugal': 'Europe',
  'Czech Republic': 'Europe', 'Ireland': 'Europe', 'Greece': 'Europe', 'Romania': 'Europe',
  // MEA
  'UAE': 'MEA', 'Saudi Arabia': 'MEA', 'South Africa': 'MEA', 'Qatar': 'MEA', 'Bahrain': 'MEA',
  'Oman': 'MEA', 'Kuwait': 'MEA', 'Kenya': 'MEA', 'Nigeria': 'MEA', 'Egypt': 'MEA',
  // APAC
  'Singapore': 'APAC', 'Japan': 'APAC', 'Australia': 'APAC', 'South Korea': 'APAC',
  'China': 'APAC', 'Indonesia': 'APAC', 'Malaysia': 'APAC', 'Thailand': 'APAC',
  'Vietnam': 'APAC', 'Philippines': 'APAC', 'New Zealand': 'APAC', 'Taiwan': 'APAC',
  // Others
  'India': 'Others',
};

/** Macro-region weights for hit-score ranking */
export const MACRO_REGION_WEIGHTS: Record<string, number> = {
  'Americas': 1.0,
  'Europe': 1.0,
  'MEA': 0.8,
  'APAC': 0.7,
  'Others': 0.5,
};

/** Default weight for countries not in COUNTRY_TO_MACRO_REGION */
export const DEFAULT_REGION_WEIGHT = 0.3;

/** Get the best macro-region weight for a list of countries */
export function getMacroRegionWeight(countries: string[]): number {
  let best = DEFAULT_REGION_WEIGHT;
  for (const c of countries) {
    const macro = COUNTRY_TO_MACRO_REGION[c];
    const w = macro ? (MACRO_REGION_WEIGHTS[macro] ?? DEFAULT_REGION_WEIGHT) : DEFAULT_REGION_WEIGHT;
    if (w > best) best = w;
  }
  return best;
}

/** Get the macro-region label for a list of countries (returns the best one) */
export function getMacroRegionLabel(countries: string[]): string {
  const order = ['Americas', 'Europe', 'MEA', 'APAC', 'Others'];
  for (const c of countries) {
    const macro = COUNTRY_TO_MACRO_REGION[c];
    if (macro) return macro;
  }
  return 'Unknown';
}

/**
 * Known drone OEM names — used to force entity type='oem' and prevent
 * these appearing as operators/SIs in discovered_companies.
 * Normalized to lowercase for matching.
 */
export const OEM_NAMES = new Set([
  'dji', 'skydio', 'autel', 'autel robotics', 'parrot', 'sensefly',
  'zipline', 'wing', 'joby', 'joby aviation', 'manna', 'matternet',
  'ehang', 'flytrex', 'elbit systems', 'aerovironment',
  // FlytBase is our own product — must never surface as a DSP target in Tab 2/3
  'flytbase',
  // Competitors — excluded from DSP hit list
  'high-lander', 'high lander', 'highlander',
]);
