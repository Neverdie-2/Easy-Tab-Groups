/**
 * Top-level dashboard layout (docs/PLAN.md §2.6). Two panes: live/inbox tabs on
 * the LEFT, the nested folder tree on the RIGHT.
 *
 * NOTE: scaffold shell — top-level state, storage wiring, capture/reopen flows
 * are implemented in Phases 6-7.
 */
import { InboxPane } from './panes/InboxPane';
import { TreePane } from './panes/TreePane';

export function App() {
  return (
    <div class="etg-app">
      <header class="etg-header">
        <h1 class="etg-title">Easy Tab Groups</h1>
        <p class="etg-tagline">Local-only tab rescue &amp; nested organizer.</p>
      </header>
      <main class="etg-panes">
        <InboxPane />
        <TreePane />
      </main>
    </div>
  );
}
