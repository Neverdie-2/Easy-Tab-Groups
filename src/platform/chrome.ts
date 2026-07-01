/**
 * Chrome adapter (docs/PLAN.md §3.10). The thin, promisified, mockable edge
 * over `chrome.*`. The pure core NEVER imports this; everything that touches
 * `chrome.*` funnels through here so the runtime is auditable and the core stays
 * unit-testable.
 *
 * Zero network: every method here calls only `chrome.tabs` / `chrome.tabGroups`
 * / `chrome.windows` / `chrome.runtime`. No networking primitives anywhere.
 */

/** The extension page opened as the full-page dashboard (emitted to dist root). */
const DASHBOARD_PAGE = 'dashboard.html';

/**
 * The native tab-group colors Chromium/Brave accept. Single source of truth,
 * shared with the reopen executor's deterministic color picker so a folder
 * always reopens under the same group color.
 */
export const TAB_GROUP_COLORS = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
] as const;

export type TabGroupColor = (typeof TAB_GROUP_COLORS)[number];

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

function isTabGroupColor(value: string): value is TabGroupColor {
  return (TAB_GROUP_COLORS as readonly string[]).includes(value);
}

export function createChromeAdapter(): ChromeAdapter {
  return {
    async queryAllTabs(): Promise<LiveTab[]> {
      // NOTE: we deliberately do NOT read `favIconUrl` here. Favicons come from
      // the browser's LOCAL cache via the `_favicon/` endpoint (dashboard/
      // favicon.ts); `favIconUrl` is frequently a REMOTE https URL and storing/
      // rendering it would violate the zero-network guarantee.
      const tabs = await chrome.tabs.query({});
      const live: LiveTab[] = [];
      for (const tab of tabs) {
        // Only tabs with a real numeric id can be reopened/closed/grouped.
        if (tab.id == null || tab.windowId == null) continue;
        live.push({
          id: tab.id,
          windowId: tab.windowId,
          url: tab.url ?? tab.pendingUrl ?? '',
          title: tab.title ?? '',
        });
      }
      return live;
    },

    async createTab(url: string, active = false): Promise<number> {
      const tab = await chrome.tabs.create({ url, active });
      if (tab.id == null) {
        throw new Error('chrome.tabs.create returned a tab without an id');
      }
      return tab.id;
    },

    async closeTabs(tabIds: number[]): Promise<void> {
      if (tabIds.length === 0) return;
      await chrome.tabs.remove(tabIds);
    },

    async groupTabs(tabIds: number[]): Promise<number> {
      if (tabIds.length === 0) {
        throw new Error('groupTabs requires at least one tab id');
      }
      return chrome.tabs.group({ tabIds });
    },

    async nameGroup(
      groupId: number,
      title: string,
      color?: string,
    ): Promise<void> {
      const props: chrome.tabGroups.UpdateProperties = { title };
      // Only assign a color we know is valid — an unknown string would make
      // chrome.tabGroups.update reject.
      if (color != null && isTabGroupColor(color)) {
        props.color = color;
      }
      await chrome.tabGroups.update(groupId, props);
    },

    async openDashboard(): Promise<void> {
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
    },

    async currentWindowId(): Promise<number> {
      const win = await chrome.windows.getCurrent();
      if (win.id == null) {
        throw new Error('chrome.windows.getCurrent returned no window id');
      }
      return win.id;
    },
  };
}
