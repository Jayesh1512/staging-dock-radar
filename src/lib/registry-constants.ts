/**
 * Registry companies — shared constants for import, scoring, and display.
 * Covers activity code labels, employee band mappings, keyword detection,
 * and confidence derivation. Country-specific mappings added as needed.
 */

// ─── Activity Code Labels (human-readable) ──────────────────────────────────

/** France NAF codes → English labels (covers the ~25 codes present in filtered data) */
export const NAF_LABELS: Record<string, string> = {
  '74.20Z': 'Photographic Activities',
  '81.22Z': 'Building Cleaning',
  '71.12B': 'Engineering & Technical Studies',
  '59.11B': 'Film/Video Production',
  '81.21Z': 'General Cleaning',
  '71.20B': 'Technical Testing & Analysis',
  '74.90B': 'Other Professional Activities',
  '59.11A': 'Film Production',
  '85.59B': 'Other Education (NEC)',
  '85.59A': 'Continuing Professional Education',
  '81.29B': 'Other Cleaning Services',
  '43.91B': 'Roofing & Structural Work',
  '30.30Z': 'Aerospace Manufacturing',
  '70.22Z': 'Business Consulting',
  '71.12A': 'Architecture & Engineering',
  '62.01Z': 'Computer Programming',
  '72.19Z': 'R&D Natural Sciences',
  '82.99Z': 'Other Business Support',
  '81.29A': 'Disinfection & Pest Control',
  '81.10Z': 'Facility Management',
  '70.10Z': 'Head Office Activities',
  '43.22A': 'Plumbing & Heating',
  '85.51Z': 'Sports & Recreation Education',
  '63.11Z': 'Data Processing & Hosting',
  '47.91B': 'Distance Selling (NEC)',
  '26.70Z': 'Optical & Electronic Equipment',
  '49.39B': 'Other Land Transport',
  '49.32Z': 'Taxi Operation',
  '47.11F': 'Supermarket / Retail',
  '47.71Z': 'Clothing Retail',
  '46.61Z': 'Agricultural Machinery',
  '75.00Z': 'Veterinary Activities',
  '80.10Z': 'Private Security',
  '51.10Z': 'Air Transport',
  '47.30Z': 'Fuel Retail',
  '28.12Z': 'Fluid Power Equipment',
};

// ─── Employee Band Mappings ─────────────────────────────────────────────────

/** France SIRENE employee band codes → human-readable label + estimate */
export const FR_EMPLOYEE_BANDS: Record<string, { label: string; estimate: number }> = {
  'NN': { label: 'Not declared', estimate: 0 },
  '00': { label: '0', estimate: 0 },
  '01': { label: '1–2', estimate: 1 },
  '02': { label: '3–5', estimate: 3 },
  '03': { label: '6–9', estimate: 6 },
  '11': { label: '10–19', estimate: 15 },
  '12': { label: '20–49', estimate: 20 },
  '21': { label: '50–99', estimate: 50 },
  '22': { label: '100–199', estimate: 100 },
  '31': { label: '200–249', estimate: 200 },
  '32': { label: '250–499', estimate: 250 },
  '41': { label: '500–999', estimate: 500 },
  '42': { label: '1000–1999', estimate: 1000 },
  '51': { label: '2000–4999', estimate: 2000 },
  '52': { label: '5000–9999', estimate: 5000 },
  '53': { label: '10000+', estimate: 10000 },
};

/** Get employee estimate for a country + band code */
export function getEmployeeEstimate(countryCode: string, band: string): number {
  if (countryCode === 'FR') {
    return FR_EMPLOYEE_BANDS[band]?.estimate ?? 0;
  }
  // Add UK/DE mappings here when needed
  return 0;
}

/** Get employee label for a country + band code */
export function getEmployeeLabel(countryCode: string, band: string): string {
  if (countryCode === 'FR') {
    return FR_EMPLOYEE_BANDS[band]?.label ?? '—';
  }
  return band || '—';
}

// ─── Keyword Detection & Confidence ──────────────────────────────────────────

/** Drone-related keywords with match type: 'substring' or 'word_boundary' */
const KEYWORD_PATTERNS: Array<{ keyword: string; regex: RegExp }> = [
  { keyword: 'drone',     regex: /drone/i },
  { keyword: 'telepilot', regex: /t[eé]l[eé]pilot/i },
  { keyword: 'rpas',      regex: /\brpas\b/i },
  // UAV/UAS: word-boundary only — prevents AQUAVITAL, GUAVA, DUAVRANT false positives
  { keyword: 'uav',       regex: /\buav\b/i },
  { keyword: 'uas',       regex: /\buas\b/i },
];

