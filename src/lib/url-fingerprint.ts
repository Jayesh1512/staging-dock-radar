/**
 * Canonical URL fingerprint for dedup: host + path + meaningful query params.
 * Strips tracking params (utm_*, fbclid, gclid, etc.) so same article with different tracking links matches.
 */

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'msclkid', 'ref', '_ga', 'mc_cid', 'mc_eid',
]);

/**
 * Returns a canonical fingerprint from a URL for dedup.
 * Uses: hostname + pathname + sorted non-tracking query params (key=value).
 */
export function urlFingerprint(url: string): string {
  try {
    const u = new URL(url);
    const hostPath = (u.hostname + u.pathname).toLowerCase().replace(/\/$/, '') || '/';
    const params = new URLSearchParams(u.search);
    const meaningful = Array.from(params.entries())
      .filter(([k]) => !TRACKING_PARAMS.has(k.toLowerCase()))
      .map(([k, v]) => `${k.toLowerCase()}=${v}`)
      .sort();
    const queryPart = meaningful.length ? '?' + meaningful.join('&') : '';
    return hostPath + queryPart;
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Builds dedup key from URL fingerprint + entity fields (company, country, city).
 * Two articles are considered the same story if they match on this key.
 */
export function dedupKey(
  urlFingerprintValue: string,
  company: string | null,
  country: string | null,
  city: string | null,
): string {
  const c = (company ?? '').trim().toLowerCase();
  const co = (country ?? '').trim().toLowerCase();
  const ci = (city ?? '').trim().toLowerCase();
  return `${urlFingerprintValue}|${c}|${co}|${ci}`;
}
