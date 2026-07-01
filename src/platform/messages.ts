/**
 * Typed messaging protocol (docs/PLAN.md §3.11). Shared by the service worker,
 * the dashboard, and (future) the side panel. Every message has a discriminant
 * `type`; every reply is the `Response` envelope so callers get a uniform
 * `{ ok }` result instead of raw thrown errors across the port boundary.
 *
 * Transport is `chrome.runtime.sendMessage` / `chrome.runtime.onMessage` — a
 * LOCAL, in-browser message port. There is NO network involved.
 */
import type { FolderId } from '../core/types';
import type { LiveTab } from './chrome';

export type Message =
  | { type: 'OPEN_DASHBOARD' }
  | { type: 'CAPTURE_TABS' }
  | { type: 'REOPEN_FOLDER'; folderId: FolderId; includeSubfolders: boolean }
  | { type: 'CLOSE_TABS'; tabIds: number[] };

export interface CaptureResult {
  tabs: LiveTab[];
}

export interface ReopenResult {
  groupId: number;
  tabIds: number[];
}

export type Response =
  { ok: true; data: unknown } | { ok: false; error: string };

/** Best-effort human-readable error string for the `Response` envelope. */
function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Send a typed message to the background service worker and resolve with its
 * `Response`. Rejects only if the runtime port itself fails (e.g. no receiver).
 */
export function sendMessage<T extends Message>(msg: T): Promise<Response> {
  return chrome.runtime.sendMessage(msg) as Promise<Response>;
}

/**
 * Register the single background message router. The handler returns a
 * `Promise<Response>`; thrown errors are converted into `{ ok: false }`. Returns
 * `true` synchronously so Chrome keeps the port open for the async reply.
 *
 * MUST be called at the top level of the service worker (MV3 requires listeners
 * to be registered synchronously during initial evaluation).
 */
export function onMessage(handler: (msg: Message) => Promise<Response>): void {
  chrome.runtime.onMessage.addListener(
    (
      message: Message,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: Response) => void,
    ) => {
      handler(message)
        .then(sendResponse)
        .catch((err: unknown) => {
          sendResponse({ ok: false, error: toErrorMessage(err) });
        });
      return true;
    },
  );
}
