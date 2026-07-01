/**
 * Chrome adapter (docs/PLAN.md §3.10). The thin, promisified, mockable edge
 * over `chrome.*`. The pure core NEVER imports this.
 *
 * NOTE: scaffold stub — implemented in Phase 4.
 */

export interface LiveTab {
  id: number;
  windowId: number;
  url: string;
  title: string;
}

export interface ChromeAdapter {
  /** chrome.tabs.query({}). */
  queryAllTabs(): Promise<LiveTab[]>;
  /** returns new tab id. */
  createTab(url: string, active?: boolean): Promise<number>;
  /** chrome.tabs.remove. */
  closeTabs(tabIds: number[]): Promise<void>;
  /** chrome.tabs.group -> groupId. */
  groupTabs(tabIds: number[]): Promise<number>;
  /** chrome.tabGroups.update. */
  nameGroup(groupId: number, title: string, color?: string): Promise<void>;
  /** focus existing or create dashboard.html. */
  openDashboard(): Promise<void>;
  currentWindowId(): Promise<number>;
}

export function createChromeAdapter(): ChromeAdapter {
  throw new Error('not implemented: scaffold stub');
}
