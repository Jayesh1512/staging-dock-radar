import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cleanCompanyName } from '@/lib/company-name-clean';

export const maxDuration = 300; // 5 min

/**
 * POST /api/registry/enrich-batch
 *
 * Three-track enrichment for country_registered_companies:
 *   Track A: Records with no website & no LinkedIn → Apollo with cleaned names
 *   Track B: Records with website but no LinkedIn → Serper LinkedIn lookup
 *   Track C: Records with LinkedIn but no website → Serper domain lookup
 *
 * Body: { countryCodes: string[], dryRun?: boolean }
 * Response: Streaming NDJSON
 */
export async function POST(req: Request) {
  const body = await req.json() as {
    countryCodes?: string[];
    dryRun?: boolean;
  };

  const countryCodes = body.countryCodes ?? ['FR', 'NL'];
  const dryRun = body.dryRun ?? false;

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const serperKey = process.env.SERPER_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase credentials missing' }, { status: 500 });
  }

  const db = createClient(supabaseUrl, supabaseKey);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      };

      try {
        send({ type: 'log', data: `Enrichment batch starting for ${countryCodes.join(', ')}${dryRun ? ' [DRY RUN]' : ''}` });

        // ── Fetch all records needing enrichment ──
        const { data: allRecords, error: fetchErr } = await db
          .from('country_registered_companies')
          .select('id,company_name,trade_name,website,linkedin,country_code,signal_source')
          .in('country_code', countryCodes);

        if (fetchErr || !allRecords) {
          send({ type: 'error', data: fetchErr?.message ?? 'Failed to fetch records' });
          controller.close();
          return;
        }

        const trackA = allRecords.filter(r => !r.website && !r.linkedin);         // no website, no LI
        const trackB = allRecords.filter(r => r.website && !r.linkedin);           // website, no LI
        const trackC = allRecords.filter(r => !r.website && r.linkedin);           // LI, no website

        send({ type: 'log', data: `Found ${allRecords.length} total records` });
        send({ type: 'log', data: `Track A (Apollo — no website, no LI): ${trackA.length}` });
        send({ type: 'log', data: `Track B (Serper — website, no LI): ${trackB.length}` });
        send({ type: 'log', data: `Track C (Serper — LI, no website): ${trackC.length}` });

        const stats = {
          trackA: { total: trackA.length, found_both: 0, found_website: 0, found_linkedin: 0, failed: 0 },
          trackB: { total: trackB.length, found: 0, failed: 0 },
          trackC: { total: trackC.length, found: 0, failed: 0 },
        };

        // ── TRACK A: Apollo with cleaned names ──
        send({ type: 'log', data: '\n━━━ TRACK A: Apollo Org Enrichment ━━━' });

        for (let i = 0; i < trackA.length; i++) {
          const rec = trackA[i];
          const cleaned = cleanCompanyName(rec.company_name);
          let website: string | null = null;
          let linkedin: string | null = null;

          // Try each name variant until we get a result
          for (const variant of cleaned.variants) {
            const result = await apolloCompanySearch(variant);
            if (result.domain || result.linkedinUrl) {
              website = result.domain ? (result.domain.startsWith('http') ? result.domain : `https://${result.domain}`) : null;
              linkedin = result.linkedinUrl ?? null;
              send({
                type: 'progress',
                data: {
                  track: 'A', index: i + 1, total: trackA.length,
                  name: rec.company_name, variant,
                  website, linkedin,
                  status: website && linkedin ? 'both' : website ? 'website_only' : 'linkedin_only',
                },
              });
              break;
            }
            // 300ms delay between Apollo calls
            await sleep(300);
          }

          if (!website && !linkedin) {
            stats.trackA.failed++;
            if ((i + 1) % 20 === 0 || i === trackA.length - 1) {
              send({ type: 'progress', data: { track: 'A', index: i + 1, total: trackA.length, name: rec.company_name, status: 'not_found' } });
            }
          } else {
            if (website && linkedin) stats.trackA.found_both++;
            else if (website) stats.trackA.found_website++;
            else stats.trackA.found_linkedin++;

            // Update DB
            if (!dryRun) {
              const update: Record<string, unknown> = { updated_at: new Date().toISOString(), enriched_at: new Date().toISOString() };
              if (website) update.website = website;
              if (linkedin) update.linkedin = linkedin;
              if (website) update.dock_qa_status = 'enriched';

              await db.from('country_registered_companies').update(update).eq('id', rec.id);
            }
          }

          // Rate limit: 300ms between calls
          if (i < trackA.length - 1) await sleep(300);
        }

        send({
          type: 'track_done',
          data: {
            track: 'A',
            ...stats.trackA,
            summary: `Apollo: ${stats.trackA.found_both} both, ${stats.trackA.found_website} website-only, ${stats.trackA.found_linkedin} LI-only, ${stats.trackA.failed} not found`,
          },
        });

        // ── TRACK B: Apollo domain-enrich first (free), then Serper fallback ──
        if (trackB.length > 0) {
          send({ type: 'log', data: '\n━━━ TRACK B: LinkedIn Lookup (Apollo → Serper fallback) ━━━' });
          let serperFallbackCount = 0;

          for (let i = 0; i < trackB.length; i++) {
            const rec = trackB[i];
            let linkedinUrl: string | null = null;

            // Step 1: Try Apollo org enrich by domain (free, 0 credits)
            const domain = extractDomain(rec.website);
            if (domain) {
              const apolloResult = await apolloOrgEnrich(domain);
              linkedinUrl = apolloResult.linkedinUrl;
            }

            // Step 2: If Apollo didn't find LinkedIn, try Serper (1 credit)
            if (!linkedinUrl && serperKey) {
              const cleaned = cleanCompanyName(rec.company_name);
              linkedinUrl = await serperLinkedInLookup(cleaned.cleaned, rec.country_code, serperKey);
              if (linkedinUrl) serperFallbackCount++;
            }

            if (linkedinUrl) {
              stats.trackB.found++;
              send({
                type: 'progress',
                data: { track: 'B', index: i + 1, total: trackB.length, name: rec.company_name, linkedin: linkedinUrl, status: 'found' },
              });

              if (!dryRun) {
                await db.from('country_registered_companies')
                  .update({ linkedin: linkedinUrl, updated_at: new Date().toISOString(), enriched_at: new Date().toISOString() })
                  .eq('id', rec.id);
              }
            } else {
              stats.trackB.failed++;
              if ((i + 1) % 20 === 0 || i === trackB.length - 1) {
                send({ type: 'progress', data: { track: 'B', index: i + 1, total: trackB.length, name: rec.company_name, status: 'not_found' } });
              }
            }

            if (i < trackB.length - 1) await sleep(300);
          }

          send({ type: 'log', data: `Track B Serper fallback used: ${serperFallbackCount} credits` });

          send({
            type: 'track_done',
            data: { track: 'B', ...stats.trackB, summary: `Serper LI: ${stats.trackB.found} found, ${stats.trackB.failed} not found` },
          });
        }

        // ── TRACK C: Serper domain lookup for LinkedIn-only records ──
        if (serperKey && trackC.length > 0) {
          send({ type: 'log', data: '\n━━━ TRACK C: Serper Domain Lookup ━━━' });

          for (let i = 0; i < trackC.length; i++) {
            const rec = trackC[i];
            const cleaned = cleanCompanyName(rec.company_name);
            const website = await serperDomainLookup(cleaned.cleaned, rec.country_code, serperKey);

            if (website) {
              stats.trackC.found++;
              send({
                type: 'progress',
                data: { track: 'C', index: i + 1, total: trackC.length, name: rec.company_name, website, status: 'found' },
              });

              if (!dryRun) {
                await db.from('country_registered_companies')
                  .update({ website, dock_qa_status: 'enriched', updated_at: new Date().toISOString(), enriched_at: new Date().toISOString() })
                  .eq('id', rec.id);
              }
            } else {
              stats.trackC.failed++;
            }

            if (i < trackC.length - 1) await sleep(500);
          }

          send({
            type: 'track_done',
            data: { track: 'C', ...stats.trackC, summary: `Serper domain: ${stats.trackC.found} found, ${stats.trackC.failed} not found` },
          });
        } else if (trackC.length > 0) {
          send({ type: 'log', data: 'SKIP Track C — SERPER_API_KEY not set' });
        }

        // ── Final summary ──
        const totalFound = stats.trackA.found_both + stats.trackA.found_website + stats.trackA.found_linkedin + stats.trackB.found + stats.trackC.found;
        const totalAttempted = trackA.length + trackB.length + trackC.length;

        send({
          type: 'summary',
          data: {
            totalAttempted,
            totalFound,
            hitRate: totalAttempted > 0 ? Math.round((totalFound / totalAttempted) * 100) + '%' : '0%',
            trackA: stats.trackA,
            trackB: stats.trackB,
            trackC: stats.trackC,
            dryRun,
            serperCreditsUsed: 'see track logs for actual Serper usage',
          },
        });

        send({ type: 'done' });
      } catch (err) {
        send({ type: 'error', data: err instanceof Error ? err.message : 'Unknown error' });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' },
  });
}

