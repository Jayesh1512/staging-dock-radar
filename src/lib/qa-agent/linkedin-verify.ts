import type { LinkedInVerifyResult } from './types';

/**
 * Check LinkedIn company page for DJI Dock mentions via Serper.
 * Runs `site:linkedin.com/company/slug "DJI Dock"`.
 * Cost: 1 Serper credit.
 */
export async function runLinkedInVerify(
  linkedinUrl: string,
  apiKey: string,
): Promise<LinkedInVerifyResult> {
  // Extract company slug from LinkedIn URL
  const match = linkedinUrl.match(/linkedin\.com\/company\/([^/?]+)/);
  if (!match) {
    return { found: false, mentions: 0, best_url: null, error: 'Invalid LinkedIn URL' };
  }

  const slug = match[1];
  const query = `site:linkedin.com/company/${slug} "DJI Dock"`;

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: 5 }),
    });

    if (!res.ok) {
      return { found: false, mentions: 0, best_url: null, error: `Serper ${res.status}` };
    }

    const data = await res.json();
    const organic: Array<{ link: string; title: string; snippet: string }> = data.organic ?? [];

    return {
      found: organic.length > 0,
      mentions: organic.length,
      best_url: organic[0]?.link ?? null,
      error: null,
    };
  } catch (err) {
    return {
      found: false,
      mentions: 0,
      best_url: null,
      error: err instanceof Error ? err.message : 'fetch failed',
    };
  }
}