/** UAV/UAS substring patterns that are FALSE POSITIVES (matched within another word) */
const UAV_FALSE_POSITIVE = /(?:aqua|guav|ouav|zuav|suav|duav|ruav|nuav|quav|huav|buav|euav|akuav)/i;

/** Detect which keyword matched in a company name. Returns null if no match. */
export function detectMatchKeyword(companyName: string): string | null {
  const name = companyName.toLowerCase();
  for (const { keyword, regex } of KEYWORD_PATTERNS) {
    if (regex.test(name)) {
      // For uav/uas: check it's not a false positive (embedded in another word)
      if ((keyword === 'uav' || keyword === 'uas') && UAV_FALSE_POSITIVE.test(name)) {
        continue; // skip — false positive
      }
      return keyword;
    }
  }
  return null;
}

// ─── NAF Blacklist (expanded) ────────────────────────────────────────────────

/** NAF code prefixes that indicate non-drone sectors. Expanded from original waterfall. */
const NAF_BLACKLIST_PREFIXES = [
  '01.', '02.', '03.',  // Agriculture, forestry, fishing
  '10.', '11.', '12.',  // Food manufacturing
  '13.', '14.', '15.',  // Textiles, leather
  '16.', '17.', '18.',  // Wood, paper, printing
  '19.', '20.', '21.',  // Chemicals, pharma
  '23.', '24.', '25.',  // Materials, metals
  '35.',                 // Electricity/gas supply
  '36.', '37.', '38.',  // Water, waste
  '41.', '42.',          // Construction of buildings/civil eng
  '45.',                 // Vehicle trade
  '47.',                 // Retail trade (NEW — catches ACQUAVIVA DISTRIBUTION, clothing retail)
  '49.',                 // Land/water transport (NEW — catches DUAVRANT, SNOWDRONE taxi)
  '55.', '56.',          // Accommodation, food service
  '64.', '65.', '66.',  // Finance, insurance
  '68.',                 // Real estate
  '84.',                 // Public administration
  '85.',                 // Education (NEW — catches drone schools + sports education)
  '86.', '87.', '88.',  // Health, social work
  '90.', '91.', '92.', '93.', '94.', '95.', '96.', '97.', '98.', '99.',
];

export function isBlacklistedNaf(nafCode: string | null): boolean {
  if (!nafCode) return false;
  return NAF_BLACKLIST_PREFIXES.some(prefix => nafCode.startsWith(prefix));
}

// ─── Premium NAF Codes ───────────────────────────────────────────────────────

const PREMIUM_NAF: Record<string, number> = {
  '71.12B': 8,  // Engineering, technical studies
  '71.20B': 8,  // Technical testing & analysis
  '71.12A': 5,  // Architecture + engineering
  '74.90B': 5,  // Other professional activities
  '80.10Z': 5,  // Private security
  '51.10Z': 5,  // Air transport
  '62.01Z': 3,  // Computer programming
  '63.11Z': 3,  // Data processing
  '72.19Z': 5,  // R&D natural sciences
  '30.30Z': 5,  // Aerospace manufacturing
};

// ─── Score Breakdown ─────────────────────────────────────────────────────────

/** Scoring weights for employee band (France) */
const EMP_SCORE: Record<string, number> = {
  'NN': 0, '00': 0, '01': 2, '02': 5, '03': 8,
  '11': 12, '12': 15, '21': 20, '22': 22,
  '31': 25, '32': 25, '41': 28, '42': 30,
  '51': 30, '52': 30, '53': 30,
};

/** Service keywords that boost relevance (+4 each) */
const SERVICE_KEYWORDS = [
  'inspection', 'surveillance', 'sécurité', 'securite', 'services',
  'industrie', 'énergie', 'energie', 'infrastructure', 'maintenance',
];

/** Tech keywords that boost relevance (+2 each) */
const TECH_KEYWORDS = [
  'thermographie', 'photogrammétrie', 'topographie', 'lidar',
  'cartographie', 'ingenierie', 'ingénierie', 'technique',
  'solutions', 'tech', 'system', 'aérien', 'aerien',
];

/** Penalty keywords (-3 each unless offset by positive signal) */
const PENALTY_PATTERNS: Array<{ pattern: RegExp; points: number }> = [
  { pattern: /photo(?!gramm)/i, points: -3 },  // photography but not photogrammetry
  { pattern: /vid[eé]o/i, points: -3 },
  { pattern: /film/i, points: -3 },
  { pattern: /agri|[eé]pandage/i, points: -2 },
];

