import { describe, expect, it } from 'vitest';
import { fromJson, toBookmarksHtml, toJson } from './export';
import { INBOX_ID } from './types';
import type { Folder, SavedTab, VaultSnapshot } from './types';

function snapshot(
  folders: Folder[],
  tabs: SavedTab[],
  exportedAt = 1000,
): VaultSnapshot {
  return { version: 1, exportedAt, folders, tabs };
}

const inbox: Folder = {
  id: INBOX_ID,
  name: 'Inbox',
  parentId: null,
  order: 0,
  createdAt: 0,
  system: true,
};

describe('toJson / fromJson', () => {
  it('round-trips a snapshot identically', () => {
    const snap = snapshot(
      [
        inbox,
        { id: 'a', name: 'Alpha', parentId: null, order: 1000, createdAt: 5 },
      ],
      [
        {
          id: 't1',
          url: 'https://example.com/',
          title: 'Example',
          savedAt: 10,
          folderId: 'a',
          order: 1000,
        },
      ],
    );
    const restored = fromJson(toJson(snap));
    expect(restored).toEqual(snap);
  });

  it('produces stable output regardless of input key order', () => {
    const a = snapshot(
      [{ createdAt: 5, order: 1000, parentId: null, name: 'A', id: 'a' }],
      [],
    );
    const b = snapshot(
      [{ id: 'a', name: 'A', parentId: null, order: 1000, createdAt: 5 }],
      [],
    );
    expect(toJson(a)).toBe(toJson(b));
  });

  it('preserves the optional favicon field only when present', () => {
    const withIcon = snapshot(
      [],
      [
        {
          id: 't1',
          url: 'https://x.io',
          title: 'X',
          savedAt: 1,
          folderId: INBOX_ID,
          order: 1000,
          favicon: 'data:image/png;base64,AAAA',
        },
      ],
    );
    const restored = fromJson(toJson(withIcon));
    expect(restored.tabs[0].favicon).toBe('data:image/png;base64,AAAA');

    const noIcon = fromJson(
      toJson(
        snapshot(
          [],
          [
            {
              id: 't2',
              url: 'https://y.io',
              title: 'Y',
              savedAt: 1,
              folderId: INBOX_ID,
              order: 1000,
            },
          ],
        ),
      ),
    );
    expect('favicon' in noIcon.tabs[0]).toBe(false);
  });

  it('rejects a wrong version', () => {
    expect(() =>
      fromJson(JSON.stringify({ version: 2, folders: [], tabs: [] })),
    ).toThrow(/version/);
  });

  it('rejects malformed JSON', () => {
    expect(() => fromJson('{not json')).toThrow(/not valid JSON/);
  });

  it('rejects a missing folders/tabs array', () => {
    expect(() => fromJson(JSON.stringify({ version: 1, tabs: [] }))).toThrow(
      /folders must be an array/,
    );
    expect(() => fromJson(JSON.stringify({ version: 1, folders: [] }))).toThrow(
      /tabs must be an array/,
    );
  });

  it('rejects a folder with the wrong field types', () => {
    expect(() =>
      fromJson(
        JSON.stringify({
          version: 1,
          folders: [
            { id: 1, name: 'x', parentId: null, order: 0, createdAt: 0 },
          ],
          tabs: [],
        }),
      ),
    ).toThrow(/folders\[0\]\.id/);
  });

  it('rejects a self-parented folder (would stack-overflow the renderer)', () => {
    expect(() =>
      fromJson(
        JSON.stringify({
          version: 1,
          folders: [
            { id: 'a', name: 'A', parentId: 'a', order: 1000, createdAt: 0 },
          ],
          tabs: [],
        }),
      ),
    ).toThrow(/parent cycle/);
  });

  it('rejects a parent cycle (A->B->A)', () => {
    expect(() =>
      fromJson(
        JSON.stringify({
          version: 1,
          folders: [
            { id: 'a', name: 'A', parentId: 'b', order: 1000, createdAt: 0 },
            { id: 'b', name: 'B', parentId: 'a', order: 2000, createdAt: 0 },
          ],
          tabs: [],
        }),
      ),
    ).toThrow(/parent cycle/);
  });

  it('accepts an orphan whose parent is simply absent (merge may resolve it)', () => {
    const restored = fromJson(
      JSON.stringify({
        version: 1,
        folders: [
          { id: 'a', name: 'A', parentId: 'ghost', order: 1000, createdAt: 0 },
        ],
        tabs: [],
      }),
    );
    expect(restored.folders[0].parentId).toBe('ghost');
  });
});

describe('toBookmarksHtml', () => {
  it('emits a valid Netscape structure with nested folders', () => {
    const snap = snapshot(
      [
        { id: 'a', name: 'Alpha', parentId: null, order: 1000, createdAt: 0 },
        { id: 'b', name: 'Beta', parentId: 'a', order: 1000, createdAt: 0 },
      ],
      [
        {
          id: 't1',
          url: 'https://alpha.io',
          title: 'Alpha home',
          savedAt: 0,
          folderId: 'a',
          order: 1000,
        },
        {
          id: 't2',
          url: 'https://beta.io',
          title: 'Beta home',
          savedAt: 0,
          folderId: 'b',
          order: 1000,
        },
      ],
    );
    const html = toBookmarksHtml(snap);
    expect(html).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
    expect(html).toContain('<H3>Alpha</H3>');
    expect(html).toContain('<H3>Beta</H3>');
    expect(html).toContain('<A HREF="https://alpha.io">Alpha home</A>');
    // Beta must be nested inside Alpha (its <H3> appears after Alpha's).
    expect(html.indexOf('<H3>Beta</H3>')).toBeGreaterThan(
      html.indexOf('<H3>Alpha</H3>'),
    );
  });

  it('HTML-escapes titles and urls (injection guard on export)', () => {
    const snap = snapshot(
      [
        {
          id: 'a',
          name: '<script>evil()</script>',
          parentId: null,
          order: 1000,
          createdAt: 0,
        },
      ],
      [
        {
          id: 't1',
          url: 'https://x.io/?a="b"&c=<d>',
          title: '<img onerror=alert(1)>',
          savedAt: 0,
          folderId: 'a',
          order: 1000,
        },
      ],
    );
    const html = toBookmarksHtml(snap);
    expect(html).not.toContain('<script>evil()</script>');
    expect(html).not.toContain('<img onerror=alert(1)>');
    expect(html).toContain('&lt;script&gt;evil()&lt;/script&gt;');
    expect(html).toContain('&lt;img onerror=alert(1)&gt;');
    expect(html).toContain('&amp;c=&lt;d&gt;');
    expect(html).toContain('&quot;b&quot;');
  });
});
