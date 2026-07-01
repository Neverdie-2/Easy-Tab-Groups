import { describe, expect, it } from 'vitest';
import { planReopen } from './reopen';
import { INBOX_ID } from './types';
import type { Folder, SavedTab } from './types';

function f(
  id: string,
  parentId: string | null,
  order: number,
  extra: Partial<Folder> = {},
): Folder {
  return { id, name: id, parentId, order, createdAt: 0, ...extra };
}

function t(
  id: string,
  folderId: string,
  order: number,
  url = `https://example.com/${id}`,
): SavedTab {
  return { id, url, title: id, savedAt: 0, folderId, order };
}

describe('planReopen', () => {
  it('names the group after the folder and lists its direct tabs in order', () => {
    const folders = [f('a', null, 1000, { name: 'Alpha' })];
    const tabs = [t('t2', 'a', 2000), t('t1', 'a', 1000)];

    const plan = planReopen('a', false, folders, tabs);

    expect(plan.groupName).toBe('Alpha');
    expect(plan.urls).toEqual([
      'https://example.com/t1',
      'https://example.com/t2',
    ]);
  });

  it('includeSubfolders=false returns only direct tabs', () => {
    const folders = [f('a', null, 1000), f('b', 'a', 1000)];
    const tabs = [t('ta', 'a', 1000), t('tb', 'b', 1000)];

    const plan = planReopen('a', false, folders, tabs);

    expect(plan.urls).toEqual(['https://example.com/ta']);
  });

  it('includeSubfolders=true walks the subtree depth-first, group name stays the top folder', () => {
    const folders = [
      f('a', null, 1000, { name: 'Top' }),
      f('b', 'a', 1000),
      f('c', 'b', 1000),
      f('d', 'a', 2000),
    ];
    const tabs = [
      t('ta', 'a', 1000),
      t('tb', 'b', 1000),
      t('tc', 'c', 1000),
      t('td', 'd', 1000),
    ];

    const plan = planReopen('a', true, folders, tabs);

    expect(plan.groupName).toBe('Top');
    // a's own tab, then b (and its child c), then d.
    expect(plan.urls).toEqual([
      'https://example.com/ta',
      'https://example.com/tb',
      'https://example.com/tc',
      'https://example.com/td',
    ]);
  });

  it('empty folder yields the folder name and no urls', () => {
    const folders = [f('a', null, 1000, { name: 'Empty' })];
    const plan = planReopen('a', true, folders, []);
    expect(plan).toEqual({ groupName: 'Empty', urls: [] });
  });

  it('unknown folder never throws: returns an empty plan', () => {
    const plan = planReopen('missing', true, [], []);
    expect(plan).toEqual({ groupName: '', urls: [] });
  });

  it('plans the system Inbox folder like any other', () => {
    const folders = [f(INBOX_ID, null, 0, { name: 'Inbox', system: true })];
    const tabs = [t('t1', INBOX_ID, 1000)];
    const plan = planReopen(INBOX_ID, false, folders, tabs);
    expect(plan.groupName).toBe('Inbox');
    expect(plan.urls).toEqual(['https://example.com/t1']);
  });
});
