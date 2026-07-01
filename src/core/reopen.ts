/**
 * Reopen planner (docs/PLAN.md §3.8). PURE — produces a plan; the platform
 * layer executes it against `chrome.tabs` / `chrome.tabGroups`.
 *
 * NOTE: scaffold stub — implemented in Phase 3 (TDD).
 */
import type { Folder, FolderId, SavedTab } from './types';

export interface ReopenPlan {
  groupName: string;
  urls: string[];
}

/**
 * groupName = folder's own name; urls in tree order (depth-first if
 * includeSubfolders).
 */
export function planReopen(
  _folderId: FolderId,
  _includeSubfolders: boolean,
  _folders: Folder[],
  _tabs: SavedTab[],
): ReopenPlan {
  throw new Error('not implemented: scaffold stub');
}
