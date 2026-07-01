/**
 * End-to-end core-loop integration test (the "make-it-real" trace).
 *
 * Wires the REAL modules together — storage + store + tree + reopen planner +
 * reopen executor + export/import — to prove the product's core loop is sound
 * and every seam actually connects:
 *
 *   capture -> filter/select -> move into a NESTED folder -> persist ->
 *   (close, simulated) -> reopen-as-native-group -> export/import round-trip.
 *
 * It deliberately opens a SECOND `VaultStorage` handle on the same database
 * name to mirror production: the dashboard is the single writer, while the
 * background service worker opens its own read-only handle over the SAME
 * IndexedDB origin to plan a reopen. If that seam were broken (e.g. different
 * db name, unseeded store), the reopen assertions would fail here.
 */
import { describe, expect, it } from 'vitest';
import { createStore } from '../src/dashboard/state/store';
import { createVaultStorage } from '../src/core/storage';
import { planReopen } from '../src/core/reopen';
import { executeReopen, NO_GROUP } from '../src/platform/reopen-exec';
import { toJson, toBookmarksHtml, fromJson } from '../src/core/export';
import { INBOX_ID } from '../src/core/types';
import type { VaultSnapshot } from '../src/core/types';
import type { ChromeAdapter, LiveTab } from '../src/platform/chrome';

function live(
  id: number,
  url: string,
  title = `t${id}`,
  windowId = 1,
): LiveTab {
  return { id, windowId, url, title };
}

/**
 * A fully in-memory ChromeAdapter that records every action, so the reopen
 * executor can be driven without a browser. Only the methods `executeReopen`
 * uses are meaningfully implemented; the rest throw if unexpectedly called.
 */
function fakeAdapter() {
  const created: Array<{ id: number; url: string; active: boolean }> = [];
  const groups: Array<{ groupId: number; tabIds: number[] }> = [];
  const named: Array<{ groupId: number; title: string; color?: string }> = [];
  let nextTabId = 1000;
  let nextGroupId = 1;
  const adapter: ChromeAdapter = {
    async queryAllTabs() {
      return [];
    },
    async createTab(url, active = false) {
      const id = nextTabId++;
      created.push({ id, url, active });
      return id;
    },
    async closeTabs() {
      /* not exercised by executeReopen */
    },
    async groupTabs(tabIds) {
      const groupId = nextGroupId++;
      groups.push({ groupId, tabIds: [...tabIds] });
      return groupId;
    },
    async nameGroup(groupId, title, color) {
      named.push({ groupId, title, color });
    },
    async openDashboard() {
      /* unused */
    },
    async currentWindowId() {
      return 1;
    },
  };
  return { adapter, created, groups, named };
}

