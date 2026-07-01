/**
 * ID + fractional-ordering helpers (docs/PLAN.md §3.2). PURE.
 *
 * NOTE: scaffold stubs — implemented in Phase 1 (TDD).
 */

/** New opaque string id, independent of live `chrome.tabs` numeric ids. */
export function newId(): string {
  throw new Error('not implemented: scaffold stub');
}

/** Order value that sorts after every current sibling (max + STEP). */
export function nextOrder(_siblings: { order: number }[]): number {
  throw new Error('not implemented: scaffold stub');
}

/** Fractional order that sits between `before` and `after` for inserts. */
export function orderBetween(_before?: number, _after?: number): number {
  throw new Error('not implemented: scaffold stub');
}
