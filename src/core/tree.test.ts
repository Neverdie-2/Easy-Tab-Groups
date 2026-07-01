import { describe, expect, it } from 'vitest';
import {
  buildTree,
  collectTabs,
  createFolder,
  deleteFolderCascade,
  descendantFolderIds,
  folderPath,
  isDescendant,
  moveFolder,
  moveTabs,
  renameFolder,
  reorderTab,
} from './tree';
import { INBOX_ID } from './types';
import type { Folder, SavedTab } from './types';

// --- tiny builders -------------------------------------------------------

function f(
  id: string,
  parentId: string | null,
  order: number,
  extra: Partial<Folder> = {},
): Folder {
  return { id, name: id, parentId, order, createdAt: 0, ...extra };
}

function t(
  id: string,
  folderId: string,
  order: number,
  extra: Partial<SavedTab> = {},
): SavedTab {
  return {
    id,
    url: `https://example.com/${id}`,
    title: id,
    savedAt: 0,
    folderId,
    order,
    ...extra,
  };
}

const inbox = (): Folder =>
  f(INBOX_ID, null, 0, { name: 'Inbox', system: true });

/** A linear chain root -> L1 -> ... -> L(depth), each folder holding one tab. */
function chain(depth: number): { folders: Folder[]; tabs: SavedTab[] } {
  const folders: Folder[] = [];
  const tabs: SavedTab[] = [];
  let parent: string | null = null;
  for (let i = 0; i < depth; i++) {
    const id = `L${i}`;
    folders.push(f(id, parent, 1000));
    tabs.push(t(`tab${i}`, id, 1000));
    parent = id;
  }
  return { folders, tabs };
}

// --- buildTree -----------------------------------------------------------

describe('buildTree', () => {
  it('nests folders and attaches tabs', () => {
    const folders = [f('a', null, 1000), f('b', 'a', 1000)];
    const tabs = [t('t1', 'b', 1000)];
    const roots = buildTree(folders, tabs);
    expect(roots).toHaveLength(1);
    expect(roots[0].folder.id).toBe('a');
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].folder.id).toBe('b');
    expect(roots[0].children[0].tabs.map((x) => x.id)).toEqual(['t1']);
  });

  it('sorts children and tabs by order ascending', () => {
    const folders = [f('a', null, 1000), f('c', 'a', 3000), f('b', 'a', 2000)];
    const tabs = [t('t2', 'a', 2000), t('t1', 'a', 1000)];
    const roots = buildTree(folders, tabs);
    expect(roots[0].children.map((c) => c.folder.id)).toEqual(['b', 'c']);
    expect(roots[0].tabs.map((x) => x.id)).toEqual(['t1', 't2']);
  });

  it('surfaces an orphan (missing parent) at the top level', () => {
    const folders = [f('orphan', 'ghost-parent', 1000)];
    const roots = buildTree(folders, []);
    expect(roots.map((r) => r.folder.id)).toEqual(['orphan']);
  });

  it('does not mutate inputs', () => {
    const folders = [f('a', null, 2000), f('b', null, 1000)];
    const tabs = [t('t1', 'a', 2000), t('t0', 'a', 1000)];
    const snapF = structuredClone(folders);
    const snapT = structuredClone(tabs);
    buildTree(folders, tabs);
    expect(folders).toEqual(snapF);
    expect(tabs).toEqual(snapT);
  });

  it('handles an empty tree', () => {
    expect(buildTree([], [])).toEqual([]);
  });
});

// --- createFolder / renameFolder ----------------------------------------

describe('createFolder', () => {
  it('orders after the last sibling and is not a system folder', () => {
    const siblings = [f('a', 'p', 1000), f('b', 'p', 2000)];
    const created = createFolder('  New  ', 'p', siblings);
    expect(created.name).toBe('New');
    expect(created.parentId).toBe('p');
    expect(created.order).toBe(3000);
    expect(created.system).toBeUndefined();
    expect(created.id).toBeTruthy();
  });

  it('starts at the first order when there are no siblings', () => {
    expect(createFolder('Top', null, []).order).toBe(1000);
  });

  it('rejects an empty / whitespace name', () => {
    expect(() => createFolder('   ', null, [])).toThrow();
  });
});

describe('renameFolder', () => {
  it('renames and returns a new object without mutating the input', () => {
    const original = f('a', null, 1000);
    const renamed = renameFolder(original, '  Renamed ');
    expect(renamed.name).toBe('Renamed');
    expect(renamed).not.toBe(original);
    expect(original.name).toBe('a');
  });

  it('throws when renaming the system Inbox', () => {
    expect(() => renameFolder(inbox(), 'Nope')).toThrow();
  });

  it('rejects an empty name', () => {
    expect(() => renameFolder(f('a', null, 1000), '   ')).toThrow();
  });
});

