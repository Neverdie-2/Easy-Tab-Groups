/**
 * Folder-tree model (docs/PLAN.md §3.4). PURE.
 *
 * Operates on plain arrays loaded from storage; returns NEW objects / id lists
 * (never mutates inputs, never persists). The caller persists via VaultStorage.
 *
 * Invariants enforced here:
 * - Unlimited nesting.
 * - The system folder (Inbox) can never be renamed, moved or deleted.
 * - A folder can never be moved into itself or any of its descendants (cycle).
 */
import { ORDER_STEP, newId, nextOrder } from './ids';
import type { Folder, FolderId, SavedTab, TabId } from './types';

export interface TreeNode {
  folder: Folder;
  children: TreeNode[];
  tabs: SavedTab[];
}

/** Ascending by `order`, then a stable tie-break so output is deterministic. */
function byFolderOrder(a: Folder, b: Folder): number {
  return a.order - b.order || a.createdAt - b.createdAt || cmp(a.id, b.id);
}
function byTabOrder(a: SavedTab, b: SavedTab): number {
  return a.order - b.order || a.savedAt - b.savedAt || cmp(a.id, b.id);
}
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Build the nested view, children & tabs sorted by `order`.
 *
 * Cycle- and orphan-safe, so malformed data (e.g. from a hand-edited/imported
 * vault) can never crash or hide the tree:
 * - a folder whose parent is missing (or `null`) becomes a root;
 * - a folder that is its own parent is never made its own child (no infinite
 *   render recursion);
 * - a parent-cycle (A→B→A) leaves its members unreachable from any root, so they
 *   are re-attached at the top level (and detached from their cyclic parent)
 *   rather than silently disappearing.
 */
export function buildTree(folders: Folder[], tabs: SavedTab[]): TreeNode[] {
  const nodes = new Map<FolderId, TreeNode>();
  for (const folder of folders) {
    nodes.set(folder.id, { folder, children: [], tabs: [] });
  }

  const roots: TreeNode[] = [];
  for (const folder of folders) {
    const node = nodes.get(folder.id)!;
    const parent =
      folder.parentId !== null ? nodes.get(folder.parentId) : undefined;
    // `parent !== node` guards a self-parent (parentId === own id).
    if (parent && parent !== node) {
      parent.children.push(node);
    } else {
      // Top level (parentId === null) OR an orphan whose parent is missing.
      roots.push(node);
    }
  }

  // Promote any node not reachable from a root (a parent-cycle) so nothing is
  // lost, breaking the cycle by detaching it from its cyclic parent first.
  const reachable = new Set<TreeNode>();
  const markFrom = (start: TreeNode): void => {
    const stack = [start];
    while (stack.length > 0) {
      const n = stack.pop()!;
      if (reachable.has(n)) continue;
      reachable.add(n);
      for (const c of n.children) stack.push(c);
    }
  };
  for (const r of roots) markFrom(r);
  for (const node of nodes.values()) {
    if (reachable.has(node)) continue;
    const parent =
      node.folder.parentId !== null
        ? nodes.get(node.folder.parentId)
        : undefined;
    if (parent) parent.children = parent.children.filter((c) => c !== node);
    roots.push(node);
    markFrom(node);
  }

  for (const tab of tabs) {
    const node = nodes.get(tab.folderId);
    // Tabs whose folder is missing are dropped from the *view* only (the tree
    // can only render tabs under an existing folder); storage keeps the data.
    if (node) node.tabs.push(tab);
  }

  for (const node of nodes.values()) {
    node.children.sort((a, b) => byFolderOrder(a.folder, b.folder));
    node.tabs.sort(byTabOrder);
  }
  roots.sort((a, b) => byFolderOrder(a.folder, b.folder));
  return roots;
}

function findFolder(id: FolderId, folders: Folder[]): Folder | undefined {
  return folders.find((f) => f.id === id);
}

function cleanName(name: string): string {
  const trimmed = (name ?? '').trim();
  if (trimmed.length === 0) {
    throw new Error('Folder name cannot be empty');
  }
  return trimmed;
}

