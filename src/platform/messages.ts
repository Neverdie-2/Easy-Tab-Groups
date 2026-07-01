/**
 * Typed messaging protocol (docs/PLAN.md §3.11). Shared by the service worker,
 * the dashboard, and (future) the side panel. Every message has a discriminant
 * `type`.
 *
 * NOTE: `sendMessage` / `onMessage` are scaffold stubs — implemented in Phase 4.
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

export function sendMessage<T extends Message>(_msg: T): Promise<Response> {
  throw new Error('not implemented: scaffold stub');
}

export function onMessage(_handler: (msg: Message) => Promise<Response>): void {
  throw new Error('not implemented: scaffold stub');
}
