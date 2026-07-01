/**
 * Reopen planner (docs/PLAN.md §3.8). PURE — produces a plan; the platform
 * layer (`src/platform/reopen-exec.ts`) executes it against `chrome.tabs` /
 * `chrome.tabGroups`.
 *
 * The plan is deliberately minimal: a group name and an ordered url list. All
 * the tree-walking (direct-only vs depth-first subtree) is delegated to the
 * already-tested `collectTabs`, so this stays a thin, deterministic projection.
 */
import { collectTabs } from './tree';
import type { Folder, FolderId, SavedTab } from './types';

export interface ReopenPlan {
  groupName: string;
  urls: string[];
}

/**
 * groupName = the folder's OWN name (even when subfolders are included, the
 * native group is named after the folder that was clicked). `urls` are in tree
 * order — the folder's direct tabs when `includeSubfolders` is false, else a
 * depth-first walk of the whole subtree.
 *
 * Never throws: an unknown folder yields `{ groupName: '', urls: [] }` so the
 * runtime router can't be bricked by a stale id.
 */
export function planReopen(
  folderId: FolderId,
  includeSubfolders: boolean,
  folders: Folder[],
  tabs: SavedTab[],
): ReopenPlan {
  const folder = folders.find((f) => f.id === folderId);
  const groupName = folder ? folder.name : '';
  const urls = collectTabs(folderId, includeSubfolders, folders, tabs).map(
    (t) => t.url,
  );
  return { groupName, urls };
}