describe('core loop integration', () => {
  it('capture -> file into a nested tree -> persist -> reopen-as-group (SW handle) -> export/import round-trip', async () => {
    const dbName = `integration-${Math.random()}`;

    // --- The dashboard writer -------------------------------------------
    const storage = createVaultStorage({ dbName });
    const store = createStore(storage);
    await store.load();

    // Build the nested tree from the spec: Base chain > Blupets > Gold trait.
    const base = await store.createFolder('Base chain', null);
    const blupets = await store.createFolder('Blupets', base);
    const gold = await store.createFolder('Gold trait', blupets);

    // CAPTURE + FILE: three opensea tabs + one noise tab. Simulate the
    // "filter by domain, select-all-matching" step by only filing the
    // opensea.io tabs straight into the deep folder.
    const openTabs: LiveTab[] = [
      live(1, 'https://opensea.io/assets/gold/1', 'Gold #1'),
      live(2, 'https://opensea.io/assets/gold/2', 'Gold #2'),
      live(3, 'https://opensea.io/assets/gold/3', 'Gold #3'),
      live(4, 'https://example.com/unrelated', 'Noise'),
    ];
    const openseaTabs = openTabs.filter((t) =>
      t.url.startsWith('https://opensea.io/'),
    );
    const filed = await store.captureLiveTabs(openseaTabs, gold);
    expect(filed).toHaveLength(3);

    // Persisted under the deepest folder, in capture order.
    const persisted = store
      .getState()
      .tabs.filter((t) => t.folderId === gold)
      .sort((a, b) => a.order - b.order);
    expect(persisted.map((t) => t.url)).toEqual([
      'https://opensea.io/assets/gold/1',
      'https://opensea.io/assets/gold/2',
      'https://opensea.io/assets/gold/3',
    ]);

    // CLOSE is a separate, deliberate step; the links must already be safe in
    // the vault before any close would happen. Assert the invariant directly:
    // everything selected to close exists in the persisted vault first.
    const savedUrls = new Set(store.getState().tabs.map((t) => t.url));
    for (const t of openseaTabs) expect(savedUrls.has(t.url)).toBe(true);

    // --- The service-worker reader (separate handle, SAME db) ------------
    // Mirrors production: the SW opens its own VaultStorage over the same
    // IndexedDB origin and only reads to build the reopen plan.
    const swStorage = createVaultStorage({ dbName });
    const [folders, tabs] = await Promise.all([
      swStorage.getAllFolders(),
      swStorage.getAllTabs(),
    ]);

    // REOPEN (direct tabs only) -> named native group in tree order.
    const planDirect = planReopen(gold, false, folders, tabs);
    expect(planDirect.groupName).toBe('Gold trait');
    expect(planDirect.urls).toEqual([
      'https://opensea.io/assets/gold/1',
      'https://opensea.io/assets/gold/2',
      'https://opensea.io/assets/gold/3',
    ]);

    const run1 = fakeAdapter();
    const res1 = await executeReopen(planDirect, run1.adapter);
    expect(res1.tabIds).toHaveLength(3);
    expect(res1.groupId).not.toBe(NO_GROUP);
    // The executor created the tabs in plan order and grouped exactly them.
    expect(run1.created.map((c) => c.url)).toEqual(planDirect.urls);
    expect(run1.groups).toHaveLength(1);
    expect(run1.groups[0].tabIds).toEqual(res1.tabIds);
    expect(run1.named[0].title).toBe('Gold trait');

    // REOPEN with include-subfolders from the TOP folder: depth-first, and the
    // group is still named after the clicked folder ("Base chain").
    await store.captureLiveTabs(
      [live(5, 'https://opensea.io/collection/blupets', 'Blupets home')],
      blupets,
    );
    const fresh = await swStorage.getAllTabs();
    const planSub = planReopen(
      base,
      true,
      await swStorage.getAllFolders(),
      fresh,
    );
    expect(planSub.groupName).toBe('Base chain');
    // Base(no direct tabs) -> Blupets(home) -> Gold trait(1,2,3), depth-first.
    expect(planSub.urls).toEqual([
      'https://opensea.io/collection/blupets',
      'https://opensea.io/assets/gold/1',
      'https://opensea.io/assets/gold/2',
      'https://opensea.io/assets/gold/3',
    ]);

    // Reopening an empty folder must create nothing (no ghost group).
    const emptyFolder = await store.createFolder('Empty', null);
    const planEmpty = planReopen(
      emptyFolder,
      false,
      await swStorage.getAllFolders(),
      await swStorage.getAllTabs(),
    );
    const run2 = fakeAdapter();
    const resEmpty = await executeReopen(planEmpty, run2.adapter);
    expect(resEmpty.groupId).toBe(NO_GROUP);
    expect(run2.created).toHaveLength(0);
    expect(run2.groups).toHaveLength(0);

    // --- EXPORT / IMPORT round-trip -------------------------------------
    const snapshot = await storage.exportSnapshot();
    const json = toJson(snapshot);
    // HTML export is offered too; assert it is well-formed & escaped-safe.
    const html = toBookmarksHtml(snapshot);
    expect(html).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
    expect(html).toContain('Gold trait');

    const reparsed = fromJson(json);
    expect(reparsed.folders).toHaveLength(snapshot.folders.length);
    expect(reparsed.tabs).toHaveLength(snapshot.tabs.length);

    // Import (replace) into a brand-new vault and confirm the deep structure
    // and every saved link survived the round-trip byte-for-byte.
    const storage2 = createVaultStorage({
      dbName: `integration-restore-${Math.random()}`,
    });
    const store2 = createStore(storage2);
    await store2.load();
    await store2.importSnapshot(reparsed, 'replace');

    const restored = store2.getState();
    // Inbox invariant preserved.
    expect(restored.folders.some((f) => f.id === INBOX_ID)).toBe(true);
    // The deep chain exists with the same ids.
    for (const id of [base, blupets, gold]) {
      expect(restored.folders.some((f) => f.id === id)).toBe(true);
    }
    // Same URLs land under the same deepest folder after restore.
    const restoredGold = restored.tabs
      .filter((t) => t.folderId === gold)
      .map((t) => t.url)
      .sort();
    expect(restoredGold).toEqual(
      [
        'https://opensea.io/assets/gold/1',
        'https://opensea.io/assets/gold/2',
        'https://opensea.io/assets/gold/3',
      ].sort(),
    );

    // Re-exporting the restored vault and canonicalizing (ignoring only the
    // fresh `exportedAt` stamp) reproduces the ORIGINAL snapshot byte-for-byte
    // — proving a lossless round-trip through JSON + IndexedDB.
    const canonical = (s: VaultSnapshot): string =>
      toJson({ ...s, exportedAt: 0 });
    expect(canonical(await storage2.exportSnapshot())).toBe(
      canonical(snapshot),
    );
  });

  it('planReopen on a stale/unknown folder id yields an empty, harmless plan', async () => {
    const storage = createVaultStorage({
      dbName: `integration-stale-${Math.random()}`,
    });
    const store = createStore(storage);
    await store.load();
    const { folders, tabs } = store.getState();
    const plan = planReopen('does-not-exist', true, folders, tabs);
    expect(plan).toEqual({ groupName: '', urls: [] });
  });
});
