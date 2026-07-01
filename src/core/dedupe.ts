/**
 * Duplicate-URL detection (docs/PLAN.md §3.6). PURE. Never throws.
 *
 * NOTE: scaffold stubs — implemented in Phase 3 (TDD).
 */
import type { SavedTab, TabId } from './types';

export interface DedupeOptions {
  /** default false (design = EXACT dupes). */
  ignoreHash?: boolean;
  /** default false. */
  ignoreTrailingSlash?: boolean;
  /** default false. */
  ignoreQuery?: boolean;
}

export interface DuplicateGroup {
  /** normalized url the group shares. */
  key: string;
  /** >= 2, ordered by savedAt asc. */
  tabs: SavedTab[];
  /** earliest savedAt. */
  keep: TabId;
  /** the rest. */
  remove: TabId[];
}

export function normalizeUrl(_url: string, _opts?: DedupeOptions): string {
  throw new Error('not implemented: scaffold stub');
}

export function findDuplicates(
  _tabs: SavedTab[],
  _opts?: DedupeOptions,
): DuplicateGroup[] {
  throw new Error('not implemented: scaffold stub');
}
