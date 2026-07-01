/**
 * Folder-tree model (docs/PLAN.md §3.4). PURE.
 *
 * Operates on plain arrays loaded from storage; returns NEW objects / id lists
 * (never mutates inputs, never persists). The caller persists via VaultStorage.
 *
 * NOTE: scaffold stubs — implemented in Phase 1 (TDD).
 */
import type { Folder, FolderId, SavedTab, TabId } from './types';

export interface TreeNode {
  folder: Folder;
  children: TreeNode[];
  tabs: SavedTab[];
}

/**
 * Build the nested view, children & tabs sorted by `order`. Orphans (missing
 * parent) are attached to top level defensively.
 */
export function buildTree(_folders: Folder[], _tabs: SavedTab[]): TreeNode[] {
  throw new Error('not implemented: scaffold stub');
}

export function createFolder(
  _name: string,
  _parentId: FolderId | null,
  _siblings: Folder[],
): Folder {
  throw new Error('not implemented: scaffold stub');
}

/** Guards: no rename of a system folder. */
export function renameFolder(_folder: Folder, _name: string): Folder {
  throw new Error('not implemented: scaffold stub');
}

/**
 * Returns folders whose parentId/order changed. Throws if moving a folder into
 * its own subtree (cycle) or moving a system folder.
 */
export function moveFolder(
  _folderId: FolderId,
  _newParentId: FolderId | null,
  _indexInParent: number,
  _folders: Folder[],
): Folder[] {
  throw new Error('not implemented: scaffold stub');
}

/** All descendant folder ids (excludes self). */
export function descendantFolderIds(
  _folderId: FolderId,
  _folders: Folder[],
): FolderId[] {
  throw new Error('not implemented: scaffold stub');
}

export function isDescendant(
  _candidateId: FolderId,
  _ancestorId: FolderId,
  _folders: Folder[],
): boolean {
  throw new Error('not implemented: scaffold stub');
}

/**
 * Cascade delete plan: this folder + all descendants + their tabs. System
 * folder rejected.
 */
export function deleteFolderCascade(
  _folderId: FolderId,
  _folders: Folder[],
  _tabs: SavedTab[],
): { folderIds: FolderId[]; tabIds: TabId[] } {
  throw new Error('not implemented: scaffold stub');
}

/** Reassign folderId + append order for a batch move (select-all-matching). */
export function moveTabs(
  _tabIds: TabId[],
  _targetFolderId: FolderId,
  _tabs: SavedTab[],
): SavedTab[] {
  throw new Error('not implemented: scaffold stub');
}

/** Reorder a tab within/into a folder at index. Returns changed tabs. */
export function reorderTab(
  _tabId: TabId,
  _targetFolderId: FolderId,
  _index: number,
  _tabs: SavedTab[],
): SavedTab[] {
  throw new Error('not implemented: scaffold stub');
}

/** Tabs to reopen for a folder; depth-first when includeSubfolders. */
export function collectTabs(
  _folderId: FolderId,
  _includeSubfolders: boolean,
  _folders: Folder[],
  _tabs: SavedTab[],
): SavedTab[] {
  throw new Error('not implemented: scaffold stub');
}

/** "A / B / C" path from root to the given folder. */
export function folderPath(_folderId: FolderId, _folders: Folder[]): string {
  throw new Error('not implemented: scaffold stub');
}
