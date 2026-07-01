/**
 * Safe URL helpers for grouping / filtering / search (docs/PLAN.md §3.3). PURE.
 * Must NEVER throw.
 *
 * NOTE: scaffold stubs — implemented in Phase 1 (TDD).
 */

/**
 * Registrable-ish host for grouping/filter/search. Never throws.
 * `chrome://newtab` -> 'chrome', `about:blank` -> 'about', `file://` -> 'file',
 * invalid -> ''.
 */
export function domainOf(_url: string): string {
  throw new Error('not implemented: scaffold stub');
}

/** Parse a URL, returning null instead of throwing on invalid input. */
export function safeParseUrl(_url: string): URL | null {
  throw new Error('not implemented: scaffold stub');
}
