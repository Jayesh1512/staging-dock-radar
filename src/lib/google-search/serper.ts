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
  /**
   * When true (default), the keyword is wrapped in quotes so Google matches that exact phrase.
   * Set false for broader matches (e.g. company + location where the full phrase rarely appears verbatim).
   */
  exactPhrase?: boolean;
}

const COUNTRY_CONFIG: Record<string, { gl: string; hl: string; name: string }> = {
  FR: { gl: 'fr', hl: 'fr', name: 'France' },
  DE: { gl: 'de', hl: 'de', name: 'Germany' },
  UK: { gl: 'uk', hl: 'en', name: 'United Kingdom' },
  AU: { gl: 'au', hl: 'en', name: 'Australia' },
  US: { gl: 'us', hl: 'en', name: 'United States' },
  IN: { gl: 'in', hl: 'en', name: 'India' },
  AE: { gl: 'ae', hl: 'en', name: 'UAE' },
  SA: { gl: 'sa', hl: 'en', name: 'Saudi Arabia' },
  JP: { gl: 'jp', hl: 'ja', name: 'Japan' },
  KR: { gl: 'kr', hl: 'ko', name: 'South Korea' },
  BR: { gl: 'br', hl: 'pt', name: 'Brazil' },
  IT: { gl: 'it', hl: 'it', name: 'Italy' },
  ES: { gl: 'es', hl: 'es', name: 'Spain' },
  NL: { gl: 'nl', hl: 'nl', name: 'Netherlands' },
  SG: { gl: 'sg', hl: 'en', name: 'Singapore' },
  CA: { gl: 'ca', hl: 'en', name: 'Canada' },
  ZA: { gl: 'za', hl: 'en', name: 'South Africa' },
  TH: { gl: 'th', hl: 'en', name: 'Thailand' },
  PL: { gl: 'pl', hl: 'pl', name: 'Poland' },
  TR: { gl: 'tr', hl: 'tr', name: 'Turkey' },
};

export async function searchGoogle(
  params: SearchParams,
  apiKey: string,
): Promise<SerperResult[]> {
  const config = COUNTRY_CONFIG[params.country.toUpperCase()] ?? { gl: params.country.toLowerCase(), hl: 'en', name: params.country };
  const useExact = params.exactPhrase !== false;
  const query = useExact
    ? `"${params.keyword}" ${config.name}`
    : `${params.keyword} ${config.name}`.trim();

  const allResults: SerperResult[] = [];

  for (let page = 1; page <= params.pages; page++) {
    const body = {
      q: query,
      gl: config.gl,
      hl: config.hl,
      num: 10,
      page,
    };

    let results: SerperResult[] = [];
    let retries = 2;

    while (retries >= 0) {
      try {
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
        results = data.organic ?? [];
        break; // success
      } catch (err) {
        if (retries > 0) {
          retries--;
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          // Log but don't crash — continue with partial results
          params.onPageDone?.(page, []);
          break;
        }
      }
    }

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
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return allResults;
}
