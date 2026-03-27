import { NextRequest } from 'next/server';
import { runSerperVerify } from '@/lib/qa-agent/serper-verify';
import { runLinkedInVerify } from '@/lib/qa-agent/linkedin-verify';
import { computeConfidence, pickEvidenceUrl, mergeDockModels, CONFIDENCE_FORMULA_NOTE } from '@/lib/qa-agent/confidence';
import { generateQAReport } from '@/lib/qa-agent/report-html';
import type { QACompanyInput, QACompanyOutput, QASummary, QAStreamEvent } from '@/lib/qa-agent/types';

export const maxDuration = 300; // 5 min for large batches

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const companies: QACompanyInput[] = body.companies ?? [];
  const country: string = body.country ?? 'Unknown';
  const runLabel: string = body.runLabel ?? `${country} QA Run`;
  const skipSerper: boolean = body.skipSerper === true;
  const skipLinkedin: boolean = body.skipLinkedin === true;

  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey && !skipSerper) {
    return new Response(
      JSON.stringify({ error: 'SERPER_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (companies.length === 0) {
    return new Response(
      JSON.stringify({ error: 'No companies provided' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: QAStreamEvent) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      }

      try {
        emit({ type: 'log', data: `QA Agent v1 — Verifying ${companies.length} companies for ${country}` });
        emit({ type: 'log', data: `Serper: ${skipSerper ? 'SKIPPED' : 'enabled'} · LinkedIn: ${skipLinkedin ? 'SKIPPED' : 'enabled'}` });

        const results: QACompanyOutput[] = [];
        let serperCredits = 0;

        for (let i = 0; i < companies.length; i++) {
          const c = companies[i];
          emit({ type: 'progress', data: { current: i + 1, total: companies.length, name: c.name } });

          // ── Step 5: Serper site-search ──
          let serperResult = null;
          if (!skipSerper && apiKey && c.domain) {
            serperResult = await runSerperVerify(c.domain, apiKey);
            serperCredits++;
            emit({
              type: 'step',
              data: {
                name: c.name,
                step: 'serper',
                found: serperResult.found,
                hits: serperResult.hits,
                variant: serperResult.variant,
              },
            });
          }

          // ── Step 6: LinkedIn (Serper-based) ──
          let linkedinResult = null;
          if (!skipLinkedin && apiKey && c.linkedin_url) {
            linkedinResult = await runLinkedInVerify(c.linkedin_url, apiKey);
            serperCredits++;
            emit({
              type: 'step',
              data: {
                name: c.name,
                step: 'linkedin',
                found: linkedinResult.found,
                mentions: linkedinResult.mentions,
              },
            });
          }

          // ── Aggregate sources ──
          const sourcesConfirmed: string[] = [...c.sources_preloaded];
          if (serperResult?.found) sourcesConfirmed.push('serper_website');
          if (linkedinResult?.found) sourcesConfirmed.push('linkedin_posts');

          // Confidence
          const { score, level } = computeConfidence(sourcesConfirmed, {
            serper_hits: serperResult?.hits,
            linkedin_mentions: linkedinResult?.mentions,
          });

          // Dock models
          const dockModels = mergeDockModels(c.dock_models_preloaded ?? null, serperResult?.variant ?? null);
          const dockConfirmed = dockModels !== '' || sourcesConfirmed.length > 1 || (serperResult?.found ?? false) || (linkedinResult?.found ?? false);

          // Evidence URL
          const evidenceUrl = pickEvidenceUrl(
            serperResult?.best_url ?? null,
            linkedinResult?.best_url ?? null,
            c.evidence_url_preloaded ?? null,
            c.website ?? null,
          );

          // Evidence summary
          const parts: string[] = [];
          for (const s of sourcesConfirmed) {
            const labels: Record<string, string> = {
              dji_dealer: 'DJI Dealer',
              google_search: 'Google Search',
              comet: 'Comet',
              chatgpt: 'ChatGPT',
              serper_website: `Serper (${serperResult?.hits ?? 0} hits)`,
              linkedin_posts: `LinkedIn (${linkedinResult?.mentions ?? 0})`,
            };
            parts.push(labels[s] ?? s);
          }
          const evidenceSummary = parts.join(' + ') || 'No sources confirmed';

          // Notes
          const notesParts: string[] = [];
          if (c.notes_preloaded) notesParts.push(c.notes_preloaded);
          if (serperResult?.found) notesParts.push(`Website: ${serperResult.hits} pages mention DJI Dock`);
          if (serperResult && !serperResult.found && !serperResult.error) notesParts.push('Website: no Dock mention found');
          if (linkedinResult?.found) notesParts.push(`LinkedIn: ${linkedinResult.mentions} DJI Dock posts`);
          if (serperResult?.error) notesParts.push(`Serper error: ${serperResult.error}`);

          const output: QACompanyOutput = {
            name: c.name,
            domain: c.domain,
            country: c.country,
            city: c.city ?? null,
            role: c.role ?? 'unknown',
            website: c.website ?? null,
            linkedin_url: c.linkedin_url ?? null,
            dock_confirmed: dockConfirmed,
            dock_models: dockModels,
            confidence: level,
            confidence_score: score,
            sources_confirmed: sourcesConfirmed,
            evidence_url: evidenceUrl,
            evidence_summary: evidenceSummary,
            serper: serperResult,
            linkedin: linkedinResult,
            notes: notesParts.join('. '),
          };

          results.push(output);
          emit({ type: 'result', data: output });

          // Polite delay between companies
          if (i < companies.length - 1) await delay(300);
        }

        // ── Sort by confidence score descending ──
        results.sort((a, b) => b.confidence_score - a.confidence_score);

        // ── Summary ──
        const summary: QASummary = {
          total: results.length,
          confirmed: results.filter(r => r.dock_confirmed).length,
          high: results.filter(r => r.confidence === 'high').length,
          medium: results.filter(r => r.confidence === 'medium').length,
          low: results.filter(r => r.confidence === 'low').length,
          none: results.filter(r => r.confidence === 'none').length,
          serper_credits_used: serperCredits,
        };
        emit({ type: 'summary', data: summary });

        // ── Generate HTML report ──
        try {
          const reportPath = generateQAReport(results, summary, country, runLabel);
          emit({ type: 'report', data: { path: reportPath } });
        } catch (reportErr) {
          emit({ type: 'log', data: `Report generation failed: ${reportErr instanceof Error ? reportErr.message : 'unknown'}` });
        }

        emit({ type: 'done', data: null });
      } catch (err) {
        emit({ type: 'error', data: err instanceof Error ? err.message : 'Unknown error' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
    },
  });
}
