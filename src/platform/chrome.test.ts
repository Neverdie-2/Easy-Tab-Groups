import { describe, expect, it } from 'vitest';
import { isTabGroupColor, toLiveTab, TAB_GROUP_COLORS } from './chrome';

/** Minimal helper: only the fields `toLiveTab` reads are meaningful. */
function tab(partial: Partial<chrome.tabs.Tab>): chrome.tabs.Tab {
  return partial as unknown as chrome.tabs.Tab;
}

describe('toLiveTab', () => {
  it('maps a normal tab', () => {
    expect(
      toLiveTab(tab({ id: 7, windowId: 3, url: 'https://a.io', title: 'A' })),
    ).toEqual({ id: 7, windowId: 3, url: 'https://a.io', title: 'A' });
  });

  it('drops a tab with no id or no windowId', () => {
    expect(toLiveTab(tab({ windowId: 1, url: 'https://a.io' }))).toBeNull();
    expect(toLiveTab(tab({ id: 1, url: 'https://a.io' }))).toBeNull();
    // id can legitimately be 0? chrome uses positive ids; null/undefined dropped.
    expect(toLiveTab(tab({ id: undefined, windowId: 1 }))).toBeNull();
  });

  it('falls back to pendingUrl then empty string for a still-loading tab', () => {
    expect(
      toLiveTab(tab({ id: 1, windowId: 1, pendingUrl: 'https://p.io' })),
    ).toEqual({ id: 1, windowId: 1, url: 'https://p.io', title: '' });
    expect(toLiveTab(tab({ id: 2, windowId: 1 }))).toEqual({
      id: 2,
      windowId: 1,
      url: '',
      title: '',
    });
  });
});

describe('isTabGroupColor', () => {
  it('accepts every documented native group color', () => {
    for (const c of TAB_GROUP_COLORS) expect(isTabGroupColor(c)).toBe(true);
  });

  it('rejects anything else (would make chrome.tabGroups.update throw)', () => {
    for (const bad of ['', 'rainbow', 'Blue', '#fff', 'teal']) {
      expect(isTabGroupColor(bad)).toBe(false);
    }
  });
});
