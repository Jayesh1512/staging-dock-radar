import { createClient } from '@supabase/supabase-js';
import { runSerperVerify } from '@/lib/qa-agent/serper-verify';
import { mergeDockModels } from '@/lib/qa-agent/confidence';
import type { VerifyBatchRequest } from '@/lib/qa-agent/types';

export const maxDuration = 300;

// ── Evidence helpers ──

interface EvidenceEntry {
  url: string;
  source: string;         // serper, chatgpt, comet, linkedin_puppeteer, manual
  type: string;           // product_page, website_mention, linkedin_post, case_study, news
  found_at: string;       // ISO timestamp
  dock_models: string[];  // ["2", "3"]
  hits?: number;          // serper hit count
  relevance?: string;     // direct, indirect, mention_only
}

/** Pick best evidence URL from array: product_page > website_mention > linkedin_post > case_study */
const TYPE_PRIORITY: Record<string, number> = {
  product_page: 1,
  website_mention: 2,
  linkedin_post: 3,
  case_study: 4,
  news: 5,
};

function pickBestEvidenceUrl(evidence: EvidenceEntry[]): string | null {
  if (evidence.length === 0) return null;
  const sorted = [...evidence].sort((a, b) => (TYPE_PRIORITY[a.type] ?? 99) - (TYPE_PRIORITY[b.type] ?? 99));
  return sorted[0].url;
}

/** Parse dock model numbers from variant string like "Dock 3, Dock 2" → ["2","3"] */
function parseDockModelNumbers(variant: string | null): string[] {
  if (!variant) return [];
  const matches = variant.match(/\d/g);
  return [...new Set(matches ?? [])].sort();
}

/** Merge dock models from evidence array → "Dock 1, 2, 3" */
function mergeAllDockModels(evidence: EvidenceEntry[], existingModels: string | null): string {
  const nums = new Set<string>();
  // From evidence array
  for (const e of evidence) {
    for (const m of e.dock_models) nums.add(m);
  }
  // From existing dock_models field
  if (existingModels) {
    const existing = existingModels.match(/\d/g);
    if (existing) existing.forEach(n => nums.add(n));
  }
  if (nums.size === 0) {
    // Check if any evidence mentions dock generically
    if (evidence.length > 0) return 'DJI Dock';
    return existingModels || '';
  }
  return 'Dock ' + [...nums].sort().join(', ');
}

/**
 * POST /api/registry/verify-batch
 *
 * DB-driven DJI Dock verification via Serper site-search.
 *
 * KEY PRINCIPLE: Serper APPENDS, never overrides.
 * - If a record already has evidence (from ChatGPT, Comet, LinkedIn, etc.),
 *   Serper adds its own evidence alongside. It never sets dock_verified=false
 *   or clears existing evidence.
 * - Runs on ALL records with a website (including already-verified ones)
 *   to capture Serper data even for pre-confirmed companies.
 *
 * Body: { countryCodes: string[], dryRun?: boolean, offset?: number, limit?: number }
 */
