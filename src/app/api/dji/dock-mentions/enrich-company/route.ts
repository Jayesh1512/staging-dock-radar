import { NextRequest, NextResponse } from 'next/server';
import { enrichDjiDockCompanyFromSerperRegex } from '@/lib/dji/djiDockCompanyEnricher';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      company_name?: string;
      company_country?: string;
      pages?: number;
    };

    const companyName = body.company_name?.trim() ?? '';
    const companyCountry = body.company_country?.trim() ?? '';
    const pages = typeof body.pages === 'number' ? body.pages : undefined;

    if (!companyName) {
      return NextResponse.json({ error: 'company_name is required' }, { status: 400 });
    }
    if (!companyCountry) {
      return NextResponse.json({ error: 'company_country is required' }, { status: 400 });
    }

    const serperApiKey = process.env.SERPER_API_KEY?.trim();
    if (!serperApiKey) {
      return NextResponse.json({ error: 'SERPER_API_KEY is not set' }, { status: 500 });
    }

    const result = await enrichDjiDockCompanyFromSerperRegex(
      { companyName, companyCountry, pages },
      serperApiKey,
    );

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[/api/dji/dock-mentions/enrich-company] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

