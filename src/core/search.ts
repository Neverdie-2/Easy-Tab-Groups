/**
 * Full-text search over title / url / domain (docs/PLAN.md §3.7). PURE.
 * Deterministic substring/token search only (no fuzzy/AI). Never throws.
 *
 * NOTE: scaffold stubs — implemented in Phase 3 (TDD).
 */
import type { SavedTab } from './types';

export interface SearchResult {
  tab: SavedTab;
  /** higher = better. */
  score: number;
  matched: Array<'title' | 'url' | 'domain'>;
}

export function tokenize(_s: string): string[] {
  throw new Error('not implemented: scaffold stub');
}

/**
 * Case-insensitive, AND over tokens. Empty/blank query -> []. Ranks
 * domain/title matches above url matches; exact token above substring.
 */
export function search(_query: string, _tabs: SavedTab[]): SearchResult[] {
  throw new Error('not implemented: scaffold stub');
}