// ── Helpers ──

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function apolloHeaders() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY not set');
  return { 'x-api-key': key, 'Content-Type': 'application/json', accept: 'application/json' };
}

/**
 * Apollo Company Search — finds domain + LinkedIn by company name.
 * Uses POST /mixed_companies/search (free, 0 credits).
 */
async function apolloCompanySearch(companyName: string): Promise<{ domain: string | null; linkedinUrl: string | null }> {
  try {
    const res = await fetch('https://api.apollo.io/api/v1/mixed_companies/search', {
      method: 'POST',
      headers: apolloHeaders(),
      body: JSON.stringify({ q_organization_name: companyName, per_page: 1 }),
    });
    if (!res.ok) return { domain: null, linkedinUrl: null };
    const data = await res.json() as {
      accounts?: Array<{ domain?: string; linkedin_url?: string; website_url?: string }>;
    };
    const acct = data.accounts?.[0];
    return {
      domain: acct?.domain ?? null,
      linkedinUrl: acct?.linkedin_url ?? null,
    };
  } catch {
    return { domain: null, linkedinUrl: null };
  }
}

/**
 * Apollo Org Enrich — gets LinkedIn by domain.
 * Uses GET /organizations/enrich?domain=X (free, 0 credits).
 */
async function apolloOrgEnrich(domain: string): Promise<{ linkedinUrl: string | null }> {
  try {
    const res = await fetch(
      `https://api.apollo.io/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`,
      { headers: apolloHeaders() },
    );
    if (!res.ok) return { linkedinUrl: null };
    const data = await res.json() as {
      organization?: { linkedin_url?: string };
    };
    return { linkedinUrl: data.organization?.linkedin_url ?? null };
  } catch {
    return { linkedinUrl: null };
  }
}