export async function POST(req: Request) {
  const body: VerifyBatchRequest = await req.json();
  const countryCodes = body.countryCodes ?? ['FR', 'NL'];
  const dryRun = body.dryRun ?? false;
  const offset = body.offset ?? 0;
  const limit = body.limit ?? (dryRun ? 30 : 500);

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const serperKey = process.env.SERPER_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Supabase credentials missing' }), { status: 500 });
  }
  if (!serperKey) {
    return new Response(JSON.stringify({ error: 'SERPER_API_KEY not set' }), { status: 500 });
  }

  const db = createClient(supabaseUrl, supabaseKey);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      };

      try {
        send({ type: 'log', data: `DJI Dock Verification — ${countryCodes.join(', ')}${dryRun ? ' [DRY RUN]' : ''}` });

        // ── 1. Fetch ALL records with website (including already-verified) ──
        // We run Serper on everything to capture serper_hits even for pre-confirmed records
        const { data: records, error: fetchErr } = await db
          .from('country_registered_companies')
          .select('id,company_name,website,linkedin,country_code,signal_source,dock_verified,dock_models,evidence_url,evidence,dock_qa_status,serper_hits')
          .in('country_code', countryCodes)
          .not('website', 'is', null)
          .order('country_code')
          .range(offset, offset + limit - 1);

        if (fetchErr || !records) {
          send({ type: 'error', data: fetchErr?.message ?? 'Failed to fetch records' });
          controller.close();
          return;
        }

        // Skip records where Serper was ALREADY run (serper_hits is not null)
        const needsSerper = records.filter(r => r.serper_hits === null || r.serper_hits === undefined);
        const alreadyScanned = records.length - needsSerper.length;

        send({ type: 'log', data: `Total records with website: ${records.length}` });
        send({ type: 'log', data: `Already Serper-scanned: ${alreadyScanned} (skipped)` });
        send({ type: 'log', data: `Needs Serper scan: ${needsSerper.length}` });

        // ── 2. Dedup by domain ──
        const domainMap = new Map<string, typeof needsSerper>();

        for (const rec of needsSerper) {
          const domain = extractDomain(rec.website);
          if (!domain) continue;

          if (!domainMap.has(domain)) {
            domainMap.set(domain, []);
          }
          domainMap.get(domain)!.push(rec);
        }

        const uniqueDomains = [...domainMap.keys()];
        const deduped = needsSerper.length - uniqueDomains.length;

        send({ type: 'log', data: `Unique domains to check: ${uniqueDomains.length} (${deduped} duplicates)` });
        send({ type: 'log', data: `Serper credits needed: ${uniqueDomains.length}` });

        // ── 3. Verify each domain ──
        const stats = {
          total: uniqueDomains.length,
          confirmed: 0,
          direct: 0,
          indirect: 0,
          mention_only: 0,
          not_found: 0,
          errors: 0,
          records_updated: 0,
          preserved: 0,    // records where existing evidence was preserved (Serper 0 but prior evidence exists)
        };
        const notFoundDomains: string[] = [];
        const now = new Date().toISOString();

        for (let i = 0; i < uniqueDomains.length; i++) {
          const domain = uniqueDomains[i];
          const recs = domainMap.get(domain)!;
          const primaryRec = recs[0];

          const result = await runSerperVerify(domain, serperKey);

          if (result.error) {
            stats.errors++;
            send({ type: 'progress', data: {
              index: i + 1, total: uniqueDomains.length,
              domain, name: primaryRec.company_name,
              status: 'error', error: result.error,
            }});
          } else if (result.found) {
            // ── SERPER FOUND DJI DOCK ──
            stats.confirmed++;
            if (result.relevance === 'direct') stats.direct++;
            else if (result.relevance === 'indirect') stats.indirect++;
            else stats.mention_only++;

            send({ type: 'progress', data: {
              index: i + 1, total: uniqueDomains.length,
              domain, name: primaryRec.company_name,
              status: 'confirmed',
              hits: result.hits,
              variant: result.variant,
              relevance: result.relevance,
              evidence: result.best_url,
              records: recs.length,
            }});

            if (!dryRun) {
              for (const rec of recs) {
                // Build new Serper evidence entry
                const serperEvidence: EvidenceEntry = {
                  url: result.best_url ?? '',
                  source: 'serper',
                  type: result.relevance === 'direct' ? 'product_page' : 'website_mention',
                  found_at: now,
                  dock_models: parseDockModelNumbers(result.variant),
                  hits: result.hits,
                  relevance: result.relevance,
                };

                // Merge with existing evidence array
                const existingEvidence: EvidenceEntry[] = Array.isArray(rec.evidence) ? rec.evidence : [];
                // Remove prior serper entries (replace with fresh)
                const filtered = existingEvidence.filter(e => e.source !== 'serper');
                const mergedEvidence = [...filtered, serperEvidence];

                // Merge dock models from all evidence
                const dockModels = mergeAllDockModels(mergedEvidence, rec.dock_models);
                const bestUrl = pickBestEvidenceUrl(mergedEvidence);

                await db.from('country_registered_companies').update({
                  dock_verified: true,
                  dock_models: dockModels || null,
                  serper_hits: result.hits,
                  evidence_url: bestUrl,
                  evidence: mergedEvidence,
                  dock_relevance: result.relevance,
                  dock_qa_status: 'verified',
                  verified_at: now,
                  updated_at: now,
                }).eq('id', rec.id);
                stats.records_updated++;
              }
            }
          } else {
            // ── SERPER FOUND NOTHING ──
            stats.not_found++;
            notFoundDomains.push(domain);

            if ((i + 1) % 20 === 0 || i === uniqueDomains.length - 1) {
              send({ type: 'progress', data: {
                index: i + 1, total: uniqueDomains.length,
                domain, name: primaryRec.company_name,
                status: 'not_found',
              }});
            }

            if (!dryRun) {
              for (const rec of recs) {
                // KEY: Check if this record already has evidence from another source
                const hasExistingEvidence = rec.dock_verified === true
                  || (rec.evidence_url && rec.evidence_url.length > 0)
                  || (rec.dock_models && rec.dock_models.length > 0)
                  || (Array.isArray(rec.evidence) && rec.evidence.length > 0);

                if (hasExistingEvidence) {
                  // PRESERVE: Only add serper_hits=0, don't touch anything else
                  await db.from('country_registered_companies').update({
                    serper_hits: 0,
                    updated_at: now,
                  }).eq('id', rec.id);
                  stats.preserved++;
                } else {
                  // No prior evidence → mark as verified-no-dock
                  await db.from('country_registered_companies').update({
                    dock_verified: false,
                    serper_hits: 0,
                    dock_qa_status: 'verified',
                    verified_at: now,
                    updated_at: now,
                  }).eq('id', rec.id);
                }
                stats.records_updated++;
              }
            }
          }

          // Rate limit: 500ms between Serper calls
          if (i < uniqueDomains.length - 1) await sleep(500);
        }

        // ── 4. Identify Puppeteer candidates ──
        const puppeteerCandidates: Array<{ name: string; domain: string; linkedin: string; source: string }> = [];
        const HIGH_VALUE_SOURCES = ['dji_dealer', 'google_search', 'comet', 'chatgpt'];

        for (const domain of notFoundDomains) {
          const recs = domainMap.get(domain);
          if (!recs) continue;
          for (const rec of recs) {
            // Only if no existing evidence AND from high-value source AND has LinkedIn
            const hasExisting = rec.dock_verified === true || (rec.evidence_url && rec.evidence_url.length > 0);
            if (!hasExisting && HIGH_VALUE_SOURCES.includes(rec.signal_source) && rec.linkedin) {
              puppeteerCandidates.push({
                name: rec.company_name,
                domain,
                linkedin: rec.linkedin,
                source: rec.signal_source,
              });
              break;
            }
          }
        }

        // ── 5. Summary ──
        send({
          type: 'summary',
          data: {
            ...stats,
            puppeteerCandidates: puppeteerCandidates.length,
            puppeteerList: puppeteerCandidates,
            dryRun,
          },
        });

        if (stats.preserved > 0) {
          send({ type: 'log', data: `\nPreserved ${stats.preserved} records with existing evidence (Serper 0 but prior sources confirmed)` });
        }

        if (puppeteerCandidates.length > 0) {
          send({ type: 'log', data: `\nPuppeteer deep-scan candidates (${puppeteerCandidates.length}):` });
          puppeteerCandidates.forEach(c => {
            send({ type: 'log', data: `  ${c.name} (${c.source}) → ${c.linkedin}` });
          });
        }

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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractDomain(website: string | null): string | null {
  if (!website) return null;
  try {
    const u = new URL(website.startsWith('http') ? website : `https://${website}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
