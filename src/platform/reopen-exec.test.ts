import { describe, expect, it } from 'vitest';
import { executeReopen, NO_GROUP } from './reopen-exec';
import type { ChromeAdapter, LiveTab } from './chrome';
import type { ReopenPlan } from '../core/reopen';

/**
 * A configurable fake adapter for the reopen executor. `failUrls` makes
 * `createTab` throw for those urls (mirroring chrome.tabs.create rejecting a
 * restricted scheme), so we can prove the executor stays resilient.
 */
function fakeAdapter(failUrls: Set<string> = new Set()) {
  const created: string[] = [];
  const grouped: number[][] = [];
  const named: Array<{ title: string; color?: string }> = [];
  let nextTabId = 1;
  let nextGroupId = 100;
  const adapter: ChromeAdapter = {
    async queryAllTabs(): Promise<LiveTab[]> {
      return [];
    },
    async createTab(url) {
      if (failUrls.has(url)) throw new Error(`cannot create ${url}`);
      created.push(url);
      return nextTabId++;
    },
    async closeTabs() {},
    async groupTabs(tabIds) {
      grouped.push([...tabIds]);
      return nextGroupId++;
    },
    async nameGroup(_groupId, title, color) {
      named.push({ title, color });
    },
    async openDashboard() {},
    async currentWindowId() {
      return 1;
    },
  };
  return { adapter, created, grouped, named };
}

const plan = (urls: string[], groupName = 'G'): ReopenPlan => ({
  groupName,
  urls,
});

describe('executeReopen', () => {
  it('creates, groups and names every http(s) tab in order', async () => {
    const fake = fakeAdapter();
    const res = await executeReopen(
      plan(['https://a.io', 'https://b.io']),
      fake.adapter,
    );
    expect(res.tabIds).toHaveLength(2);
    expect(res.skipped).toBe(0);
    expect(res.groupId).not.toBe(NO_GROUP);
    expect(fake.created).toEqual(['https://a.io', 'https://b.io']);
    expect(fake.grouped).toHaveLength(1);
    expect(fake.grouped[0]).toEqual(res.tabIds);
    expect(fake.named[0].title).toBe('G');
  });

  it('skips non-http(s) urls without attempting to create them', async () => {
    const fake = fakeAdapter();
    const res = await executeReopen(
      plan([
        'https://ok.io',
        'javascript:alert(1)',
        'chrome://extensions',
        'file:///etc/passwd',
        'https://ok2.io',
      ]),
      fake.adapter,
    );
    expect(fake.created).toEqual(['https://ok.io', 'https://ok2.io']);
    expect(res.tabIds).toHaveLength(2);
    expect(res.skipped).toBe(3);
    // Only the created tabs are grouped.
    expect(fake.grouped[0]).toHaveLength(2);
  });

  it('does NOT abort or orphan tabs when a single create throws', async () => {
    const fake = fakeAdapter(new Set(['https://boom.io']));
    const res = await executeReopen(
      plan(['https://a.io', 'https://boom.io', 'https://c.io']),
      fake.adapter,
    );
    // The throwing url is counted as skipped; the rest still open + group.
    expect(fake.created).toEqual(['https://a.io', 'https://c.io']);
    expect(res.tabIds).toHaveLength(2);
    expect(res.skipped).toBe(1);
    expect(res.groupId).not.toBe(NO_GROUP);
    expect(fake.grouped[0]).toEqual(res.tabIds);
  });

  it('creates no group when every url is unreachable', async () => {
    const fake = fakeAdapter();
    const res = await executeReopen(
      plan(['javascript:void(0)', 'chrome://newtab']),
      fake.adapter,
    );
    expect(res.groupId).toBe(NO_GROUP);
    expect(res.tabIds).toEqual([]);
    expect(res.skipped).toBe(2);
    expect(fake.grouped).toHaveLength(0);
  });

  it('empty plan is a harmless no-op', async () => {
    const fake = fakeAdapter();
    const res = await executeReopen(plan([]), fake.adapter);
    expect(res).toEqual({ groupId: NO_GROUP, tabIds: [], skipped: 0 });
    expect(fake.created).toEqual([]);
  });

  it('opens a large batch (chunked yields) without dropping any tab', async () => {
    const fake = fakeAdapter();
    const urls = Array.from({ length: 55 }, (_, i) => `https://x${i}.io`);
    const res = await executeReopen(plan(urls), fake.adapter);
    expect(res.tabIds).toHaveLength(55);
    expect(fake.created).toEqual(urls);
  });
});
