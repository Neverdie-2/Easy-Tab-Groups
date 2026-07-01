/**
 * Duplicate-URL detection (docs/PLAN.md §3.6). PURE. Never throws.
 *
 * The product default is EXACT duplicates: two saved tabs are duplicates only
 * when their URL strings are identical. The options let the UI relax that
 * (ignore hash / query / a trailing slash) for a "smarter dedupe" mode.
 */
import { safeParseUrl } from './url';
import type { SavedTab, TabId } from './types';

export interface DedupeOptions {
  /** default false (design = EXACT dupes). */
  ignoreHash?: boolean;
  /** default false. */
  ignoreTrailingSlash?: boolean;
  /** default false. */
  ignoreQuery?: boolean;
}

export interface DuplicateGroup {
  /** normalized url the group shares. */
  key: string;
  /** >= 2, ordered by savedAt asc. */
  tabs: SavedTab[];
  /** earliest savedAt. */
  keep: TabId;
  /** the rest. */
  remove: TabId[];
}

function stripTrailingSlashFromPath(u: URL): void {
  // Leave the root "/" intact; only collapse a trailing slash on a real path.
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.replace(/\/+$/, '');
  }
}

/**
 * Canonical key used to group duplicates. Never throws.
 *
 * With no options active this returns the (trimmed) URL verbatim, so grouping
 * is byte-for-byte EXACT. When any option is active the URL is parsed and
 * re-serialized with the requested parts removed; unparseable input falls back
 * to best-effort string edits so it can still group with its twins.
 */
export function normalizeUrl(url: string, opts?: DedupeOptions): string {
  const raw = (url ?? '').trim();
  const ignoreHash = opts?.ignoreHash ?? false;
  const ignoreQuery = opts?.ignoreQuery ?? false;
  const ignoreTrailingSlash = opts?.ignoreTrailingSlash ?? false;

  if (!ignoreHash && !ignoreQuery && !ignoreTrailingSlash) {
    return raw; // EXACT by default.
  }

  const parsed = safeParseUrl(raw);
  if (!parsed) {
    let s = raw;
    if (ignoreHash) s = s.replace(/#.*$/, '');
    if (ignoreQuery) s = s.replace(/\?[^#]*/, '');
    if (ignoreTrailingSlash) s = s.replace(/\/+(?=$|[?#])/, '');
    return s;
  }

  if (ignoreHash) parsed.hash = '';
  if (ignoreQuery) parsed.search = '';
  if (ignoreTrailingSlash) stripTrailingSlashFromPath(parsed);
  return parsed.href;
}

/** Ascending by savedAt, with a stable id tie-break. */
function bySavedAt(a: SavedTab, b: SavedTab): number {
  if (a.savedAt !== b.savedAt) return a.savedAt - b.savedAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Group tabs that share a normalized URL. Only groups of size >= 2 are
 * returned. Within a group, tabs are ordered by `savedAt` asc; `keep` is the
 * earliest, `remove` is everyone else. Groups are ordered by key for
 * determinism.
 */
export function findDuplicates(
  tabs: SavedTab[],
  opts?: DedupeOptions,
): DuplicateGroup[] {
  const buckets = new Map<string, SavedTab[]>();
  for (const tab of tabs) {
    const key = normalizeUrl(tab.url, opts);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(tab);
    else buckets.set(key, [tab]);
  }

  const groups: DuplicateGroup[] = [];
  for (const [key, bucket] of buckets) {
    if (bucket.length < 2) continue;
    const ordered = bucket.slice().sort(bySavedAt);
    groups.push({
      key,
      tabs: ordered,
      keep: ordered[0].id,
      remove: ordered.slice(1).map((t) => t.id),
    });
  }

  groups.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return groups;
}
