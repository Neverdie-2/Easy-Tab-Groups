/**
 * Background service worker (docs/PLAN.md §3.14). ESM module SW.
 *
 * Responsibilities:
 *   - `chrome.action.onClicked` -> open/focus the full-page dashboard.
 *   - message router for privileged actions (CAPTURE/REOPEN/CLOSE).
 *
 * It NEVER writes IndexedDB (single-writer = the dashboard page). The routing
 * for CAPTURE/REOPEN/CLOSE is wired in later phases; this scaffold implements
 * OPEN_DASHBOARD so the extension is loadable from `dist/` immediately.
 */
import type { Message, Response } from '../platform/messages';

const DASHBOARD_PAGE = 'dashboard.html';

/** Focus an existing dashboard tab if present, otherwise create one. */
async function openDashboard(): Promise<void> {
  const url = chrome.runtime.getURL(DASHBOARD_PAGE);
  const existing = await chrome.tabs.query({ url });
  const first = existing[0];
  if (first?.id != null) {
    await chrome.tabs.update(first.id, { active: true });
    if (first.windowId != null) {
      await chrome.windows.update(first.windowId, { focused: true });
    }
    return;
  }
  await chrome.tabs.create({ url });
}

async function handleMessage(message: Message): Promise<Response> {
  switch (message.type) {
    case 'OPEN_DASHBOARD':
      await openDashboard();
      return { ok: true, data: null };
    case 'CAPTURE_TABS':
    case 'REOPEN_FOLDER':
    case 'CLOSE_TABS':
      return { ok: false, error: `not implemented: ${message.type}` };
    default:
      return { ok: false, error: 'unknown message' };
  }
}

chrome.action.onClicked.addListener(() => {
  void openDashboard();
});

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((err: unknown) => {
        sendResponse({ ok: false, error: String(err) } satisfies Response);
      });
    // Keep the message channel open for the async response.
    return true;
  },
);
