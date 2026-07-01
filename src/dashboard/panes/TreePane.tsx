/**
 * RIGHT pane (docs/PLAN.md §2.6): recursive nested folder tree with native
 * drag-and-drop and folder CRUD. Clicking a folder reopens it as a native tab
 * group.
 *
 * NOTE: scaffold shell — implemented in Phase 7.
 */
export function TreePane() {
  return (
    <section class="etg-pane etg-pane--tree" aria-label="Folder tree">
      <h2 class="etg-pane__title">Folders</h2>
      <p class="etg-pane__hint">
        Your unlimited nested vault. Click a folder to reopen its tabs as a
        native group.
      </p>
    </section>
  );
}
