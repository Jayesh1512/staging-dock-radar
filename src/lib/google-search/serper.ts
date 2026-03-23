/**
 * Serper.dev API wrapper for Google Search
 * Docs: POST https://google.serper.dev/search
 */

export interface SerperResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
  date?: string;
  sitelinks?: { title: string; link: string }[];
}

export interface SerperResponse {
  searchParameters: {
    q: string;
    gl: string;
    hl: string;
    num: number;
    page: number;
  };
  organic: SerperResult[];
  credits: number;
}

interface SearchParams {
  keyword: string;
  country: string;       // ISO 2-letter: FR, DE, UK, AU
  pages: number;         // how many pages (10 results each)
  onPageDone?: (page: number, results: SerperResult[]) => void;
}

const COUNTRY_CONFIG: Record<string, { gl: string; hl: string }> = {
  FR: { gl: 'fr', hl: 'fr' },
  DE: { gl: 'de', hl: 'de' },
  UK: { gl: 'uk', hl: 'en' },
  AU: { gl: 'au', hl: 'en' },
  US: { gl: 'us', hl: 'en' },
  IN: { gl: 'in', hl: 'en' },
  AE: { gl: 'ae', hl: 'en' },
  SA: { gl: 'sa', hl: 'en' },
  JP: { gl: 'jp', hl: 'ja' },
  KR: { gl: 'kr', hl: 'ko' },
  BR: { gl: 'br', hl: 'pt' },
  IT: { gl: 'it', hl: 'it' },
  ES: { gl: 'es', hl: 'es' },
  SG: { gl: 'sg', hl: 'en' },
};

export async function searchGoogle(
  params: SearchParams,
  apiKey: string,
): Promise<SerperResult[]> {
  const config = COUNTRY_CONFIG[params.country.toUpperCase()] ?? { gl: params.country.toLowerCase(), hl: 'en' };
  const query = `"${params.keyword}" ${params.country}`;

  const allResults: SerperResult[] = [];

  for (let page = 1; page <= params.pages; page++) {
    const body = {
      q: query,
      gl: config.gl,
      hl: config.hl,
      num: 10,
      page,
    };

    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Serper API error (${res.status}): ${text}`);
    }

    const data: SerperResponse = await res.json();
    const results = data.organic ?? [];

    // Normalize positions to be globally unique across pages
    const offset = (page - 1) * 10;
    const normalized = results.map((r, i) => ({
      ...r,
      position: offset + i + 1,
    }));

    allResults.push(...normalized);
    params.onPageDone?.(page, normalized);

    // Small delay between pages to be polite
    if (page < params.pages) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  return allResults;
}
