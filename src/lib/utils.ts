import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { getScoreBand, COUNTRY_NAME_TO_REGION_KEY } from './constants';
import type { Article, ScoredArticle } from './types';

const IST = 'Asia/Kolkata';

/** Format a date string as a localised date in IST (e.g. "Mar 15, 2026") */
export function formatDateIST(
  dateString: string | null | undefined,
  options: Omit<Intl.DateTimeFormatOptions, 'timeZone'> = { month: 'short', day: 'numeric', year: 'numeric' },
): string {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-US', { ...options, timeZone: IST });
}

/** Format a date+time string in IST (e.g. "Mar 15, 10:30 AM") */
export function formatDateTimeIST(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  const d = new Date(dateString);
  const date = d.toLocaleDateString('en-US', { timeZone: IST, month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { timeZone: IST, hour: 'numeric', minute: '2-digit' });
  return `${date}, ${time}`;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export function formatTimeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Normalises a country string from LLM output to one of the canonical region keys.
 * Returns null if not in the known list (treat as "unknown — don't filter out").
 */
export function normalizeCountryToRegionKey(country: string | null): string | null {
  if (!country) return null;
  return COUNTRY_NAME_TO_REGION_KEY[country.toLowerCase().trim()] ?? null;
}

/**
 * Returns true if the article's country matches any of the selected regions.
 * Always returns true if no regions selected, country is null, or country is unmapped.
 */
export function articleMatchesRegions(country: string | null, selectedRegions: string[]): boolean {
  if (selectedRegions.length === 0) return true;
  if (!country) return true;
  const regionKey = normalizeCountryToRegionKey(country);
  if (!regionKey) return true;
  return selectedRegions.includes(regionKey);
}

export function generateSlackMessage(article: Article, scored: ScoredArticle): string {
  // Use resolved_url (real article URL) when available — enables Slack unfurl + og:image.
  // Falls back to the raw Google News URL (shows "Google News" card) if not yet resolved.
  const articleUrl = article.resolved_url ?? article.url;

  return `*${scored.company ?? 'Unknown'}* — ${scored.signal_type} | ${scored.country ?? 'Unknown'}
Score: ${scored.relevance_score}/100 | Use Case: ${scored.use_case ?? 'N/A'}

${scored.summary ?? ''}

${articleUrl}`;
}
