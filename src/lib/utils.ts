import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { getScoreBand } from './constants';
import type { Article, ScoredArticle } from './types';

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

export function generateSlackMessage(article: Article, scored: ScoredArticle): string {
  return `*${scored.company ?? 'Unknown'}* — ${scored.signal_type} | ${scored.country ?? 'Unknown'}
Score: ${scored.relevance_score}/100 | Use Case: ${scored.use_case ?? 'N/A'}

${scored.summary ?? ''}

${article.url}`;
}
