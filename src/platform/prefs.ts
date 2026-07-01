/**
 * Non-vault settings over `chrome.storage.local` (docs/PLAN.md §3.13).
 *
 * These are small UI/behavior preferences — NOT the tab vault (that lives in
 * IndexedDB via `core/storage.ts`). `chrome.storage.local` is local disk only;
 * no network implication.
 */
import type { DedupeOptions } from '../core/dedupe';

export interface Prefs {
  firstRunSeen: boolean;
  dedupe: DedupeOptions;
  lastMoveTargetFolderId: string | null;
  includeSubfoldersDefault: boolean;
}

/** The single key under which the whole Prefs blob is stored. */
const PREFS_KEY = 'prefs';

const DEFAULT_PREFS: Prefs = {
  firstRunSeen: false,
  dedupe: {},
  lastMoveTargetFolderId: null,
  includeSubfoldersDefault: false,
};

/**
 * Read prefs, filling any missing field from defaults (forward-compatible with
 * prefs written by an older version). Never rejects for a missing key.
 */
export async function getPrefs(): Promise<Prefs> {
  const stored = await chrome.storage.local.get(PREFS_KEY);
  const raw = stored[PREFS_KEY] as Partial<Prefs> | undefined;
  return {
    ...DEFAULT_PREFS,
    ...raw,
    // Nested object must be merged explicitly so a partial dedupe blob keeps
    // its defaults for unset options.
    dedupe: { ...DEFAULT_PREFS.dedupe, ...raw?.dedupe },
  };
}

/** Shallow-merge `patch` (dedupe merged one level deep) and persist. */
export async function setPrefs(patch: Partial<Prefs>): Promise<void> {
  const current = await getPrefs();
  const next: Prefs = {
    ...current,
    ...patch,
    dedupe: { ...current.dedupe, ...patch.dedupe },
  };
  await chrome.storage.local.set({ [PREFS_KEY]: next });
}