/** New folder appended after the given siblings. Never `system`. */
export function createFolder(
  name: string,
  parentId: FolderId | null,
  siblings: Folder[],
): Folder {
  return {
    id: newId(),
    name: cleanName(name),
    parentId,
    order: nextOrder(siblings),
    createdAt: Date.now(),
  };
}

/** Guards: no rename of a system folder; name must be non-empty. */
export function renameFolder(folder: Folder, name: string): Folder {
  if (folder.system) {
    throw new Error('Cannot rename the system folder');
  }
  return { ...folder, name: cleanName(name) };
}

/** All descendant folder ids (excludes self). Cycle-safe via a visited set. */
export function descendantFolderIds(
  folderId: FolderId,
  folders: Folder[],
): FolderId[] {
  const childrenByParent = new Map<FolderId, Folder[]>();
  for (const f of folders) {
    if (f.parentId === null) continue;
    const list = childrenByParent.get(f.parentId);
    if (list) list.push(f);
    else childrenByParent.set(f.parentId, [f]);
  }

  const out: FolderId[] = [];
  const seen = new Set<FolderId>([folderId]);
  const stack = [...(childrenByParent.get(folderId) ?? [])];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (seen.has(cur.id)) continue; // guard against malformed cyclic data
    seen.add(cur.id);
    out.push(cur.id);
    const kids = childrenByParent.get(cur.id);
    if (kids) stack.push(...kids);
  }
  return out;
}

/** True if `candidateId` is `ancestorId` itself or lives in its subtree. */
export function isDescendant(
  candidateId: FolderId,
  ancestorId: FolderId,
  folders: Folder[],
): boolean {
  if (candidateId === ancestorId) return true;
  return descendantFolderIds(ancestorId, folders).includes(candidateId);
}

/**
 * Returns folders whose parentId/order changed. Throws if the folder is the
 * system folder, if the target parent does not exist, or if moving the folder
 * into itself or its own subtree (cycle).
 *
 * Pinned system folders (the Inbox) are NEVER part of the re-space: they keep
 * their slot and `order` and are excluded from the returned change set, so
 * moving a user folder can never displace or renumber the Inbox. The moved
 * folder is inserted among the MOVABLE siblings and only those are re-spaced,
 * always above the highest pinned order so a system folder stays first.
 */
export function moveFolder(
  folderId: FolderId,
  newParentId: FolderId | null,
  indexInParent: number,
  folders: Folder[],
): Folder[] {
  const folder = findFolder(folderId, folders);
  if (!folder) {
    throw new Error(`Unknown folder: ${folderId}`);
  }
  if (folder.system) {
    throw new Error('Cannot move the system folder');
  }
  if (newParentId !== null) {
    if (!findFolder(newParentId, folders)) {
      throw new Error(`Unknown target parent: ${newParentId}`);
    }
    if (isDescendant(newParentId, folderId, folders)) {
      throw new Error('Cannot move a folder into itself or its own subtree');
    }
  }

  const allSiblings = folders
    .filter((f) => f.parentId === newParentId && f.id !== folderId)
    .sort(byFolderOrder);
  const systemSibs = allSiblings.filter((f) => f.system);
  const movable = allSiblings.filter((f) => !f.system);

  // The UI index is in full-sibling space (pinned system folders render first),
  // so shift it into movable space and clamp — a folder can never land before a
  // pinned system sibling.
  const insertAt = Math.max(
    0,
    Math.min(indexInParent - systemSibs.length, movable.length),
  );
  const ordered = [
    ...movable.slice(0, insertAt),
    folder,
    ...movable.slice(insertAt),
  ];

  let baseOrder = 0;
  for (const s of systemSibs) if (s.order > baseOrder) baseOrder = s.order;

  return ordered.map((f, i) => ({
    ...f,
    parentId: newParentId,
    order: baseOrder + (i + 1) * ORDER_STEP,
  }));
}

