/**
 * Core domain types — the shared contract for the vault (docs/PLAN.md §3.1).
 * This module is PURE: no `chrome.*`, no DOM.
 */

export type FolderId = string;
export type TabId = string;

/** Reserved root folder that holds freshly captured, unfiled tabs. */
export const INBOX_ID = 'inbox' as const;

export interface Folder {
  id: FolderId;
  name: string;
  /** null = top level. */
  parentId: FolderId | null;
  /** Fractional/step order within parent. */
  order: number;
  /** Epoch ms. */
  createdAt: number;
  /** true for INBOX_ID; cannot be renamed/deleted/moved. */
  system?: boolean;
}

export interface SavedTab {
  id: TabId;
  url: string;
  title: string;
  /**
   * OPTIONAL, EXPORT-COMPAT ONLY. May be present in imported data. It is NEVER
   * rendered as a remote `<img src>` and NEVER fetched. The UI always derives
   * the icon from `url` via the local `_favicon/` endpoint (see
   * `src/dashboard/favicon.ts`).
   */
  favicon?: string;
  /** Epoch ms. */
  savedAt: number;
  /** Parent folder (INBOX_ID for freshly captured). */
  folderId: FolderId;
  /** Order within folder. */
  order: number;
}

export interface VaultSnapshot {
  version: 1;
  exportedAt: number;
  folders: Folder[];
  tabs: SavedTab[];
}
