/**
 * Non-vault settings over `chrome.storage.local` (docs/PLAN.md §3.13).
 *
 * NOTE: scaffold stubs — implemented in Phase 4.
 */
import type { DedupeOptions } from '../core/dedupe';

export interface Prefs {
  firstRunSeen: boolean;
  dedupe: DedupeOptions;
  lastMoveTargetFolderId: string | null;
  includeSubfoldersDefault: boolean;
}

export function getPrefs(): Promise<Prefs> {
  throw new Error('not implemented: scaffold stub');
}

export function setPrefs(_patch: Partial<Prefs>): Promise<void> {
  throw new Error('not implemented: scaffold stub');
}
