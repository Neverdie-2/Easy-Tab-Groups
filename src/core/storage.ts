/**
 * Vault storage adapter — the ONLY IndexedDB module (docs/PLAN.md §3.5).
 *
 * DB name `easy-tab-groups`, version 1. Object stores: `folders` (keyPath
 * `id`), `tabs` (keyPath `id`, indexes: `by_folder` on `folderId`, `by_url` on
 * `url`). On init, seed the system INBOX_ID folder if absent. Batch writes use
 * one transaction. Async only; injectable `IDBFactory` for tests (defaults to
 * the ambient global, which fake-indexeddb replaces under Vitest).
 *
 * This module hand-rolls a tiny promise wrapper over raw IndexedDB rather than
 * taking a wrapper dependency — fewer runtime deps = smaller trust surface,
 * directly serving the "user keeps crypto wallets in this browser" threat model.
 */
import { INBOX_ID } from './types';
import type { Folder, FolderId, SavedTab, TabId, VaultSnapshot } from './types';

const DEFAULT_DB_NAME = 'easy-tab-groups';
const DB_VERSION = 1;
const FOLDERS = 'folders';
const TABS = 'tabs';
const IDX_BY_FOLDER = 'by_folder';
const IDX_BY_URL = 'by_url';

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

/** The canonical system Inbox folder (fresh timestamp each seed). */
function makeInbox(): Folder {
  return {
    id: INBOX_ID,
    name: 'Inbox',
    parentId: null,
    order: 0,
    createdAt: Date.now(),
    system: true,
  };
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Resolve when a transaction has fully committed (durable), or reject on
 * error/abort. Awaiting `complete` — not the last request's `success` — is what
 * makes a batch write atomic and safe against concurrent transactions.
 */
function txnDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FOLDERS)) {
        db.createObjectStore(FOLDERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(TABS)) {
        const store = db.createObjectStore(TABS, { keyPath: 'id' });
        store.createIndex(IDX_BY_FOLDER, 'folderId', { unique: false });
        store.createIndex(IDX_BY_URL, 'url', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    // A higher on-disk version than DB_VERSION surfaces here as a loud failure
    // (VersionError) rather than silent data loss — see the plan's version guard.
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new DOMException('IndexedDB open blocked', 'InvalidStateError'));
  });
}

async function seedInboxIfAbsent(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(FOLDERS, 'readwrite');
  const store = tx.objectStore(FOLDERS);
  const existing = await promisifyRequest(store.get(INBOX_ID));
  if (!existing) store.put(makeInbox());
  await txnDone(tx);
}

export function createVaultStorage(
  opts?: CreateVaultStorageOptions,
): VaultStorage {
  const dbName = opts?.dbName ?? DEFAULT_DB_NAME;
  const factory = opts?.factory ?? globalThis.indexedDB;

  // Memoized open+seed. All operations funnel through here, so concurrent
  // callers share one open handle and `init()` is idempotent.
  let dbPromise: Promise<IDBDatabase> | null = null;
  function getDb(): Promise<IDBDatabase> {
    if (!dbPromise) {
      if (!factory) {
        return Promise.reject(
          new Error('No IndexedDB factory available in this environment'),
        );
      }
      const pending = openDatabase(factory, dbName).then(async (db) => {
        db.onversionchange = () => db.close();
        await seedInboxIfAbsent(db);
        return db;
      });
      // On failure, forget the promise so a later call can retry cleanly.
      pending.catch(() => {
        dbPromise = null;
      });
      dbPromise = pending;
    }
    return dbPromise;
  }

  async function readAll<T>(store: string): Promise<T[]> {
    const db = await getDb();
    const tx = db.transaction(store, 'readonly');
    const result = await promisifyRequest(
      tx.objectStore(store).getAll() as IDBRequest<T[]>,
    );
    await txnDone(tx);
    return result;
  }

  async function putMany<T>(store: string, items: T[]): Promise<void> {
    const db = await getDb();
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const item of items) os.put(item);
    await txnDone(tx);
  }

  async function deleteMany(store: string, ids: string[]): Promise<void> {
    const db = await getDb();
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const id of ids) os.delete(id);
    await txnDone(tx);
  }

  return {
    async init() {
      await getDb();
    },

    getAllFolders() {
      return readAll<Folder>(FOLDERS);
    },

    getAllTabs() {
      return readAll<SavedTab>(TABS);
    },

    async getTabsByFolder(folderId) {
      const db = await getDb();
      const tx = db.transaction(TABS, 'readonly');
      const index = tx.objectStore(TABS).index(IDX_BY_FOLDER);
      const result = await promisifyRequest(
        index.getAll(folderId) as IDBRequest<SavedTab[]>,
      );
      await txnDone(tx);
      return result;
    },

    async findTabsByUrl(url) {
      const db = await getDb();
      const tx = db.transaction(TABS, 'readonly');
      const index = tx.objectStore(TABS).index(IDX_BY_URL);
      const result = await promisifyRequest(
        index.getAll(url) as IDBRequest<SavedTab[]>,
      );
      await txnDone(tx);
      return result;
    },

    putFolder(folder) {
      return putMany(FOLDERS, [folder]);
    },

    putFolders(folders) {
      return putMany(FOLDERS, folders);
    },

    deleteFolders(ids) {
      return deleteMany(FOLDERS, ids);
    },

    putTab(tab) {
      return putMany(TABS, [tab]);
    },

    putTabs(tabs) {
      return putMany(TABS, tabs);
    },

    deleteTabs(ids) {
      return deleteMany(TABS, ids);
    },

    async exportSnapshot() {
      const db = await getDb();
      const tx = db.transaction([FOLDERS, TABS], 'readonly');
      const folders = await promisifyRequest(
        tx.objectStore(FOLDERS).getAll() as IDBRequest<Folder[]>,
      );
      const tabs = await promisifyRequest(
        tx.objectStore(TABS).getAll() as IDBRequest<SavedTab[]>,
      );
      await txnDone(tx);
      return { version: 1, exportedAt: Date.now(), folders, tabs };
    },

    async importSnapshot(snap, mode) {
      const db = await getDb();
      const folders = snap?.folders ?? [];
      const tabs = snap?.tabs ?? [];
      const tx = db.transaction([FOLDERS, TABS], 'readwrite');
      const fStore = tx.objectStore(FOLDERS);
      const tStore = tx.objectStore(TABS);
      if (mode === 'replace') {
        fStore.clear();
        tStore.clear();
      }
      for (const f of folders) fStore.put(f);
      for (const t of tabs) tStore.put(t);
      // Preserve the "there is always an Inbox" invariant after a replace.
      if (mode === 'replace' && !folders.some((f) => f.id === INBOX_ID)) {
        fStore.put(makeInbox());
      }
      await txnDone(tx);
    },

    async clearAll() {
      const db = await getDb();
      const tx = db.transaction([FOLDERS, TABS], 'readwrite');
      tx.objectStore(FOLDERS).clear();
      tx.objectStore(TABS).clear();
      tx.objectStore(FOLDERS).put(makeInbox());
      await txnDone(tx);
    },
  };
}