/**
 * Extract domain from a website URL.
 * e.g. "https://www.escadrone.com/something" → "escadrone.com"
 */
function extractDomain(website: string | null): string | null {
  if (!website) return null;
  try {
    const u = new URL(website.startsWith('http') ? website : `https://${website}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Serper: search for company LinkedIn page
 * Query: "company name" site:linkedin.com/company
 * Returns first matching LinkedIn URL or null
 */
async function serperLinkedInLookup(
  companyName: string,
  countryCode: string,
  apiKey: string,
): Promise<string | null> {
  try {
    const gl = countryCode.toLowerCase();
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: `"${companyName}" site:linkedin.com/company`,
        gl,
        num: 3,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json() as { organic?: Array<{ link: string }> };
    const match = data.organic?.find(r =>
      r.link.includes('linkedin.com/company/') &&
      !r.link.includes('/posts') &&
      !r.link.includes('/jobs')
    );
    return match?.link ?? null;
  } catch {
    return null;
  }
}

/**
 * Serper: search for company website
 * Query: "company name" country -site:linkedin.com -site:facebook.com
 * Returns first plausible domain or null
 */
async function serperDomainLookup(
  companyName: string,
  countryCode: string,
  apiKey: string,
): Promise<string | null> {
  try {
    const gl = countryCode.toLowerCase();
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: `"${companyName}" -site:linkedin.com -site:facebook.com -site:twitter.com`,
        gl,
        num: 5,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json() as { organic?: Array<{ link: string; title: string }> };

    // Exclude social/marketplace/directory sites
    const EXCLUDE = ['linkedin.com', 'facebook.com', 'twitter.com', 'youtube.com',
      'amazon.', 'ebay.', 'wikipedia.org', 'yelp.com', 'trustpilot.com',
      'societe.com', 'pappers.fr', 'infogreffe.fr', 'kvk.nl', 'opencorporates.com'];

    const match = data.organic?.find(r => {
      const url = r.link.toLowerCase();
      return !EXCLUDE.some(ex => url.includes(ex));
    });

    if (!match) return null;

    // Extract clean URL (just scheme + domain)
    try {
      const u = new URL(match.link);
      return `${u.protocol}//${u.hostname}`;
    } catch {
      return match.link;
    }
  } catch {
    return null;
  }
}
