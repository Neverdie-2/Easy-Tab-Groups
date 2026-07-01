/**
 * Full-text search over title / url / domain (docs/PLAN.md §3.7). PURE.
 * Deterministic substring/token search only (no fuzzy/AI). Never throws.
 *
 * Semantics:
 * - Case-insensitive. The query is split into whitespace tokens; ALL tokens
 *   must match (logical AND) for a tab to be a result.
 * - A token matches a field if it appears as a substring of that field
 *   (title / url / derived domain).
 * - Ranking: a domain or title hit outranks a bare url hit; an exact token
 *   (whole domain / whole title word) outranks a substring hit.
 */
import { domainOf } from './url';
import type { SavedTab } from './types';

export interface SearchResult {
  tab: SavedTab;
  /** higher = better. */
  score: number;
  matched: Array<'title' | 'url' | 'domain'>;
}

// Scoring weights. Domain/title dominate url; exact dominates substring.
const DOMAIN_EXACT = 40;
const DOMAIN_SUBSTRING = 20;
const TITLE_EXACT = 30;
const TITLE_SUBSTRING = 15;
const URL_SUBSTRING = 5;

/** Lowercase, split on whitespace, drop empties. */
export function tokenize(s: string): string[] {
  return (s ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Case-insensitive, AND over tokens. Empty/blank query -> []. Ranks
 * domain/title matches above url matches; exact token above substring.
 */
export function search(query: string, tabs: SavedTab[]): SearchResult[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const results: SearchResult[] = [];

  for (const tab of tabs) {
    const title = (tab.title ?? '').toLowerCase();
    const titleWords = new Set(title.split(/\s+/).filter(Boolean));
    const url = (tab.url ?? '').toLowerCase();
    const domain = domainOf(tab.url ?? '');

    let score = 0;
    let titleHit = false;
    let urlHit = false;
    let domainHit = false;
    let everyTokenMatched = true;

    for (const token of tokens) {
      let tokenMatched = false;

      if (domain === token) {
        score += DOMAIN_EXACT;
        domainHit = true;
        tokenMatched = true;
      } else if (domain.length > 0 && domain.includes(token)) {
        score += DOMAIN_SUBSTRING;
        domainHit = true;
        tokenMatched = true;
      }

      if (titleWords.has(token)) {
        score += TITLE_EXACT;
        titleHit = true;
        tokenMatched = true;
      } else if (title.includes(token)) {
        score += TITLE_SUBSTRING;
        titleHit = true;
        tokenMatched = true;
      }

      if (url.includes(token)) {
        score += URL_SUBSTRING;
        urlHit = true;
        tokenMatched = true;
      }

      if (!tokenMatched) {
        everyTokenMatched = false;
        break;
      }
    }

    if (!everyTokenMatched) continue;

    const matched: Array<'title' | 'url' | 'domain'> = [];
    if (titleHit) matched.push('title');
    if (urlHit) matched.push('url');
    if (domainHit) matched.push('domain');

    results.push({ tab, score, matched });
  }

  results.sort(
    (a, b) =>
      b.score - a.score ||
      b.tab.savedAt - a.tab.savedAt ||
      (a.tab.id < b.tab.id ? -1 : a.tab.id > b.tab.id ? 1 : 0),
  );
  return results;
}
