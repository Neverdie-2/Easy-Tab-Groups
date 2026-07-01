/**
 * Export / import serializers (docs/PLAN.md §3.9). PURE. First-class,
 * lock-in-free: JSON round-trip + a Netscape HTML bookmarks file.
 *
 * NOTE: scaffold stubs — implemented in Phase 3 (TDD). `toBookmarksHtml` MUST
 * HTML-escape titles/urls (XSS/injection guard on export).
 */
import type { VaultSnapshot } from './types';

/** Stable, pretty JSON. */
export function toJson(_snap: VaultSnapshot): string {
  throw new Error('not implemented: scaffold stub');
}

/** Validates shape; throws on bad input (wrong version / malformed). */
export function fromJson(_text: string): VaultSnapshot {
  throw new Error('not implemented: scaffold stub');
}

/** Netscape bookmark file, HTML-escaped. */
export function toBookmarksHtml(_snap: VaultSnapshot): string {
  throw new Error('not implemented: scaffold stub');
}
