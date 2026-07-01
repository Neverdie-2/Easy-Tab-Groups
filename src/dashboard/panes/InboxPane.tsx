/**
 * LEFT pane (docs/PLAN.md §2.6): live/inbox tabs grouped by window, domain
 * filter, checkbox multi-select with "select all matching", batch-move.
 *
 * NOTE: scaffold shell — implemented in Phase 7.
 */
export function InboxPane() {
  return (
    <section class="etg-pane etg-pane--inbox" aria-label="Inbox and live tabs">
      <h2 class="etg-pane__title">Inbox</h2>
      <p class="etg-pane__hint">
        Capture your open tabs, filter by domain, then file them into folders.
      </p>
    </section>
  );
}
