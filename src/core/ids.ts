/**
 * ID + fractional-ordering helpers (docs/PLAN.md §3.2). PURE.
 *
 * IDs are opaque strings (`crypto.randomUUID()`), independent of live
 * `chrome.tabs` numeric ids. Ordering uses a coarse integer step so that a
 * new sibling can always be appended (`nextOrder`) and an item can be inserted
 * between two neighbours (`orderBetween`) without renumbering the whole list.
 */

/** Spacing between adjacent order values; leaves room for fractional inserts. */
export const ORDER_STEP = 1000;

/** New opaque string id, independent of live `chrome.tabs` numeric ids. */
export function newId(): string {
  return crypto.randomUUID();
}

/** Order value that sorts after every current sibling (max + STEP). */
export function nextOrder(siblings: { order: number }[]): number {
  if (siblings.length === 0) return ORDER_STEP;
  let max = siblings[0].order;
  for (const s of siblings) {
    if (s.order > max) max = s.order;
  }
  return max + ORDER_STEP;
}

/**
 * Fractional order that sits between `before` and `after` for inserts.
 * - both missing  -> a single mid value.
 * - only `after`  -> one step before it (prepend).
 * - only `before` -> one step after it (append).
 * - both present  -> their midpoint.
 */
export function orderBetween(before?: number, after?: number): number {
  if (before === undefined && after === undefined) return ORDER_STEP;
  if (before === undefined) return (after as number) - ORDER_STEP;
  if (after === undefined) return before + ORDER_STEP;
  return (before + after) / 2;
}
