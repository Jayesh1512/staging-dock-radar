/**
 * Domain validation for DJI Dock Hunter QA step.
 *
 * Prevents false-positive dock_verified when the "website" is actually
 * a directory listing, social platform, or other shared domain that
 * would return DJI Dock hits unrelated to the company.
 */

// ── Layer 1: Mega-domain blocklist ──────────────────────────────────
// These are never a company's own domain.  site:{mega} "DJI Dock" will
// always return platform-level noise.

const MEGA_DOMAINS = new Set([
  // Social platforms
  'facebook.com',
  'linkedin.com',
  'nl.linkedin.com',
  'fr.linkedin.com',
  'de.linkedin.com',
  'youtube.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'tiktok.com',
  'reddit.com',
  'pinterest.com',
  'medium.com',
  // Reference / code
  'wikipedia.org',
  'github.com',
  'google.com',
  // French news / directories (false positive sources)
  'journaldugeek.com',
  'entreprises.lefigaro.fr',
  'lefigaro.fr',
  'societe.com',
  'pappers.fr',
  'verif.com',
  'infogreffe.fr',
  'manageo.fr',
  'annuaire-entreprises.data.gouv.fr',
  'pagesjaunes.fr',
  // Dutch news / directories
  'drones.nl',
  'dronewatch.nl',
  'kvk.nl',
]);

// ── Layer 2: Directory URL pattern detection ────────────────────────
// URLs matching these patterns are directory/listing pages, not company sites.

const DIRECTORY_PATH_PATTERNS = [
  /\/bedrijven\//i,       // drones.nl/bedrijven/{slug}
  /\/companies\//i,       // generic directory
  /\/company\//i,         // generic directory (but NOT linkedin.com/company/)
  /\/profiel\//i,         // Dutch profile page
  /\/profile\//i,         // English profile page
  /\/annuaire\//i,        // French directory
  /\/membres\//i,         // French members listing
  /\/partner\//i,         // partner directory listing
  /\/vendor\//i,          // vendor directory listing
];

// ── Layer 3: Known bad LinkedIn patterns ────────────────────────────
// LinkedIn URLs that clearly belong to a platform/directory, not the company.

const BAD_LINKEDIN_PATTERNS = [
  'linkedin.com/company/facebook',
  'linkedin.com/company/linkedin',
  'linkedin.com/company/google',
  'linkedin.com/company/youtube',
  'linkedin.com/company/instagram',
  'linkedin.com/company/businessgovnl',
  'linkedin.com/company/twitter',
  'linkedin.com/jobs',
  'linkedin.com/feed',
  'linkedin.com/login',
];

export type DomainValidationResult = {
  valid: boolean;
  reason:
    | 'ok'
    | 'mega_domain'
    | 'directory_url'
    | 'shared_domain';
  detail: string | null;
};

/**
 * Extracts normalized domain from a URL (strips www.).
 */
function extractDomain(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Validates whether a website domain is suitable for site:{domain} QA search.
 *
 * @param websiteUrl   The company's website URL
 * @param sharedDomains  Set of domains that appear for ≥ 3 companies in the batch
 */
export function validateDomainForQa(
  websiteUrl: string | null | undefined,
  sharedDomains: Set<string>,
): DomainValidationResult {
  const domain = extractDomain(websiteUrl);
  if (!domain) return { valid: false, reason: 'ok', detail: 'no domain' };

  // Layer 1: mega-domain
  if (MEGA_DOMAINS.has(domain)) {
    return {
      valid: false,
      reason: 'mega_domain',
      detail: `${domain} is a social/platform domain, not a company website`,
    };
  }

  // Layer 2: directory URL pattern
  const url = websiteUrl?.trim() ?? '';
  for (const pat of DIRECTORY_PATH_PATTERNS) {
    if (pat.test(url)) {
      return {
        valid: false,
        reason: 'directory_url',
        detail: `URL matches directory pattern: ${pat.source}`,
      };
    }
  }

  // Layer 3: shared domain in batch
  if (sharedDomains.has(domain)) {
    return {
      valid: false,
      reason: 'shared_domain',
      detail: `${domain} is shared by 3+ companies in this batch`,
    };
  }

  return { valid: true, reason: 'ok', detail: null };
}

/**
 * Checks if a website URL is a directory/mega-domain that should NOT
 * take priority over Serper-enriched results in merge logic.
 */
export function isDirectoryOrMegaDomain(websiteUrl: string | null | undefined): boolean {
  const domain = extractDomain(websiteUrl);
  if (!domain) return false;

  if (MEGA_DOMAINS.has(domain)) return true;

  const url = websiteUrl?.trim() ?? '';
  for (const pat of DIRECTORY_PATH_PATTERNS) {
    if (pat.test(url)) return true;
  }

  return false;
}

/**
 * Validates a LinkedIn URL — returns false if it's a known polluted value.
 */
export function isValidLinkedIn(linkedinUrl: string | null | undefined): boolean {
  if (!linkedinUrl?.trim()) return true; // empty is fine, not polluted
  const lower = linkedinUrl.toLowerCase();
  return !BAD_LINKEDIN_PATTERNS.some((pat) => lower.includes(pat));
}

/**
 * Builds a set of shared domains from work rows.
 * A domain appearing for ≥ threshold companies is considered shared.
 *
 * Optionally groups by source — if sourceGroups is provided, shared-domain
 * detection runs per-source-group (so a domain shared across different
 * sources is only flagged if it repeats within a single source group).
 */
export function buildSharedDomainSet(
  rows: { website: string | null; source?: string | null }[],
  threshold = 3,
): Set<string> {
  const domainCount = new Map<string, number>();

  for (const row of rows) {
    const domain = extractDomain(row.website);
    if (!domain) continue;
    domainCount.set(domain, (domainCount.get(domain) ?? 0) + 1);
  }

  const shared = new Set<string>();
  for (const [domain, count] of domainCount) {
    if (count >= threshold) shared.add(domain);
  }

  return shared;
}
