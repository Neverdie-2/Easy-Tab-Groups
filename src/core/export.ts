/**
 * Export / import serializers (docs/PLAN.md §3.9). PURE. First-class,
 * lock-in-free: a JSON round-trip plus a Netscape HTML bookmarks file.
 *
 * Security notes:
 * - `toBookmarksHtml` HTML-escapes every folder name, tab title and url. The
 *   vault holds untrusted strings (page titles), so the exported file must
 *   never be an injection vector when re-opened in a browser.
 * - Nothing here touches the network or the DOM; it is string in / string out.
 */
import { buildTree } from './tree';
import type { TreeNode } from './tree';
import type { Folder, SavedTab, VaultSnapshot } from './types';

/** Canonical folder key order so `toJson` output is stable regardless of input. */
function normalizeFolder(f: Folder): Folder {
  const out: Folder = {
    id: f.id,
    name: f.name,
    parentId: f.parentId ?? null,
    order: f.order,
    createdAt: f.createdAt,
  };
  if (f.system) out.system = true;
  return out;
}

/** Canonical tab key order; keeps the optional `favicon` only when present. */
function normalizeTab(t: SavedTab): SavedTab {
  const out: SavedTab = {
    id: t.id,
    url: t.url,
    title: t.title,
    savedAt: t.savedAt,
    folderId: t.folderId,
    order: t.order,
  };
  if (t.favicon !== undefined) out.favicon = t.favicon;
  return out;
}

/**
 * Stable, pretty (2-space) JSON. Fields are emitted in a canonical order so two
 * snapshots with the same data serialize byte-for-byte identically (nice for
 * diffs / manual review), independent of in-memory key insertion order.
 */
export function toJson(snap: VaultSnapshot): string {
  const stable = {
    version: 1 as const,
    exportedAt: snap.exportedAt,
    folders: snap.folders.map(normalizeFolder),
    tabs: snap.tabs.map(normalizeTab),
  };
  return `${JSON.stringify(stable, null, 2)}\n`;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`Invalid vault snapshot: ${message}`);
}

function parseFolder(raw: unknown, i: number): Folder {
  assert(isObject(raw), `folders[${i}] is not an object`);
  const { id, name, parentId, order, createdAt, system } = raw;
  assert(typeof id === 'string', `folders[${i}].id must be a string`);
  assert(typeof name === 'string', `folders[${i}].name must be a string`);
  assert(
    parentId === null || typeof parentId === 'string',
    `folders[${i}].parentId must be a string or null`,
  );
  assert(typeof order === 'number', `folders[${i}].order must be a number`);
  assert(
    typeof createdAt === 'number',
    `folders[${i}].createdAt must be a number`,
  );
  const folder: Folder = { id, name, parentId, order, createdAt };
  if (system !== undefined) {
    assert(
      typeof system === 'boolean',
      `folders[${i}].system must be a boolean`,
    );
    if (system) folder.system = true;
  }
  return folder;
}

function parseTab(raw: unknown, i: number): SavedTab {
  assert(isObject(raw), `tabs[${i}] is not an object`);
  const { id, url, title, savedAt, folderId, order, favicon } = raw;
  assert(typeof id === 'string', `tabs[${i}].id must be a string`);
  assert(typeof url === 'string', `tabs[${i}].url must be a string`);
  assert(typeof title === 'string', `tabs[${i}].title must be a string`);
  assert(typeof savedAt === 'number', `tabs[${i}].savedAt must be a number`);
  assert(typeof folderId === 'string', `tabs[${i}].folderId must be a string`);
  assert(typeof order === 'number', `tabs[${i}].order must be a number`);
  const tab: SavedTab = { id, url, title, savedAt, folderId, order };
  if (favicon !== undefined) {
    assert(typeof favicon === 'string', `tabs[${i}].favicon must be a string`);
    tab.favicon = favicon;
  }
  return tab;
}

/**
 * Reject structurally-corrupt folder graphs on the untrusted import path: a
 * folder that is its own parent, or any parent cycle (A→B→A). Both would break
 * the tree ("never corrupt the vault"), and a self-parent would stack-overflow
 * the recursive renderer. Unknown parents (orphans pointing outside the
 * snapshot) are NOT rejected here — a merge legitimately references existing
 * local folders, and buildTree/storage re-home genuine orphans.
 */
function assertNoFolderCycles(folders: Folder[]): void {
  const byId = new Map<string, Folder>(folders.map((f) => [f.id, f]));
  for (const start of folders) {
    const seen = new Set<string>();
    let cur: Folder | undefined = start;
    while (cur) {
      assert(!seen.has(cur.id), `folder "${cur.id}" is part of a parent cycle`);
      seen.add(cur.id);
      cur = cur.parentId !== null ? byId.get(cur.parentId) : undefined;
    }
  }
}

/**
 * Parse + validate an exported snapshot. Throws a descriptive `Error` on any
 * malformed input or an unsupported `version` (no silent, partial imports —
 * see the plan's "never lose a link / never corrupt the vault" posture).
 */
export function fromJson(text: string): VaultSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Invalid vault snapshot: not valid JSON (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
  }
  assert(isObject(parsed), 'top level must be an object');
  assert(
    parsed.version === 1,
    `unsupported version ${JSON.stringify(parsed.version)} (expected 1)`,
  );
  assert(Array.isArray(parsed.folders), 'folders must be an array');
  assert(Array.isArray(parsed.tabs), 'tabs must be an array');

  const folders = parsed.folders.map((f, i) => parseFolder(f, i));
  const tabs = parsed.tabs.map((t, i) => parseTab(t, i));
  assertNoFolderCycles(folders);
  const exportedAt =
    typeof parsed.exportedAt === 'number' ? parsed.exportedAt : Date.now();

  return { version: 1, exportedAt, folders, tabs };
}

/** Escape the five XML/HTML-significant characters. Used for names/titles/urls. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderNode(node: TreeNode, depth: number): string {
  const pad = '  '.repeat(depth);
  const inner = '  '.repeat(depth + 1);
  const lines: string[] = [];
  lines.push(`${pad}<DT><H3>${escapeHtml(node.folder.name)}</H3>`);
  lines.push(`${pad}<DL><p>`);
  for (const tab of node.tabs) {
    lines.push(
      `${inner}<DT><A HREF="${escapeHtml(tab.url)}">${escapeHtml(
        tab.title || tab.url,
      )}</A>`,
    );
  }
  for (const child of node.children) {
    lines.push(renderNode(child, depth + 1));
  }
  lines.push(`${pad}</DL><p>`);
  return lines.join('\n');
}

/**
 * Netscape bookmark file mirroring the folder tree (folders → `<H3>` sections,
 * tabs → `<A>` links). Importable by browsers' "Import bookmarks from HTML".
 * Every dynamic string is HTML-escaped.
 */
export function toBookmarksHtml(snap: VaultSnapshot): string {
  const roots = buildTree(snap.folders, snap.tabs);
  const body = roots.map((node) => renderNode(node, 1)).join('\n');
  return [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file. Do NOT edit. -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Easy Tab Groups</H1>',
    '<DL><p>',
    body,
    '</DL><p>',
    '',
  ].join('\n');
}
