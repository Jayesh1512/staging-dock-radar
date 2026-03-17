import type { ArticleSource } from './types';

/**
 * Article schema validation for imports.
 * Validates structure, field types, and formats.
 */

export interface ArticleValidationError {
  index: number;
  field: string;
  value: unknown;
  error: string;
}

export interface ArticleValidationResult {
  isValid: boolean;
  errors: ArticleValidationError[];
}

const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})?)?$/;
const URL_REGEX = /^https?:\/\/.+\..+/;

/**
 * Validates a single article against the schema.
 * Returns all validation errors found (doesn't stop at first error).
 */
function validateArticle(
  article: unknown,
  index: number
): ArticleValidationError[] {
  const errors: ArticleValidationError[] = [];

  // Check if article is an object
  if (!article || typeof article !== 'object' || Array.isArray(article)) {
    errors.push({
      index,
      field: '$root',
      value: article,
      error: 'Article must be a JSON object, not null/array/primitive',
    });
    return errors;
  }

  const a = article as Record<string, unknown>;

  // ── Required Fields ───────────────────────────────────────────────────────

  // title: required, non-empty string
  if (typeof a.title !== 'string' || !a.title.trim()) {
    errors.push({
      index,
      field: 'title',
      value: a.title,
      error: 'Required: non-empty string',
    });
  } else if (a.title.length > 500) {
    errors.push({
      index,
      field: 'title',
      value: a.title,
      error: 'Title too long (max 500 chars)',
    });
  }

  // url: required, valid HTTP(S) URL
  if (typeof a.url !== 'string' || !a.url.trim()) {
    errors.push({
      index,
      field: 'url',
      value: a.url,
      error: 'Required: non-empty string',
    });
  } else if (!URL_REGEX.test(a.url)) {
    errors.push({
      index,
      field: 'url',
      value: a.url,
      error: 'Invalid URL format (must start with http:// or https://)',
    });
  } else if (a.url.length > 2048) {
    errors.push({
      index,
      field: 'url',
      value: a.url,
      error: 'URL too long (max 2048 chars)',
    });
  }

  // normalized_url: required, non-empty string (lowercase domain + path only)
  if (typeof a.normalized_url !== 'string' || !a.normalized_url.trim()) {
    errors.push({
      index,
      field: 'normalized_url',
      value: a.normalized_url,
      error: 'Required: non-empty string',
    });
  } else if (a.normalized_url.includes('?') || a.normalized_url.includes('#')) {
    errors.push({
      index,
      field: 'normalized_url',
      value: a.normalized_url,
      error: 'Should not contain query params (?) or fragments (#)',
    });
  } else if (a.normalized_url !== a.normalized_url.toLowerCase()) {
    errors.push({
      index,
      field: 'normalized_url',
      value: a.normalized_url,
      error: 'Must be lowercase (for dedup consistency)',
    });
  }

  // ── Optional Fields ───────────────────────────────────────────────────────

  // snippet: optional, null or string
  if (a.snippet !== null && a.snippet !== undefined) {
    if (typeof a.snippet !== 'string') {
      errors.push({
        index,
        field: 'snippet',
        value: a.snippet,
        error: 'Must be string or null',
      });
    } else if (a.snippet.length > 1000) {
      errors.push({
        index,
        field: 'snippet',
        value: a.snippet,
        error: 'Snippet too long (max 1000 chars)',
      });
    }
  }

  // publisher: optional, null or string
  if (a.publisher !== null && a.publisher !== undefined) {
    if (typeof a.publisher !== 'string') {
      errors.push({
        index,
        field: 'publisher',
        value: a.publisher,
        error: 'Must be string or null',
      });
    } else if (a.publisher.length > 200) {
      errors.push({
        index,
        field: 'publisher',
        value: a.publisher,
        error: 'Publisher name too long (max 200 chars)',
      });
    }
  }

  // published_at: optional, null or ISO 8601 date
  if (a.published_at !== null && a.published_at !== undefined) {
    if (typeof a.published_at !== 'string') {
      errors.push({
        index,
        field: 'published_at',
        value: a.published_at,
        error: 'Must be ISO 8601 string or null (e.g., "2026-03-17T10:30:00Z")',
      });
    } else if (!ISO_8601_REGEX.test(a.published_at)) {
      errors.push({
        index,
        field: 'published_at',
        value: a.published_at,
        error: 'Invalid ISO 8601 format (expected YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)',
      });
    } else {
      // Validate the date is actually valid (not Feb 30, etc.)
      try {
        const date = new Date(a.published_at);
        if (isNaN(date.getTime())) {
          errors.push({
            index,
            field: 'published_at',
            value: a.published_at,
            error: 'Invalid date (possibly non-existent date like Feb 30)',
          });
        }
      } catch {
        errors.push({
          index,
          field: 'published_at',
          value: a.published_at,
          error: 'Date parsing failed',
        });
      }
    }
  }

  // source: optional, any non-empty string
  if (a.source !== null && a.source !== undefined) {
    if (typeof a.source !== 'string') {
      errors.push({
        index,
        field: 'source',
        value: a.source,
        error: 'Must be string or null (e.g., "comet_crawler", "news_site", "dronelife")',
      });
    } else if (!a.source.trim()) {
      errors.push({
        index,
        field: 'source',
        value: a.source,
        error: 'Must be non-empty string or null',
      });
    }
  }

  // ── Warn about unexpected fields ──────────────────────────────────────────

  const knownFields = new Set(['title', 'url', 'normalized_url', 'snippet', 'publisher', 'published_at', 'source', 'keyword']);
  for (const key of Object.keys(a)) {
    if (!knownFields.has(key)) {
      errors.push({
        index,
        field: key,
        value: a[key],
        error: `Unexpected field (will be ignored). Known fields: ${Array.from(knownFields).join(', ')}`,
      });
    }
  }

  return errors;
}

/**
 * Validates an array of articles against the schema.
 * 
 * @param articles - Array of articles to validate
 * @returns Validation result with all errors found
 */
export function validateArticles(articles: unknown[]): ArticleValidationResult {
  if (!Array.isArray(articles)) {
    return {
      isValid: false,
      errors: [
        {
          index: -1,
          field: '$root',
          value: articles,
          error: 'Expected articles to be an array',
        },
      ],
    };
  }

  const allErrors: ArticleValidationError[] = [];

  for (let i = 0; i < articles.length; i++) {
    const articleErrors = validateArticle(articles[i], i);
    allErrors.push(...articleErrors);
  }

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
  };
}

/**
 * Formats validation errors for user display.
 * Groups by article index, shows first N errors per article.
 */
export function formatValidationErrors(errors: ArticleValidationError[], maxPerArticle = 3): string {
  if (errors.length === 0) return 'No errors';

  const grouped = new Map<number, ArticleValidationError[]>();
  for (const err of errors) {
    if (!grouped.has(err.index)) grouped.set(err.index, []);
    grouped.get(err.index)!.push(err);
  }

  const lines: string[] = [];
  for (const [index, errs] of grouped) {
    const articleLabel = index === -1 ? 'Root' : `Article ${index + 1}`;
    lines.push(`\n${articleLabel}:`);
    for (let i = 0; i < Math.min(errs.length, maxPerArticle); i++) {
      const e = errs[i];
      lines.push(`  • ${e.field}: ${e.error}`);
    }
    if (errs.length > maxPerArticle) {
      lines.push(`  ... and ${errs.length - maxPerArticle} more errors`);
    }
  }

  return lines.join('\n');
}
