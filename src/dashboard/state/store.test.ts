import { beforeEach, describe, expect, it } from 'vitest';
import { createStore } from './store';
import { createVaultStorage } from '../../core/storage';
import type { VaultStorage } from '../../core/storage';
import { INBOX_ID } from '../../core/types';
import type { LiveTab } from '../../platform/chrome';

function freshStorage(): VaultStorage {
  // Unique db name per test so fake-indexeddb state never leaks between tests.
  return createVaultStorage({ dbName: `store-test-${Math.random()}` });
}

function live(id: number, url: string, title = `t${id}`): LiveTab {
  return { id, windowId: 1, url, title };
}

describe('createStore', () => {
  let storage: VaultStorage;

  beforeEach(() => {
    storage = freshStorage();
  });

  it('load() seeds the Inbox and starts with no tabs', async () => {
    const store = createStore(storage);
    await store.load();
    const { folders, tabs } = store.getState();
    expect(folders.some((f) => f.id === INBOX_ID)).toBe(true);
    expect(tabs).toEqual([]);
  });

  it('captureLiveTabs files into the Inbox by default and notifies', async () => {
    const store = createStore(storage);
    await store.load();
    let notified = 0;
    store.subscribe(() => notified++);

    const created = await store.captureLiveTabs([
      live(1, 'https://a.io'),
      live(2, 'https://b.io'),
    ]);

    expect(created).toHaveLength(2);
    expect(notified).toBeGreaterThan(0);
    const tabs = store.getState().tabs;
    expect(tabs).toHaveLength(2);
    expect(tabs.every((t) => t.folderId === INBOX_ID)).toBe(true);
    // Distinct, ascending orders so they keep capture order.
    expect(tabs[0].order).not.toBe(tabs[1].order);
  });

  it('captureLiveTabs skips empty-url tabs', async () => {
    const store = createStore(storage);
    await store.load();
    const created = await store.captureLiveTabs([
      live(1, ''),
      live(2, '   '),
      live(3, 'https://real.io'),
    ]);
    expect(created).toHaveLength(1);
    expect(store.getState().tabs).toHaveLength(1);
  });

  it('captureLiveTabs can file straight into a chosen folder', async () => {
    const store = createStore(storage);
    await store.load();
    const fid = await store.createFolder('Work', null);
    await store.captureLiveTabs([live(1, 'https://a.io')], fid);
    expect(store.getState().tabs[0].folderId).toBe(fid);
  });

  it('createFolder / renameFolder / deleteFolder cascade', async () => {
    const store = createStore(storage);
    await store.load();
    const parent = await store.createFolder('Parent', null);
    const child = await store.createFolder('Child', parent);
    await store.captureLiveTabs([live(1, 'https://a.io')], child);

    await store.renameFolder(parent, 'Renamed');
    expect(store.getState().folders.find((f) => f.id === parent)?.name).toBe(
      'Renamed',
    );

    await store.deleteFolder(parent);
    const s = store.getState();
    expect(s.folders.some((f) => f.id === parent)).toBe(false);
    expect(s.folders.some((f) => f.id === child)).toBe(false);
    // Its tabs are gone too.
    expect(s.tabs).toHaveLength(0);
  });

  it('renameFolder throws on the system Inbox', async () => {
    const store = createStore(storage);
    await store.load();
    await expect(store.renameFolder(INBOX_ID, 'Nope')).rejects.toThrow();
  });

  it('moveTabsInto moves saved tabs between folders', async () => {
    const store = createStore(storage);
    await store.load();
    const dest = await store.createFolder('Dest', null);
    await store.captureLiveTabs([
      live(1, 'https://a.io'),
      live(2, 'https://b.io'),
    ]);
    const ids = store.getState().tabs.map((t) => t.id);

    await store.moveTabsInto(ids, dest);
    expect(store.getState().tabs.every((t) => t.folderId === dest)).toBe(true);
  });

  it('moveFolder reparents a folder', async () => {
    const store = createStore(storage);
    await store.load();
    const a = await store.createFolder('A', null);
    const b = await store.createFolder('B', null);
    await store.moveFolder(b, a, 0);
    expect(store.getState().folders.find((f) => f.id === b)?.parentId).toBe(a);
  });

  it('removeTabs deletes tabs (dedupe cleanup)', async () => {
    const store = createStore(storage);
    await store.load();
    await store.captureLiveTabs([
      live(1, 'https://a.io'),
      live(2, 'https://a.io'),
    ]);
    const [first] = store.getState().tabs;
    await store.removeTabs([first.id]);
    expect(store.getState().tabs).toHaveLength(1);
  });

  it('importSnapshot(replace) swaps the whole vault', async () => {
    const store = createStore(storage);
    await store.load();
    await store.captureLiveTabs([live(1, 'https://old.io')]);

    await store.importSnapshot(
      {
        version: 1,
        exportedAt: 0,
        folders: [
          { id: 'x', name: 'X', parentId: null, order: 1000, createdAt: 0 },
        ],
        tabs: [
          {
            id: 'nt',
            url: 'https://new.io',
            title: 'New',
            savedAt: 0,
            folderId: 'x',
            order: 1000,
          },
        ],
      },
      'replace',
    );

    const s = store.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].url).toBe('https://new.io');
    expect(s.folders.some((f) => f.id === 'x')).toBe(true);
    // Replace preserves the Inbox invariant.
    expect(s.folders.some((f) => f.id === INBOX_ID)).toBe(true);
  });

  it('unsubscribe stops notifications', async () => {
    const store = createStore(storage);
    await store.load();
    let count = 0;
    const off = store.subscribe(() => count++);
    off();
    await store.captureLiveTabs([live(1, 'https://a.io')]);
    expect(count).toBe(0);
  });
});
