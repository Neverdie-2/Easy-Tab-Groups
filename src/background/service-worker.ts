/**
 * Background service worker (docs/PLAN.md §3.14). ESM module SW.
 *
 * Responsibilities:
 *   - `chrome.action.onClicked` -> open/focus the full-page dashboard.
 *   - Typed message router (via `platform/messages.onMessage`) for the
 *     privileged `chrome.*` actions any surface (dashboard now, side panel
 *     later) can request:
 *       OPEN_DASHBOARD  -> focus/create the dashboard page
 *       CAPTURE_TABS    -> read all live tabs (id/url/title/windowId)
 *       REOPEN_FOLDER   -> plan + open a folder as a native tab group
 *       CLOSE_TABS      -> close tabs (caller persists FIRST; see below)
 *
 * Single-writer rule: the SW NEVER writes the IndexedDB vault (the dashboard is
 * the only writer, avoiding MV3 ephemeral-SW write races). For REOPEN_FOLDER it
 * only READS the vault (folders + tabs) to build the reopen plan.
 *
 * Never-lose-a-link rule: CLOSE_TABS only closes tabs. The vault copy must
 * already be persisted by the caller before a close is requested — closing is a
 * deliberate, separate step from saving, so a link can never be lost.
 */
import { createChromeAdapter } from '../platform/chrome';
import { executeReopen } from '../platform/reopen-exec';
import { onMessage } from '../platform/messages';
import type {
  CaptureResult,
  Message,
  ReopenResult,
  Response,
} from '../platform/messages';
import { setPrefs } from '../platform/prefs';
import { planReopen } from '../core/reopen';
import { createVaultStorage } from '../core/storage';
import type { VaultStorage } from '../core/storage';
import type { FolderId } from '../core/types';

const adapter = createChromeAdapter();

/**
 * Lazy, read-only vault handle for reopen planning. Created on first use and
 * reused while the SW lives. Only `getAllFolders`/`getAllTabs` are ever called
 * on it — no writes.
 */
let vault: VaultStorage | null = null;
function getVault(): VaultStorage {
  if (!vault) vault = createVaultStorage();
  return vault;
}

async function reopenFolder(
  folderId: FolderId,
  includeSubfolders: boolean,
): Promise<ReopenResult> {
  const storage = getVault();
  const [folders, tabs] = await Promise.all([
    storage.getAllFolders(),
    storage.getAllTabs(),
  ]);
  const plan = planReopen(folderId, includeSubfolders, folders, tabs);
  return executeReopen(plan, adapter);
}

async function handleMessage(message: Message): Promise<Response> {
  switch (message.type) {
    case 'OPEN_DASHBOARD':
      await adapter.openDashboard();
      return { ok: true, data: null };

    case 'CAPTURE_TABS': {
      const tabs = await adapter.queryAllTabs();
      return { ok: true, data: { tabs } satisfies CaptureResult };
    }

    case 'REOPEN_FOLDER': {
      const result = await reopenFolder(
        message.folderId,
        message.includeSubfolders,
      );
      return { ok: true, data: result satisfies ReopenResult };
    }

    case 'CLOSE_TABS':
      await adapter.closeTabs(message.tabIds);
      return { ok: true, data: { closed: message.tabIds.length } };

    default:
      return { ok: false, error: 'unknown message' };
  }
}

// Toolbar icon click -> full-page dashboard (there is no popup).
chrome.action.onClicked.addListener(() => {
  void adapter.openDashboard();
});

// Seed default prefs on first install so the first-run intro has something to
// key off. (chrome.storage.local, not the IndexedDB vault.)
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void setPrefs({});
  }
});

// The single typed message router. Registered synchronously at top level as MV3
// requires.
onMessage(handleMessage);
