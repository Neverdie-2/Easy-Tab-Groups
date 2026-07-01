/**
 * Top-level dashboard (docs/PLAN.md §2.6). Owns the singletons (storage, store,
 * chrome adapter), loads state, and wires the two panes + dialogs to the pure
 * core and the runtime.
 *
 * Boundaries: the ONLY `chrome.*` access is through `createChromeAdapter()` and
 * the typed `sendMessage` runtime port. All vault mutations go through the
 * `store`, which runs a pure core op then persists. Reopen is requested from the
 * background service worker via `REOPEN_FOLDER` ("open as native tab group via
 * the runtime").
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { createVaultStorage } from '../core/storage';
import { createStore } from './state/store';
import { createChromeAdapter } from '../platform/chrome';
import type { LiveTab } from '../platform/chrome';
import { sendMessage } from '../platform/messages';
import { getPrefs, setPrefs as persistPrefs } from '../platform/prefs';
import type { Prefs } from '../platform/prefs';
import { findDuplicates } from '../core/dedupe';
import type { DedupeOptions } from '../core/dedupe';
import type { FolderId, TabId, VaultSnapshot } from '../core/types';
import { Toolbar } from './components/Toolbar';
import { InboxPane } from './panes/InboxPane';
import { TreePane } from './panes/TreePane';
import { DedupeDialog } from './components/DedupeDialog';
import { ExportImportDialog } from './components/ExportImportDialog';
import { FirstRunIntro } from './components/FirstRunIntro';

// App-lifetime singletons. None of these touch chrome/IndexedDB until used.
const storage = createVaultStorage();
const store = createStore(storage);
const adapter = createChromeAdapter();

/** The extension's own origin, so we never save/close our own dashboard tab. */
const SELF_ORIGIN = location.origin;

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Subscribe to the store and re-render on every notification. */
function useVaultState() {
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick((n) => n + 1)), []);
  return store.getState();
}

type Dialog = 'none' | 'dedupe' | 'exportImport';

