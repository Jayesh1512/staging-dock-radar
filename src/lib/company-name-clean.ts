/**
 * Clean company names for Apollo API lookup.
 * Strips legal suffixes, parenthetical trade names, and normalizes spacing.
 */

// French legal forms
const FR_SUFFIXES = [
  'SAS', 'SARL', 'EURL', 'SA', 'SCI', 'SNC', 'SASU', 'SELARL',
  'SELAFA', 'SCOP', 'GIE', 'EI', 'EARL', 'GAEC', 'SCA', 'SCS',
  'SELURL', 'SELAS', 'SEP', 'STEF',
];

// Dutch/NL legal forms
const NL_SUFFIXES = [
  'B.V.', 'BV', 'N.V.', 'NV', 'V.O.F.', 'VOF', 'C.V.', 'CV',
  'COÖPERATIE', 'STICHTING',
];

// Generic international
const GENERIC_SUFFIXES = [
  'LTD', 'LTD.', 'LLC', 'INC', 'INC.', 'GMBH', 'AG', 'CO.',
  'CORP', 'CORP.', 'PLC', 'PTY', 'S.L.', 'S.A.', 'S.R.L.',
  'OÜ', 'AB', 'A/S', 'ApS', 'KG', 'OHG', 'UG',
];

const ALL_SUFFIXES = [...FR_SUFFIXES, ...NL_SUFFIXES, ...GENERIC_SUFFIXES];

// Sort longest-first so "B.V." matches before "BV", "LTD." before "LTD"
const sorted = [...ALL_SUFFIXES].sort((a, b) => b.length - a.length);

// Build regex: use lookahead/behind for word-ish boundaries that handle dots
// Match suffix preceded by start-of-string or whitespace, followed by end-of-string, whitespace, or comma
const suffixPattern = new RegExp(
  '(?<=^|\\s)(' + sorted.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?=\\s|,|$)',
  'gi'
);

/**
 * Extract parenthetical trade name if present.
 * e.g. "DSC (DRONE SECURITY CONSULTING)" → "DRONE SECURITY CONSULTING"
 * e.g. "i-TechGroup (i-Techdrone)" → "i-Techdrone"
 */
function extractParenName(name: string): string | null {
  const m = name.match(/\(([^)]{3,})\)/);
  return m ? m[1].trim() : null;
}

export interface CleanedName {
  original: string;
  cleaned: string;          // primary cleaned version
  tradeVariant: string | null; // parenthetical name if found
  variants: string[];       // all variants to try (cleaned first, then trade)
}

export function cleanCompanyName(name: string): CleanedName {
  const original = name.trim();

  // Extract trade name from parentheses
  const tradeVariant = extractParenName(original);

  // Remove parenthetical content
  let cleaned = original.replace(/\([^)]*\)/g, '');

  // Strip legal suffixes
  cleaned = cleaned.replace(suffixPattern, '');

  // Collapse multiple spaces, trim
  cleaned = cleaned.replace(/\s{2,}/g, ' ').replace(/^[-–—\s]+|[-–—\s]+$/g, '').trim();

  // If cleaning reduced to empty or < 2 chars, fall back to original
  if (cleaned.length < 2) cleaned = original;

  const variants: string[] = [cleaned];
  if (tradeVariant && tradeVariant.toLowerCase() !== cleaned.toLowerCase()) {
    variants.push(tradeVariant);
  }
  // Also try original if different from cleaned
  if (original.toLowerCase() !== cleaned.toLowerCase() && !variants.includes(original)) {
    variants.push(original);
  }

  return { original, cleaned, tradeVariant, variants };
}