export interface ScoreBreakdown {
  match_keyword: string | null;
  employee_points: number;
  age_points: number;
  category_points: number;
  legal_form_points: number;
  naf_points: number;
  name_keyword_points: number;
  name_penalty_points: number;
  relevance_total: number;       // naf + name keywords + penalties
  establishment_total: number;   // employee + age + category + legal form
  is_blacklisted_naf: boolean;
  is_false_positive_uav: boolean;
}

/** Compute full score breakdown from raw registry fields */
export function computeScoreBreakdown(row: {
  company_name: string;
  activity_code: string | null;
  employee_band: string | null;
  company_category: string | null;
  legal_form_code: string | null;
  founded_date: string | null;
  country_code: string;
}): ScoreBreakdown {
  const name = row.company_name.toLowerCase();

  // Match keyword
  const match_keyword = detectMatchKeyword(row.company_name);

  // Check false positive (UAV substring in a non-drone word)
  const nameHasUav = /uav|uas/i.test(name);
  const is_false_positive_uav = nameHasUav && !match_keyword && UAV_FALSE_POSITIVE.test(name);

  // NAF blacklist
  const is_blacklisted_naf = isBlacklistedNaf(row.activity_code);

  // Employee points
  const employee_points = (row.country_code === 'FR' && row.employee_band)
    ? (EMP_SCORE[row.employee_band] ?? 0) : 0;

  // Has employees bonus
  const has_emp_bonus = (row.employee_band && row.employee_band !== 'NN' && row.employee_band !== '00') ? 3 : 0;

  // Age points
  let age_points = 0;
  if (row.founded_date) {
    const founded = new Date(row.founded_date);
    const years = (Date.now() - founded.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (years >= 7) age_points = 8;
    else if (years >= 4) age_points = 5;
    else if (years >= 2) age_points = 2;
  }

  // Category points
  let category_points = 0;
  if (row.company_category === 'GE') category_points = 15;
  else if (row.company_category === 'ETI') category_points = 12;
  else if (row.company_category === 'PME') category_points = 5;

  // Legal form points
  let legal_form_points = 0;
  if (row.legal_form_code?.startsWith('57')) legal_form_points = 3;  // SAS
  else if (row.legal_form_code?.startsWith('54')) legal_form_points = 2;  // SARL

  // NAF code bonus
  const naf_points = (row.activity_code && PREMIUM_NAF[row.activity_code]) ? PREMIUM_NAF[row.activity_code] : 0;

  // Name keyword bonuses
  let name_keyword_points = 0;
  for (const kw of SERVICE_KEYWORDS) {
    if (name.includes(kw)) name_keyword_points += 4;
  }
  for (const kw of TECH_KEYWORDS) {
    if (name.includes(kw)) name_keyword_points += 2;
  }

  // Name penalties
  let name_penalty_points = 0;
  for (const { pattern, points } of PENALTY_PATTERNS) {
    if (pattern.test(name)) name_penalty_points += points;
  }

  const relevance_total = naf_points + name_keyword_points + name_penalty_points;
  const establishment_total = employee_points + has_emp_bonus + age_points + category_points + legal_form_points;

  return {
    match_keyword,
    employee_points: employee_points + has_emp_bonus,
    age_points,
    category_points,
    legal_form_points,
    naf_points,
    name_keyword_points,
    name_penalty_points,
    relevance_total,
    establishment_total,
    is_blacklisted_naf,
    is_false_positive_uav,
  };
}

// ─── Confidence Derivation ───────────────────────────────────────────────────

/** Derive confidence level from score breakdown */
export function deriveConfidence(breakdown: ScoreBreakdown): 'high' | 'medium' | 'low' {
  // Low: false positive UAV match, or blacklisted NAF, or no keyword match at all
  if (breakdown.is_false_positive_uav) return 'low';
  if (breakdown.is_blacklisted_naf) return 'low';
  if (!breakdown.match_keyword) return 'low';

  // High: matched on "drone" AND has premium NAF or has employees
  if (
    breakdown.match_keyword === 'drone' &&
    (breakdown.naf_points > 0 || breakdown.employee_points > 3)
  ) {
    return 'high';
  }

  // High: matched on "telepilot" or "rpas" (very specific drone terms)
  if (breakdown.match_keyword === 'telepilot' || breakdown.match_keyword === 'rpas') {
    return 'high';
  }

  // High: matched on word-boundary "uav"/"uas" (not false positive — already filtered above)
  if (
    (breakdown.match_keyword === 'uav' || breakdown.match_keyword === 'uas') &&
    (breakdown.naf_points > 0 || breakdown.employee_points > 3)
  ) {
    return 'high';
  }

  return 'medium';
}
