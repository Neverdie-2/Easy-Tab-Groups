import { describe, expect, it } from 'vitest';
import { findDuplicates, normalizeUrl } from './dedupe';
import { INBOX_ID } from './types';
import type { SavedTab } from './types';

function tab(id: string, url: string, savedAt: number): SavedTab {
  return { id, url, title: id, savedAt, folderId: INBOX_ID, order: 0 };
}

describe('normalizeUrl', () => {
  it('is exact (verbatim, trimmed) by default', () => {
    expect(normalizeUrl('  https://a.com/p  ')).toBe('https://a.com/p');
    expect(normalizeUrl('https://a.com/p')).not.toBe('https://a.com/p/');
  });

  it('ignoreHash collapses fragments', () => {
    const a = normalizeUrl('https://a.com/p#one', { ignoreHash: true });
    const b = normalizeUrl('https://a.com/p#two', { ignoreHash: true });
    expect(a).toBe(b);
  });

  it('ignoreQuery collapses query strings', () => {
    const a = normalizeUrl('https://a.com/p?x=1', { ignoreQuery: true });
    const b = normalizeUrl('https://a.com/p?y=2', { ignoreQuery: true });
    expect(a).toBe(b);
  });

  it('ignoreTrailingSlash treats /p and /p/ as one but preserves root', () => {
    const a = normalizeUrl('https://a.com/p', { ignoreTrailingSlash: true });
    const b = normalizeUrl('https://a.com/p/', { ignoreTrailingSlash: true });
    expect(a).toBe(b);
    // root slash is retained (both resolve to the same canonical root)
    expect(normalizeUrl('https://a.com', { ignoreTrailingSlash: true })).toBe(
      normalizeUrl('https://a.com/', { ignoreTrailingSlash: true }),
    );
  });

  it('is stable for unicode / percent-encoding and never throws', () => {
    const u = 'https://xn--r8jz45g.example/%E3%83%91%E3%82%B9';
    expect(normalizeUrl(u)).toBe(u);
    expect(() =>
      normalizeUrl('https://例え.jp/パス', { ignoreHash: true }),
    ).not.toThrow();
  });

  it('never throws on invalid input, even with options', () => {
    expect(() => normalizeUrl('not a url', { ignoreHash: true })).not.toThrow();
    expect(normalizeUrl('')).toBe('');
  });
});

describe('findDuplicates', () => {
  it('groups exact duplicates, keeping the earliest savedAt', () => {
    const tabs = [
      tab('a', 'https://dup.com/x', 200),
      tab('b', 'https://dup.com/x', 100),
      tab('c', 'https://dup.com/x', 300),
      tab('unique', 'https://other.com/y', 50),
    ];
    const groups = findDuplicates(tabs);
    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g.key).toBe('https://dup.com/x');
    expect(g.tabs.map((t) => t.id)).toEqual(['b', 'a', 'c']); // savedAt asc
    expect(g.keep).toBe('b');
    expect(g.remove.sort()).toEqual(['a', 'c']);
  });

  it('never groups distinct urls (no false positives)', () => {
    const tabs = [
      tab('a', 'https://a.com/1', 1),
      tab('b', 'https://a.com/2', 2),
      tab('c', 'https://b.com/1', 3),
    ];
    expect(findDuplicates(tabs)).toEqual([]);
  });

  it('does not treat /p and /p/ as duplicates by default (exact)', () => {
    const tabs = [
      tab('a', 'https://a.com/p', 1),
      tab('b', 'https://a.com/p/', 2),
    ];
    expect(findDuplicates(tabs)).toEqual([]);
  });

  it('applies options to widen matching', () => {
    const tabs = [
      tab('a', 'https://a.com/p?utm=1', 1),
      tab('b', 'https://a.com/p?utm=2', 2),
    ];
    const groups = findDuplicates(tabs, { ignoreQuery: true });
    expect(groups).toHaveLength(1);
    expect(groups[0].keep).toBe('a');
  });

  it('returns groups sorted by key for determinism', () => {
    const tabs = [
      tab('a1', 'https://b.com/', 1),
      tab('a2', 'https://b.com/', 2),
      tab('b1', 'https://a.com/', 1),
      tab('b2', 'https://a.com/', 2),
    ];
    const keys = findDuplicates(tabs).map((g) => g.key);
    expect(keys).toEqual(['https://a.com/', 'https://b.com/']);
  });

  it('handles a 5,000-tab set quickly and correctly (smoke perf)', () => {
    const tabs: SavedTab[] = [];
    for (let i = 0; i < 2500; i++) {
      const url = `https://site.example/page/${i}`;
      tabs.push(tab(`first-${i}`, url, i));
      tabs.push(tab(`second-${i}`, url, i + 100000));
    }
    const start = Date.now();
    const groups = findDuplicates(tabs);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(groups).toHaveLength(2500);
    expect(groups.every((g) => g.tabs.length === 2)).toBe(true);
    expect(groups.every((g) => g.remove.length === 1)).toBe(true);
  });
});
