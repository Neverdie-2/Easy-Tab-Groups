/**
 * Vault storage adapter — the ONLY IndexedDB module (docs/PLAN.md §3.5).
 *
 * DB name `easy-tab-groups`, version 1. Object stores: `folders` (keyPath
 * `id`), `tabs` (keyPath `id`, indexes: `by_folder` on `folderId`, `by_url` on
 * `url`). On init, seed the system INBOX_ID folder if absent. Batch writes use
 * one transaction. Async only; injectable `IDBFactory` for tests.
 *
 * NOTE: scaffold stub — implemented in Phase 2 (TDD, against fake-indexeddb).
 */
import type { Folder, FolderId, SavedTab, TabId, VaultSnapshot } from './types';

export interface VaultStorage {
  init(): Promise<void>;

  getAllFolders(): Promise<Folder[]>;
  getAllTabs(): Promise<SavedTab[]>;
  /** Uses the `by_folder` index. */
  getTabsByFolder(folderId: FolderId): Promise<SavedTab[]>;
  /** Uses the `by_url` index; returns all matches. */
  findTabsByUrl(url: string): Promise<SavedTab[]>;

  putFolder(folder: Folder): Promise<void>;
  /** One transaction. */
  putFolders(folders: Folder[]): Promise<void>;
  deleteFolders(ids: FolderId[]): Promise<void>;

  putTab(tab: SavedTab): Promise<void>;
  /** One transaction (thousands ok). */
  putTabs(tabs: SavedTab[]): Promise<void>;
  deleteTabs(ids: TabId[]): Promise<void>;

  exportSnapshot(): Promise<VaultSnapshot>;
  importSnapshot(snap: VaultSnapshot, mode: 'merge' | 'replace'): Promise<void>;
  /** Empties the vault but preserves the seeded Inbox. */
  clearAll(): Promise<void>;
}

export interface CreateVaultStorageOptions {
  dbName?: string;
  factory?: IDBFactory;
}

export function createVaultStorage(
  _opts?: CreateVaultStorageOptions,
): VaultStorage {
  throw new Error('not implemented: scaffold stub');
}
