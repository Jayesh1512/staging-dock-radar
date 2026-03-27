import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/verify-dock-mention
 *
 * For each company domain, runs `site:domain "DJI Dock"` via Serper.
 * Returns whether the website mentions DJI Dock and the matching pages.
 *
 * Body: { companies: Array<{ name, domain, linkedin_url? }> }
 *
 * Uses ~1 Serper credit per company.
 */

interface CompanyInput {
  name: string;
  domain: string;
  linkedin_url?: string | null;
}

interface DockMention {
  url: string;
  title: string;
  snippet: string;
}

interface VerifyResult {
  name: string;
  domain: string;
  linkedin_url: string | null;
  dock_found: boolean;
  dock_mentions: number;
  dock_variant: string | null; // "Dock 2", "Dock 3", etc.
  mentions: DockMention[];
  error: string | null;
}

// Also check LinkedIn company pages for DJI Dock mentions
async function checkLinkedIn(
  linkedinUrl: string,
  apiKey: string,
): Promise<{ found: boolean; mentions: DockMention[] }> {
  // Extract company slug from LinkedIn URL
  const match = linkedinUrl.match(/linkedin\.com\/company\/([^/?]+)/);
  if (!match) return { found: false, mentions: [] };

  const slug = match[1];
  // Search LinkedIn posts from this company mentioning DJI Dock
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

    if (!res.ok) return { found: false, mentions: [] };

    const data = await res.json();
    const organic = data.organic ?? [];

    const mentions: DockMention[] = organic.map((r: { link: string; title: string; snippet: string }) => ({
      url: r.link,
      title: r.title,
      snippet: r.snippet,
    }));

    return { found: mentions.length > 0, mentions };
  } catch {
    return { found: false, mentions: [] };
  }
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'SERPER_API_KEY not configured' }, { status: 500 });
    }

    const body = await req.json();
    const companies: CompanyInput[] = body.companies ?? [];

    if (companies.length === 0) {
      return NextResponse.json({ error: 'No companies provided' }, { status: 400 });
    }

    if (companies.length > 50) {
      return NextResponse.json({ error: 'Max 50 companies per request' }, { status: 400 });
    }

    const results: VerifyResult[] = [];

    for (const company of companies) {
      // ── 1. Check website via site:domain "DJI Dock" ──
      const query = `site:${company.domain} "DJI Dock"`;

      let webMentions: DockMention[] = [];
      let error: string | null = null;

      try {
        const res = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ q: query, num: 10 }),
        });

        if (!res.ok) {
          error = `Serper ${res.status}`;
        } else {
          const data = await res.json();
          const organic = data.organic ?? [];
          webMentions = organic.map((r: { link: string; title: string; snippet: string }) => ({
            url: r.link,
            title: r.title,
            snippet: r.snippet,
          }));
        }
      } catch (err) {
        error = err instanceof Error ? err.message : 'fetch failed';
      }

      // ── 2. Check LinkedIn if provided ──
      let linkedinMentions: DockMention[] = [];
      if (company.linkedin_url) {
        const li = await checkLinkedIn(company.linkedin_url, apiKey);
        linkedinMentions = li.mentions;
      }

      const allMentions = [...webMentions, ...linkedinMentions];

      // ── 3. Detect Dock variant (Dock 1, 2, 3) ──
      const allText = allMentions.map(m => `${m.title} ${m.snippet}`).join(' ').toLowerCase();
      const variants: string[] = [];
      if (/dock\s*3/i.test(allText)) variants.push('Dock 3');
      if (/dock\s*2/i.test(allText)) variants.push('Dock 2');
      if (allMentions.length > 0 && variants.length === 0) variants.push('Dock (generic)');

      results.push({
        name: company.name,
        domain: company.domain,
        linkedin_url: company.linkedin_url ?? null,
        dock_found: allMentions.length > 0,
        dock_mentions: allMentions.length,
        dock_variant: variants.join(', ') || null,
        mentions: allMentions,
        error,
      });

      // Polite delay between companies (250ms)
      await new Promise(r => setTimeout(r, 250));
    }

    // Stats
    const found = results.filter(r => r.dock_found).length;
    const notFound = results.filter(r => !r.dock_found && !r.error).length;
    const errors = results.filter(r => r.error).length;

    return NextResponse.json({
      total: results.length,
      dock_confirmed: found,
      dock_not_found: notFound,
      errors,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
