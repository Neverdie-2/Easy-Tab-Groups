/**
 * Tiny pub/sub store mirroring vault state <-> storage (docs/PLAN.md §3.15).
 *
 * DOM-adjacent but holds NO `chrome.*` logic (the only `chrome` reference is the
 * `LiveTab` *type*, erased at build time). It is the single place the dashboard
 * mutates the vault: every mutation runs a PURE core operation, persists the
 * result through `VaultStorage`, then reloads and notifies subscribers. Reload
 * is a full re-read — deliberately simple and correct; reads are cheap and only
 * happen on mutations, never on render.
 *
 * Because it depends only on the pure core + the injectable `VaultStorage`, the
 * store is fully unit-testable under fake-indexeddb (see `store.test.ts`).
 */
import { ORDER_STEP, newId } from '../../core/ids';
import {
  createFolder as makeFolder,
  deleteFolderCascade,
  moveFolder as planFolderMove,
  moveTabs as planTabMove,
  renameFolder as renameFolderRecord,
} from '../../core/tree';
import { INBOX_ID } from '../../core/types';
import type {
  Folder,
  FolderId,
  SavedTab,
  TabId,
  VaultSnapshot,
} from '../../core/types';
import type { VaultStorage } from '../../core/storage';
import type { LiveTab } from '../../platform/chrome';

export interface VaultState {
  folders: Folder[];
  tabs: SavedTab[];
}

export interface Store {
  getState(): VaultState;
  /** Returns an unsubscribe function. */
  subscribe(fn: () => void): () => void;
  /** Load from VaultStorage (init + first read). */
  load(): Promise<void>;

  /**
   * Persist the given live tabs as SavedTabs. Defaults to the Inbox ("Import
   * open tabs"); pass a `folderId` to file a selection straight into a folder.
   * Tabs with an empty url are skipped. Returns the created SavedTabs so the
   * caller can, e.g., close the matching live tabs afterwards.
   */
  captureLiveTabs(live: LiveTab[], folderId?: FolderId): Promise<SavedTab[]>;
  /** Move already-saved tabs into a folder (append). */
  moveTabsInto(tabIds: TabId[], folderId: FolderId): Promise<void>;
  createFolder(name: string, parentId: FolderId | null): Promise<FolderId>;
  renameFolder(id: FolderId, name: string): Promise<void>;
  moveFolder(
    id: FolderId,
    parentId: FolderId | null,
    index: number,
  ): Promise<void>;
  deleteFolder(id: FolderId): Promise<void>;
  /** Used by dedupe cleanup. */
  removeTabs(ids: TabId[]): Promise<void>;
  importSnapshot(snap: VaultSnapshot, mode: 'merge' | 'replace'): Promise<void>;
}

/** Highest `order` among tabs already in a folder (0 if empty). */
function maxTabOrder(tabs: SavedTab[], folderId: FolderId): number {
  let max = 0;
  for (const t of tabs) {
    if (t.folderId === folderId && t.order > max) max = t.order;
  }
  return max;
}

export function createStore(storage: VaultStorage): Store {
  let state: VaultState = { folders: [], tabs: [] };
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const fn of listeners) fn();
  }

  async function reload(): Promise<void> {
    const [folders, tabs] = await Promise.all([
      storage.getAllFolders(),
      storage.getAllTabs(),
    ]);
    state = { folders, tabs };
    notify();
  }

  return {
    getState() {
      return state;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },

    async load() {
      await storage.init();
      await reload();
    },

    async captureLiveTabs(live, folderId = INBOX_ID) {
      const savable = live.filter((t) => (t.url ?? '').trim().length > 0);
      if (savable.length === 0) return [];
      const now = Date.now();
      const base = maxTabOrder(state.tabs, folderId);
      const created: SavedTab[] = savable.map((t, i) => ({
        id: newId(),
        url: t.url,
        title: t.title,
        savedAt: now,
        folderId,
        order: base + (i + 1) * ORDER_STEP,
      }));
      await storage.putTabs(created);
      await reload();
      return created;
    },

    async moveTabsInto(tabIds, folderId) {
      const changed = planTabMove(tabIds, folderId, state.tabs);
      if (changed.length === 0) return;
      await storage.putTabs(changed);
      await reload();
    },

    async createFolder(name, parentId) {
      const siblings = state.folders.filter((f) => f.parentId === parentId);
      const folder = makeFolder(name, parentId, siblings);
      await storage.putFolder(folder);
      await reload();
      return folder.id;
    },

    async renameFolder(id, name) {
      const folder = state.folders.find((f) => f.id === id);
      if (!folder) throw new Error(`Unknown folder: ${id}`);
      const renamed = renameFolderRecord(folder, name);
      await storage.putFolder(renamed);
      await reload();
    },

    async moveFolder(id, parentId, index) {
      const changed = planFolderMove(id, parentId, index, state.folders);
      if (changed.length === 0) return;
      await storage.putFolders(changed);
      await reload();
    },

    async deleteFolder(id) {
      const { folderIds, tabIds } = deleteFolderCascade(
        id,
        state.folders,
        state.tabs,
      );
      if (tabIds.length > 0) await storage.deleteTabs(tabIds);
      await storage.deleteFolders(folderIds);
      await reload();
    },

    async removeTabs(ids) {
      if (ids.length === 0) return;
      await storage.deleteTabs(ids);
      await reload();
    },

    async importSnapshot(snap, mode) {
      await storage.importSnapshot(snap, mode);
      await reload();
    },
  };
}