export function App() {
  const vault = useVaultState();

  const [loaded, setLoaded] = useState(false);
  const [prefs, setLocalPrefs] = useState<Prefs | null>(null);
  const [firstRun, setFirstRun] = useState(false);
  const [liveTabs, setLiveTabs] = useState<LiveTab[]>([]);
  const [liveLoading, setLiveLoading] = useState(true);
  const [dialog, setDialog] = useState<Dialog>('none');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const includeSubfolders = prefs?.includeSubfoldersDefault ?? false;
  const dedupeOptions: DedupeOptions = prefs?.dedupe ?? {};

  const duplicateGroups = useMemo(
    () => findDuplicates(vault.tabs, dedupeOptions),
    [vault.tabs, dedupeOptions],
  );

  // --- lifecycle ---------------------------------------------------------

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await store.load();
        if (!alive) return;
        setLoaded(true);
        const p = await getPrefs();
        if (!alive) return;
        setLocalPrefs(p);
        setFirstRun(!p.firstRunSeen);
      } catch (err) {
        if (alive) setStatus(errMsg(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function refreshLiveTabs(): Promise<void> {
    setLiveLoading(true);
    try {
      const all = await adapter.queryAllTabs();
      setLiveTabs(all.filter((t) => !t.url.startsWith(SELF_ORIGIN)));
    } catch (err) {
      setStatus(errMsg(err));
    } finally {
      setLiveLoading(false);
    }
  }

  useEffect(() => {
    void refreshLiveTabs();
    const onFocus = (): void => void refreshLiveTabs();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // --- helpers -----------------------------------------------------------

  function run(work: () => Promise<void>): void {
    setBusy(true);
    setStatus(null);
    work()
      .catch((err) => setStatus(errMsg(err)))
      .finally(() => setBusy(false));
  }

  function updatePrefs(patch: Partial<Prefs>): void {
    setLocalPrefs((cur) =>
      cur
        ? { ...cur, ...patch, dedupe: { ...cur.dedupe, ...patch.dedupe } }
        : cur,
    );
    void persistPrefs(patch);
  }

  // --- actions -----------------------------------------------------------

  function handleImportAll(live: LiveTab[]): void {
    run(async () => {
      const created = await store.captureLiveTabs(live);
      setStatus(`Imported ${created.length} tab(s) into the Inbox.`);
    });
  }

  function handleFileLive(
    live: LiveTab[],
    folderId: FolderId,
    closeAfter: boolean,
  ): void {
    run(async () => {
      const created = await store.captureLiveTabs(live, folderId);
      if (closeAfter && live.length > 0) {
        await adapter.closeTabs(live.map((t) => t.id));
        await refreshLiveTabs();
      }
      setStatus(
        `Filed ${created.length} tab(s)${closeAfter ? ' and closed them' : ''}.`,
      );
    });
  }

  function handleReopen(folderId: FolderId, incSub: boolean): void {
    run(async () => {
      const res = await sendMessage({
        type: 'REOPEN_FOLDER',
        folderId,
        includeSubfolders: incSub,
      });
      if (!res.ok) throw new Error(res.error);
      await refreshLiveTabs();
      setStatus('Reopened folder as a native tab group.');
    });
  }

  function handleOpenTab(url: string): void {
    run(async () => {
      await adapter.createTab(url, true);
    });
  }

  async function handleCreateFolder(
    name: string,
    parentId: FolderId | null,
  ): Promise<FolderId> {
    setBusy(true);
    try {
      return await store.createFolder(name, parentId);
    } finally {
      setBusy(false);
    }
  }

  function handleRename(id: FolderId, name: string): void {
    run(() => store.renameFolder(id, name));
  }

  function handleDelete(id: FolderId): void {
    run(() => store.deleteFolder(id));
  }

  function handleMoveFolder(
    id: FolderId,
    parentId: FolderId | null,
    index: number,
  ): void {
    run(() => store.moveFolder(id, parentId, index));
  }

  function handleMoveTabsInto(tabIds: TabId[], folderId: FolderId): void {
    run(() => store.moveTabsInto(tabIds, folderId));
  }

  async function handleCleanup(removeIds: TabId[]): Promise<void> {
    setBusy(true);
    try {
      await store.removeTabs(removeIds);
      setStatus(`Removed ${removeIds.length} duplicate(s).`);
    } finally {
      setBusy(false);
    }
  }

  async function handleImportSnapshot(
    snap: VaultSnapshot,
    mode: 'merge' | 'replace',
  ): Promise<void> {
    setBusy(true);
    try {
      await store.importSnapshot(snap, mode);
    } finally {
      setBusy(false);
    }
  }

  function dismissFirstRun(): void {
    setFirstRun(false);
    updatePrefs({ firstRunSeen: true });
  }

  // --- render ------------------------------------------------------------

  if (!loaded) {
    return (
      <div class="etg-app etg-app--loading">
        <p>Loading your vault…</p>
      </div>
    );
  }

  return (
    <div class="etg-app">
      <header class="etg-header">
        <div class="etg-header__titles">
          <h1 class="etg-title">Easy Tab Groups</h1>
          <p class="etg-tagline">
            Local-only tab rescue &amp; nested organizer.
          </p>
        </div>
        <Toolbar
          savedCount={vault.tabs.length}
          folderCount={vault.folders.length}
          duplicateCount={duplicateGroups.length}
          busy={busy}
          onOpenDedupe={() => setDialog('dedupe')}
          onOpenExportImport={() => setDialog('exportImport')}
          onRefresh={() => void refreshLiveTabs()}
        />
      </header>

      {status ? (
        <div class="etg-status" role="status">
          <span>{status}</span>
          <button
            type="button"
            class="etg-btn etg-btn--icon"
            aria-label="Dismiss"
            onClick={() => setStatus(null)}
          >
            ×
          </button>
        </div>
      ) : null}

      <main class="etg-panes">
        <InboxPane
          liveTabs={liveTabs}
          loading={liveLoading}
          folders={vault.folders}
          busy={busy}
          onImportAll={handleImportAll}
          onFileLive={handleFileLive}
          onRefresh={() => void refreshLiveTabs()}
          onCreateFolder={handleCreateFolder}
        />
        <TreePane
          folders={vault.folders}
          tabs={vault.tabs}
          busy={busy}
          includeSubfolders={includeSubfolders}
          onIncludeSubfoldersChange={(v) =>
            updatePrefs({ includeSubfoldersDefault: v })
          }
          searchQuery={searchQuery}
          onSearchInput={setSearchQuery}
          onReopen={handleReopen}
          onOpenTab={handleOpenTab}
          onCreateFolder={(name, parentId) => {
            void handleCreateFolder(name, parentId);
          }}
          onRename={handleRename}
          onDelete={handleDelete}
          onMoveFolder={handleMoveFolder}
          onMoveTabsInto={handleMoveTabsInto}
        />
      </main>

      {dialog === 'dedupe' ? (
        <DedupeDialog
          tabs={vault.tabs}
          folders={vault.folders}
          options={dedupeOptions}
          onOptionsChange={(opts) => updatePrefs({ dedupe: opts })}
          onCleanup={handleCleanup}
          onClose={() => setDialog('none')}
        />
      ) : null}

      {dialog === 'exportImport' ? (
        <ExportImportDialog
          storage={storage}
          onImport={handleImportSnapshot}
          onStatus={setStatus}
          onClose={() => setDialog('none')}
        />
      ) : null}

      {firstRun ? <FirstRunIntro onDismiss={dismissFirstRun} /> : null}
    </div>
  );
}