/**
 * Cascade delete plan: this folder + all descendants + all their tabs. The
 * system folder is rejected. Returns id lists for the caller to persist.
 */
export function deleteFolderCascade(
  folderId: FolderId,
  folders: Folder[],
  tabs: SavedTab[],
): { folderIds: FolderId[]; tabIds: TabId[] } {
  const folder = findFolder(folderId, folders);
  if (!folder) {
    throw new Error(`Unknown folder: ${folderId}`);
  }
  if (folder.system) {
    throw new Error('Cannot delete the system folder');
  }
  const folderIds = [folderId, ...descendantFolderIds(folderId, folders)];
  const inScope = new Set(folderIds);
  const tabIds = tabs.filter((t) => inScope.has(t.folderId)).map((t) => t.id);
  return { folderIds, tabIds };
}

/**
 * Reassign `folderId` and append `order` for a batch move (select-all-matching).
 * Moved tabs are appended (in a stable order) after whatever already lives in
 * the target folder. Returns only the changed tabs. Unknown ids are ignored.
 */
export function moveTabs(
  tabIds: TabId[],
  targetFolderId: FolderId,
  tabs: SavedTab[],
): SavedTab[] {
  const idSet = new Set(tabIds);
  const moving = tabs.filter((t) => idSet.has(t.id)).sort(byTabOrder);
  if (moving.length === 0) return [];

  let base = 0;
  for (const t of tabs) {
    if (t.folderId === targetFolderId && !idSet.has(t.id) && t.order > base) {
      base = t.order;
    }
  }

  return moving.map((t, i) => ({
    ...t,
    folderId: targetFolderId,
    order: base + (i + 1) * ORDER_STEP,
  }));
}

/**
 * Tabs to reopen for a folder, in tree order. `includeSubfolders=false` returns
 * only the folder's direct tabs; `true` walks the subtree depth-first
 * (a folder's own tabs first, then each child folder in order).
 */
export function collectTabs(
  folderId: FolderId,
  includeSubfolders: boolean,
  folders: Folder[],
  tabs: SavedTab[],
): SavedTab[] {
  const tabsByFolder = new Map<FolderId, SavedTab[]>();
  for (const t of tabs) {
    const list = tabsByFolder.get(t.folderId);
    if (list) list.push(t);
    else tabsByFolder.set(t.folderId, [t]);
  }
  const direct = (id: FolderId): SavedTab[] =>
    (tabsByFolder.get(id) ?? []).slice().sort(byTabOrder);

  if (!includeSubfolders) return direct(folderId);

  const childrenByParent = new Map<FolderId, Folder[]>();
  for (const f of folders) {
    if (f.parentId === null) continue;
    const list = childrenByParent.get(f.parentId);
    if (list) list.push(f);
    else childrenByParent.set(f.parentId, [f]);
  }

  const out: SavedTab[] = [];
  const seen = new Set<FolderId>();
  const walk = (id: FolderId): void => {
    if (seen.has(id)) return; // cycle guard on malformed data
    seen.add(id);
    out.push(...direct(id));
    const kids = (childrenByParent.get(id) ?? []).slice().sort(byFolderOrder);
    for (const child of kids) walk(child.id);
  };
  walk(folderId);
  return out;
}

/**
 * Ancestor names root-first, e.g. `['A', 'B', 'C']`. `[]` if not found.
 * Cycle-safe. Callers derive depth from `.length` (NOT by splitting the joined
 * path string, which breaks when a folder name itself contains " / ").
 */
export function folderPathParts(
  folderId: FolderId,
  folders: Folder[],
): string[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const names: string[] = [];
  const seen = new Set<FolderId>();
  let cur = byId.get(folderId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    names.push(cur.name);
    cur = cur.parentId !== null ? byId.get(cur.parentId) : undefined;
  }
  return names.reverse();
}

/** "A / B / C" path from root to the given folder. `''` if not found. */
export function folderPath(folderId: FolderId, folders: Folder[]): string {
  return folderPathParts(folderId, folders).join(' / ');
}