// --- descendants / isDescendant -----------------------------------------

describe('descendantFolderIds & isDescendant', () => {
  it('collects all descendants of a deep chain (>= 5 levels)', () => {
    const { folders } = chain(6); // L0..L5
    const ids = descendantFolderIds('L0', folders).sort();
    expect(ids).toEqual(['L1', 'L2', 'L3', 'L4', 'L5']);
    expect(descendantFolderIds('L5', folders)).toEqual([]);
  });

  it('reports descendant relationships correctly', () => {
    const { folders } = chain(4); // L0..L3
    expect(isDescendant('L3', 'L0', folders)).toBe(true);
    expect(isDescendant('L0', 'L3', folders)).toBe(false);
    expect(isDescendant('L1', 'L1', folders)).toBe(true); // self counts
  });

  it('is cycle-safe on malformed data', () => {
    // a <-> b cycle
    const folders = [f('a', 'b', 1000), f('b', 'a', 1000)];
    expect(() => descendantFolderIds('a', folders)).not.toThrow();
    const ids = descendantFolderIds('a', folders).sort();
    expect(ids).toEqual(['b']);
  });
});

// --- moveFolder ----------------------------------------------------------

describe('moveFolder', () => {
  it('reparents and re-spaces the new sibling list', () => {
    const folders = [
      f('a', null, 1000),
      f('b', null, 2000),
      f('c', null, 3000),
    ];
    const changed = moveFolder('c', null, 0, folders);
    const byId = new Map(changed.map((x) => [x.id, x]));
    expect(changed.map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(byId.get('c')!.order).toBe(1000);
    expect(byId.get('a')!.order).toBe(2000);
    expect(byId.get('b')!.order).toBe(3000);
    expect(byId.get('c')!.parentId).toBeNull();
  });

  it('moves a folder under a new parent at an index', () => {
    const folders = [
      f('p', null, 1000),
      f('x', 'p', 1000),
      f('y', 'p', 2000),
      f('m', null, 2000),
    ];
    const changed = moveFolder('m', 'p', 1, folders);
    expect(changed.map((c) => c.id)).toEqual(['x', 'm', 'y']);
    expect(changed.every((c) => c.parentId === 'p')).toBe(true);
  });

  it('clamps an out-of-range index', () => {
    const folders = [f('p', null, 1000), f('x', 'p', 1000), f('m', null, 2000)];
    const changed = moveFolder('m', 'p', 99, folders);
    expect(changed.map((c) => c.id)).toEqual(['x', 'm']);
  });

  it('throws when moving a folder into its own subtree', () => {
    const { folders } = chain(3); // L0 -> L1 -> L2
    expect(() => moveFolder('L0', 'L2', 0, folders)).toThrow(/subtree|itself/i);
    expect(() => moveFolder('L0', 'L0', 0, folders)).toThrow();
  });

  it('throws when moving the system folder', () => {
    const folders = [inbox(), f('a', null, 1000)];
    expect(() => moveFolder(INBOX_ID, 'a', 0, folders)).toThrow();
  });

  it('throws on an unknown folder or unknown target parent', () => {
    const folders = [f('a', null, 1000)];
    expect(() => moveFolder('ghost', null, 0, folders)).toThrow();
    expect(() => moveFolder('a', 'ghost', 0, folders)).toThrow();
  });

  it('does not mutate inputs', () => {
    const folders = [f('a', null, 1000), f('b', null, 2000)];
    const snap = structuredClone(folders);
    moveFolder('b', null, 0, folders);
    expect(folders).toEqual(snap);
  });
});

// --- deleteFolderCascade -------------------------------------------------

describe('deleteFolderCascade', () => {
  it('returns the folder, all descendants, and all their tabs', () => {
    const folders = [
      f('a', null, 1000),
      f('b', 'a', 1000),
      f('c', 'b', 1000),
      f('other', null, 2000),
    ];
    const tabs = [
      t('t1', 'a', 1000),
      t('t2', 'b', 1000),
      t('t3', 'c', 1000),
      t('keep', 'other', 1000),
    ];
    const plan = deleteFolderCascade('a', folders, tabs);
    expect(plan.folderIds.sort()).toEqual(['a', 'b', 'c']);
    expect(plan.tabIds.sort()).toEqual(['t1', 't2', 't3']);
  });

  it('throws on the system folder and unknown folder', () => {
    const folders = [inbox()];
    expect(() => deleteFolderCascade(INBOX_ID, folders, [])).toThrow();
    expect(() => deleteFolderCascade('ghost', folders, [])).toThrow();
  });
});

// --- moveTabs ------------------------------------------------------------

describe('moveTabs', () => {
  it('reassigns folderId and appends after existing tabs', () => {
    const tabs = [
      t('existing', 'target', 5000),
      t('a', INBOX_ID, 1000),
      t('b', INBOX_ID, 2000),
    ];
    const changed = moveTabs(['a', 'b'], 'target', tabs);
    expect(changed.map((c) => c.id)).toEqual(['a', 'b']);
    expect(changed.every((c) => c.folderId === 'target')).toBe(true);
    expect(changed.map((c) => c.order)).toEqual([6000, 7000]);
  });

  it('appends from order 0 when the target folder is empty', () => {
    const tabs = [t('a', INBOX_ID, 1000), t('b', INBOX_ID, 2000)];
    const changed = moveTabs(['a', 'b'], 'target', tabs);
    expect(changed.map((c) => c.order)).toEqual([1000, 2000]);
  });

  it('handles a large batch (select-all-matching)', () => {
    const tabs = Array.from({ length: 500 }, (_, i) =>
      t(`x${i}`, INBOX_ID, (i + 1) * 1000),
    );
    const ids = tabs.map((x) => x.id);
    const changed = moveTabs(ids, 'target', tabs);
    expect(changed).toHaveLength(500);
    expect(new Set(changed.map((c) => c.order)).size).toBe(500);
    expect(changed.every((c) => c.folderId === 'target')).toBe(true);
  });

  it('ignores unknown ids and returns [] when nothing matches', () => {
    const tabs = [t('a', INBOX_ID, 1000)];
    expect(moveTabs(['ghost'], 'target', tabs)).toEqual([]);
  });

  it('does not mutate inputs', () => {
    const tabs = [t('a', INBOX_ID, 1000)];
    const snap = structuredClone(tabs);
    moveTabs(['a'], 'target', tabs);
    expect(tabs).toEqual(snap);
  });
});

// --- reorderTab ----------------------------------------------------------

describe('reorderTab', () => {
  it('re-spaces the target folder with the tab at the new index', () => {
    const tabs = [t('x', 'A', 1000), t('y', 'A', 2000), t('z', 'A', 3000)];
    const changed = reorderTab('z', 'A', 0, tabs);
    expect(changed.map((c) => c.id)).toEqual(['z', 'x', 'y']);
    expect(changed.map((c) => c.order)).toEqual([1000, 2000, 3000]);
  });

  it('moves a tab into a different folder at an index', () => {
    const tabs = [t('a', 'A', 1000), t('b', 'B', 1000)];
    const changed = reorderTab('a', 'B', 0, tabs);
    expect(changed.map((c) => c.id)).toEqual(['a', 'b']);
    expect(changed.every((c) => c.folderId === 'B')).toBe(true);
  });

  it('throws on an unknown tab', () => {
    expect(() => reorderTab('ghost', 'A', 0, [])).toThrow();
  });
});

// --- collectTabs ---------------------------------------------------------

describe('collectTabs', () => {
  const folders = [
    f('A', null, 1000),
    f('B', 'A', 1000),
    f('C', 'A', 2000),
    f('D', 'B', 1000),
  ];
  const tabs = [
    t('a1', 'A', 1000),
    t('b1', 'B', 1000),
    t('c1', 'C', 1000),
    t('d1', 'D', 1000),
  ];

  it('returns only direct tabs when includeSubfolders is false', () => {
    expect(collectTabs('A', false, folders, tabs).map((x) => x.id)).toEqual([
      'a1',
    ]);
  });

  it('walks the subtree depth-first when includeSubfolders is true', () => {
    // A's tabs, then B (and its child D), then C.
    expect(collectTabs('A', true, folders, tabs).map((x) => x.id)).toEqual([
      'a1',
      'b1',
      'd1',
      'c1',
    ]);
  });

  it('returns [] for a folder with no tabs', () => {
    expect(collectTabs('C', false, folders, [])).toEqual([]);
  });
});

// --- folderPath ----------------------------------------------------------

describe('folderPath', () => {
  it('joins ancestor names root-first', () => {
    const folders = [
      f('a', null, 1000, { name: 'A' }),
      f('b', 'a', 1000, { name: 'B' }),
      f('c', 'b', 1000, { name: 'C' }),
    ];
    expect(folderPath('c', folders)).toBe('A / B / C');
  });

  it('returns "" for an unknown folder', () => {
    expect(folderPath('ghost', [])).toBe('');
  });
});

// --- unlimited nesting ---------------------------------------------------

describe('unlimited nesting', () => {
  it('builds and traverses a 50-deep chain', () => {
    const { folders, tabs } = chain(50);
    const roots = buildTree(folders, tabs);
    // Walk to the bottom counting depth.
    let depth = 0;
    let node = roots[0];
    while (node.children.length > 0) {
      depth++;
      node = node.children[0];
    }
    expect(depth).toBe(49); // 50 folders => 49 edges
    expect(descendantFolderIds('L0', folders)).toHaveLength(49);
    expect(collectTabs('L0', true, folders, tabs)).toHaveLength(50);
  });
});
