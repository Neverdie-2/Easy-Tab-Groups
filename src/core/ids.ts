/**
 * ID + fractional-ordering helpers (docs/PLAN.md §3.2). PURE.
 *
 * IDs are opaque strings (`crypto.randomUUID()`), independent of live
 * `chrome.tabs` numeric ids. Ordering uses a coarse integer step (`ORDER_STEP`)
 * so a new sibling can always be appended (`nextOrder`) and inserts have room to
 * sit between neighbours without renumbering the whole list.
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
