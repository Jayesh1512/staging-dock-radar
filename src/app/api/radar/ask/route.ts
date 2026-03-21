import { NextResponse } from 'next/server';
import { requireSupabase } from '@/lib/db';
import { normalizeCompanyName } from '@/lib/company-normalize';
import { llmComplete } from '@/lib/llm';

const SYSTEM_PROMPT = `You are an intelligence analyst for FlytBase, a drone autonomy platform company.
You are given a set of news articles and social media posts related to a specific company.
Answer the user's question based ONLY on information found in these articles.
If the articles don't contain enough information to answer, say so clearly.
Be concise and specific. Cite which articles support your claims where possible.
Return plain text, not JSON.`;

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      company_name?: string;
      question?: string;
    };

    if (!body.company_name?.trim() || !body.question?.trim()) {
      return NextResponse.json(
        { error: 'company_name and question are required' },
        { status: 400 },
      );
    }

    const db = requireSupabase();
    const normalizedTarget = normalizeCompanyName(body.company_name);

    // Fetch all scored articles (with article details via FK join)
    const { data: scoredRows, error: dbError } = await db
      .from('scored_articles')
      .select(`
        id,
        article_id,
        company,
        country,
        industry,
        signal_type,
        summary,
        entities,
        relevance_score,
        articles!article_id(title, url, published_at, source)
      `)
      .gte('relevance_score', 50)
      .is('drop_reason', null)
      .eq('is_duplicate', false);

    if (dbError) {
      console.error('[/api/radar/ask] DB error:', dbError);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }

    // Filter articles related to this company (by company field or entity names)
    const companyArticles = (scoredRows ?? []).filter((row) => {
      // Match by company field
      if (row.company && normalizeCompanyName(row.company) === normalizedTarget) return true;
      // Match by entity names
      const entities = (row.entities ?? []) as Array<{ name: string; type: string }>;
      return entities.some(e =>
        normalizeCompanyName(e.name) === normalizedTarget &&
        (e.type === 'operator' || e.type === 'si' || e.type === 'partner'),
      );
    });

    if (companyArticles.length === 0) {
      return NextResponse.json({
        answer: `No articles found for "${body.company_name}" in the collected signals.`,
        article_count: 0,
        sources: {},
      });
    }

    // Cap articles to avoid LLM token overflow
    const MAX_ARTICLES = 20;
    const cappedArticles = companyArticles.slice(0, MAX_ARTICLES);

    // Build source counts (from all articles, not just capped)
    const sources: Record<string, number> = {};
    companyArticles.forEach((row) => {
      const art = row.articles as unknown as { title: string; url: string; published_at: string | null; source: string } | null;
      const src = art?.source ?? 'unknown';
      sources[src] = (sources[src] ?? 0) + 1;
    });

    const articleTexts = cappedArticles.map((row, i) => {
      const art = row.articles as unknown as { title: string; url: string; published_at: string | null; source: string } | null;
      return `[Article ${i + 1}] ${art?.title ?? 'Untitled'} (${art?.published_at ?? 'no date'}, ${art?.source ?? 'unknown'})
Summary: ${row.summary ?? 'No summary'}
Company: ${row.company ?? '—'} | Country: ${row.country ?? '—'} | Industry: ${row.industry ?? '—'} | Signal: ${row.signal_type ?? '—'}`;
    }).join('\n\n');

    const userPrompt = `COMPANY: ${body.company_name}

ARTICLES (${cappedArticles.length} of ${companyArticles.length} total):
${articleTexts}

QUESTION: ${body.question}`;

    const answer = await llmComplete(SYSTEM_PROMPT, userPrompt);

    return NextResponse.json({
      answer: answer.trim(),
      article_count: companyArticles.length,
      sources,
    });
  } catch (err) {
    console.error('[/api/radar/ask] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to query radar' },
      { status: 500 },
    );
  }
}
