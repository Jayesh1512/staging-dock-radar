/**
 * CASA ReOC / registry helper: count how often a company name appears on a page
 * (normalized full legal name + optional AU "core" brand after stripping PTY LTD).
 * Used by scripts/casa-reoc-filter-dji-dock.ts and kept in sync with Dock Radar patterns.
 */

import * as cheerio from "cheerio";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Registry names sometimes start with "."; sites usually omit it. */
export function stripLeadingDots(company: string): string {
  return company.replace(/^\.+/, "").trim();
}

/** Lowercase, collapse whitespace, treat hyphens/dashes as spaces — same for page + name. */
export function softNormalize(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/[-–—]+/g, " ")
    .toLowerCase()
    .trim();
}

/** Trailing Australian company suffix (registry vs marketing name). */
const AU_COMPANY_SUFFIX =
  /\s+(?:pty\.?\s*ltd\.?|p\.?l\.?|proprietary\s+limited|limited)\s*\.?$/i;

export function stripTrailingAuCompanySuffix(normalizedLower: string): string {
  return normalizedLower.replace(AU_COMPANY_SUFFIX, "").trim();
}

function countNonOverlappingSubstring(haystack: string, needle: string): number {
  if (!needle.length) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

function countWordBounded(haystack: string, needle: string): number {
  if (needle.length < 2) return 0;
  const re = new RegExp(`\\b${escapeRegExp(needle)}\\b`, "gi");
  return haystack.match(re)?.length ?? 0;
}

export type NameMatchStats = {
  effective: number;
  fullLegal: number;
  coreBrand: number;
  coreNeedle: string | null;
};

/**
 * Parse HTML with cheerio, normalize body text, count full legal + core brand mentions.
 */
export function analyzeCompanyNameOnPage(html: string, companyName: string): NameMatchStats {
  const fullNorm = softNormalize(stripLeadingDots(companyName));
  if (!fullNorm) {
    return { effective: 0, fullLegal: 0, coreBrand: 0, coreNeedle: null };
  }

  const $ = cheerio.load(html);
  const pageNorm = softNormalize($("body").text());

  const fullLegal = countNonOverlappingSubstring(pageNorm, fullNorm);

  const coreRaw = stripTrailingAuCompanySuffix(fullNorm);
  let coreBrand = 0;
  let coreNeedle: string | null = null;

  const coreDistinct = coreRaw !== fullNorm;
  const coreLongEnough = coreRaw.length >= 5;

  if (coreDistinct && coreLongEnough) {
    coreNeedle = coreRaw;
    coreBrand = countWordBounded(pageNorm, coreRaw);
  }

  const effective = Math.max(fullLegal, coreBrand);
  return { effective, fullLegal, coreBrand, coreNeedle };
}
