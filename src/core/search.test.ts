import { describe, expect, it } from 'vitest';
import { search, tokenize } from './search';
import { INBOX_ID } from './types';
import type { SavedTab } from './types';

function tab(id: string, title: string, url: string, savedAt = 0): SavedTab {
  return { id, title, url, savedAt, folderId: INBOX_ID, order: 0 };
}

describe('tokenize', () => {
  it('lowercases and splits on whitespace', () => {
    expect(tokenize('  Gold   Trait ')).toEqual(['gold', 'trait']);
  });

  it('returns [] for blank input', () => {
    expect(tokenize('   ')).toEqual([]);
    expect(tokenize('')).toEqual([]);
  });
});

describe('search', () => {
  it('returns [] for a blank query', () => {
    const tabs = [tab('a', 'Anything', 'https://x.com/a')];
    expect(search('', tabs)).toEqual([]);
    expect(search('   ', tabs)).toEqual([]);
  });

  it('matches on title and reports the matched field', () => {
    const tabs = [tab('a', 'Gold Trait Sheet', 'https://x.com/a')];
    const res = search('gold', tabs);
    expect(res).toHaveLength(1);
    expect(res[0].matched).toContain('title');
  });

  it('matches on url path only', () => {
    const tabs = [tab('a', 'Home', 'https://x.com/specialpath')];
    const res = search('specialpath', tabs);
    expect(res).toHaveLength(1);
    expect(res[0].matched).toEqual(['url']);
  });

  it('matches on derived domain', () => {
    const tabs = [tab('a', 'Home', 'https://opensea.io/collection/blupets')];
    const res = search('opensea', tabs);
    expect(res).toHaveLength(1);
    expect(res[0].matched).toContain('domain');
  });

  it('is case-insensitive', () => {
    const tabs = [tab('a', 'Gold', 'https://x.com/a')];
    expect(search('GOLD', tabs)).toHaveLength(1);
  });

  it('requires ALL tokens to match (logical AND)', () => {
    const tabs = [
      tab('both', 'Gold Trait', 'https://x.com/a'),
      tab('one', 'Gold Only', 'https://x.com/b'),
    ];
    const res = search('gold trait', tabs);
    expect(res.map((r) => r.tab.id)).toEqual(['both']);
  });

  it('ranks domain/title matches above bare url matches', () => {
    const tabs = [
      tab('titleHit', 'Foo Notes', 'https://site.com/plain'),
      tab('urlHit', 'Unrelated', 'https://site.com/foo'),
    ];
    const res = search('foo', tabs);
    expect(res.map((r) => r.tab.id)).toEqual(['titleHit', 'urlHit']);
    expect(res[0].score).toBeGreaterThan(res[1].score);
  });

  it('ranks an exact token above a substring match', () => {
    const tabs = [
      tab('exact', 'foo', 'https://x.com/a'),
      tab('substr', 'foobar', 'https://x.com/b'),
    ];
    const res = search('foo', tabs);
    expect(res.map((r) => r.tab.id)).toEqual(['exact', 'substr']);
  });

  it('is robust to chrome://, file:// and malformed urls', () => {
    const tabs = [
      tab('c', 'New Tab', 'chrome://newtab'),
      tab('f', 'Notes', 'file:///Users/me/notes.txt'),
      tab('bad', 'Broken', 'not a url'),
    ];
    expect(() => search('chrome', tabs)).not.toThrow();
    const res = search('chrome', tabs);
    expect(res.map((r) => r.tab.id)).toEqual(['c']);
  });

  it('excludes non-matching tabs', () => {
    const tabs = [tab('a', 'Alpha', 'https://x.com/a')];
    expect(search('zzz', tabs)).toEqual([]);
  });
});
