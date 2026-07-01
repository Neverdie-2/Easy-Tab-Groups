/**
 * Tiny pub/sub store mirroring vault state <-> storage (docs/PLAN.md §3.15).
 * DOM-adjacent but holds no `chrome.*` logic. First-party (no signals lib).
 *
 * NOTE: scaffold stub — implemented in Phase 6.
 */
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
  /** Load from VaultStorage. */
  load(): Promise<void>;

  captureLiveTabs(live: LiveTab[]): Promise<void>;
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

export function createStore(_storage: VaultStorage): Store {
  throw new Error('not implemented: scaffold stub');
}
