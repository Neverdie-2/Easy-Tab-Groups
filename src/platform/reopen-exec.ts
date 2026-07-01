/**
 * Reopen executor (docs/PLAN.md §3.12). The edge that turns a pure `ReopenPlan`
 * into real tabs + a named native tab group. This is the concrete
 * "OPEN a folder -> native Brave tab group" capability:
 *   chrome.tabs.create -> chrome.tabs.group -> chrome.tabGroups.update.
 *
 * Pure planning lives in `core/reopen.ts`; all `chrome.*` calls go through the
 * injected `ChromeAdapter`, keeping this unit-testable with a fake adapter.
 */
import type { ReopenPlan } from '../core/reopen';
import type { ChromeAdapter } from './chrome';
import { TAB_GROUP_COLORS } from './chrome';
import type { ReopenResult } from './messages';

/** Sentinel `groupId` returned when a plan has no urls (no group is created). */
export const NO_GROUP = -1;

/**
 * Deterministically map a group name to one of the native group colors (FNV-1a
 * over the name). Same folder name -> same color across reopens, so groups stay
 * visually stable. Purely local math; no randomness, no I/O.
 */
function pickGroupColor(name: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const index = (hash >>> 0) % TAB_GROUP_COLORS.length;
  return TAB_GROUP_COLORS[index];
}

/**
 * Creates one background tab per url (in plan order), groups them, and names the
 * native group `plan.groupName` with a stable color. An empty plan is a no-op
 * that creates nothing.
 */
export async function executeReopen(
  plan: ReopenPlan,
  adapter: ChromeAdapter,
): Promise<ReopenResult> {
  const tabIds: number[] = [];
  // Sequential so tabs land in the group in the folder's saved order and the
  // browser is never flooded with a burst of concurrent creates.
  for (const url of plan.urls) {
    tabIds.push(await adapter.createTab(url, false));
  }

  if (tabIds.length === 0) {
    return { groupId: NO_GROUP, tabIds: [] };
  }

  const groupId = await adapter.groupTabs(tabIds);
  await adapter.nameGroup(
    groupId,
    plan.groupName,
    pickGroupColor(plan.groupName),
  );
  return { groupId, tabIds };
}
