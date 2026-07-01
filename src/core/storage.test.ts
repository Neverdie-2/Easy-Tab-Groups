import { beforeEach, describe, expect, it } from 'vitest';
import { createVaultStorage } from './storage';
import type { VaultStorage } from './storage';
import { INBOX_ID } from './types';
import type { Folder, SavedTab, VaultSnapshot } from './types';

// A fresh DB name per test keeps fake-indexeddb's process-global state isolated.
function uniqueDbName(): string {
  return `etg-test-${crypto.randomUUID()}`;
}

function folder(id: string, extra: Partial<Folder> = {}): Folder {
  return { id, name: id, parentId: null, order: 1000, createdAt: 1, ...extra };
}

function tab(id: string, extra: Partial<SavedTab> = {}): SavedTab {
  return {
    id,
    url: `https://example.com/${id}`,
    title: id,
    savedAt: 1,
    folderId: INBOX_ID,
    order: 1000,
    ...extra,
  };
}

function openRaw(name: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => {
      /* create nothing — just bump the version */
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let storage: VaultStorage;

beforeEach(() => {
  storage = createVaultStorage({ dbName: uniqueDbName() });
});

describe('init', () => {
  it('seeds a system Inbox folder', async () => {
    await storage.init();
    const folders = await storage.getAllFolders();
    const box = folders.find((f) => f.id === INBOX_ID);
    expect(box).toBeDefined();
    expect(box?.system).toBe(true);
    expect(box?.parentId).toBeNull();
  });

  it('is idempotent — a second init does not duplicate the Inbox', async () => {
    await storage.init();
    await storage.init();
    const folders = await storage.getAllFolders();
    expect(folders.filter((f) => f.id === INBOX_ID)).toHaveLength(1);
  });

  it('tolerates many concurrent init calls (shared open handle)', async () => {
    await Promise.all(Array.from({ length: 10 }, () => storage.init()));
    const folders = await storage.getAllFolders();
    expect(folders.filter((f) => f.id === INBOX_ID)).toHaveLength(1);
  });
});

describe('folder & tab CRUD', () => {
  beforeEach(async () => {
    await storage.init();
  });

  it('round-trips folders', async () => {
    await storage.putFolder(folder('a', { name: 'Alpha' }));
    const got = await storage.getAllFolders();
    expect(got.find((f) => f.id === 'a')?.name).toBe('Alpha');
  });

  it('round-trips tabs', async () => {
    await storage.putTab(tab('t1'));
    const got = await storage.getAllTabs();
    expect(got.map((x) => x.id)).toEqual(['t1']);
  });

  it('getTabsByFolder uses the by_folder index', async () => {
    await storage.putTabs([
      tab('t1', { folderId: 'work' }),
      tab('t2', { folderId: 'work' }),
      tab('t3', { folderId: 'home' }),
    ]);
    const work = await storage.getTabsByFolder('work');
    expect(work.map((x) => x.id).sort()).toEqual(['t1', 't2']);
  });

  it('findTabsByUrl returns all matches via the by_url index', async () => {
    await storage.putTabs([
      tab('t1', { url: 'https://dup.example/x' }),
      tab('t2', { url: 'https://dup.example/x' }),
      tab('t3', { url: 'https://other.example/y' }),
    ]);
    const hits = await storage.findTabsByUrl('https://dup.example/x');
    expect(hits.map((x) => x.id).sort()).toEqual(['t1', 't2']);
  });

  it('writes a large batch (2,000 tabs) in one transaction', async () => {
    const many = Array.from({ length: 2000 }, (_, i) =>
      tab(`t${i}`, { order: i }),
    );
    await storage.putTabs(many);
    const all = await storage.getAllTabs();
    expect(all).toHaveLength(2000);
  });

  it('deletes folders and tabs', async () => {
    await storage.putFolders([folder('a'), folder('b')]);
    await storage.putTabs([tab('t1'), tab('t2')]);
    await storage.deleteFolders(['a']);
    await storage.deleteTabs(['t1']);
    const folders = await storage.getAllFolders();
    const tabs = await storage.getAllTabs();
    expect(folders.find((f) => f.id === 'a')).toBeUndefined();
    expect(folders.find((f) => f.id === 'b')).toBeDefined();
    expect(tabs.map((x) => x.id)).toEqual(['t2']);
  });

  it('handles empty batch writes without error', async () => {
    await storage.putTabs([]);
    await storage.putFolders([]);
    await storage.deleteTabs([]);
    expect(await storage.getAllTabs()).toEqual([]);
  });

  it('is robust to concurrent writes', async () => {
    await Promise.all(
      Array.from({ length: 25 }, (_, i) => storage.putTab(tab(`c${i}`))),
    );
    const all = await storage.getAllTabs();
    expect(all).toHaveLength(25);
  });
});

describe('export / import', () => {
  beforeEach(async () => {
    await storage.init();
  });

  it('round-trips identically via replace', async () => {
    await storage.putFolders([folder('a'), folder('b', { parentId: 'a' })]);
    await storage.putTabs([tab('t1'), tab('t2', { folderId: 'a' })]);
    const snap = await storage.exportSnapshot();
    expect(snap.version).toBe(1);

    const other = createVaultStorage({ dbName: uniqueDbName() });
    await other.init();
    await other.importSnapshot(snap, 'replace');
    const snap2 = await other.exportSnapshot();

    const sortById = <T extends { id: string }>(xs: T[]) =>
      [...xs].sort((x, y) => (x.id < y.id ? -1 : 1));
    expect(sortById(snap2.folders)).toEqual(sortById(snap.folders));
    expect(sortById(snap2.tabs)).toEqual(sortById(snap.tabs));
  });

  it('merge preserves existing rows and adds new ones (snapshot wins on id collision)', async () => {
    await storage.putFolders([folder('keep')]);
    await storage.putTabs([tab('t1', { title: 'original' })]);

    const snap: VaultSnapshot = {
      version: 1,
      exportedAt: 0,
      folders: [folder('added')],
      tabs: [
        tab('t1', { title: 'updated' }), // id collision -> snapshot wins
        tab('t2', { title: 'new' }),
      ],
    };
    await storage.importSnapshot(snap, 'merge');

    const folders = await storage.getAllFolders();
    const tabs = await storage.getAllTabs();
    expect(folders.map((f) => f.id).sort()).toEqual(
      [INBOX_ID, 'added', 'keep'].sort(),
    );
    expect(tabs.find((x) => x.id === 't1')?.title).toBe('updated');
    expect(tabs.find((x) => x.id === 't2')?.title).toBe('new');
  });

  it('replace re-seeds the Inbox when the snapshot lacks it', async () => {
    const snap: VaultSnapshot = {
      version: 1,
      exportedAt: 0,
      folders: [folder('only')],
      tabs: [],
    };
    await storage.importSnapshot(snap, 'replace');
    const folders = await storage.getAllFolders();
    expect(folders.find((f) => f.id === INBOX_ID)?.system).toBe(true);
    expect(folders.find((f) => f.id === 'only')).toBeDefined();
  });
});

describe('clearAll', () => {
  it('empties the vault but preserves a system Inbox', async () => {
    await storage.init();
    await storage.putFolders([folder('a')]);
    await storage.putTabs([tab('t1')]);
    await storage.clearAll();
    const folders = await storage.getAllFolders();
    const tabs = await storage.getAllTabs();
    expect(tabs).toEqual([]);
    expect(folders.map((f) => f.id)).toEqual([INBOX_ID]);
    expect(folders[0].system).toBe(true);
  });
});

describe('version guard', () => {
  it('fails loudly when the on-disk version is newer than the code expects', async () => {
    const name = uniqueDbName();
    const raw = await openRaw(name, 2); // future version 2
    raw.close();

    const stale = createVaultStorage({ dbName: name }); // expects version 1
    await expect(stale.init()).rejects.toBeTruthy();
  });
});
