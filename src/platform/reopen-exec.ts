/**
 * Reopen executor (docs/PLAN.md §3.12). The edge that turns a pure ReopenPlan
 * into real tabs + a named native tab group.
 *
 * NOTE: scaffold stub — implemented in Phase 4.
 */
import type { ReopenPlan } from '../core/reopen';
import type { ChromeAdapter } from './chrome';
import type { ReopenResult } from './messages';

/**
 * Creates tabs (adapter.createTab per url), groups them, and names the group
 * `plan.groupName`.
 */
export async function executeReopen(
  _plan: ReopenPlan,
  _adapter: ChromeAdapter,
): Promise<ReopenResult> {
  throw new Error('not implemented: scaffold stub');
}
