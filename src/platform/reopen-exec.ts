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
import { isReopenableUrl } from '../core/url';
import type { ChromeAdapter } from './chrome';
import { TAB_GROUP_COLORS } from './chrome';
import type { ReopenResult } from './messages';

/** Sentinel `groupId` returned when a plan has no urls (no group is created). */
export const NO_GROUP = -1;

/**
 * How many tabs to create before yielding a macrotask back to the event loop.
 * Keeps a large reopen from monopolising the (single-threaded) service worker so
 * the browser stays responsive while dozens/hundreds of tabs are spawned.
 */
const CREATE_BATCH_SIZE = 10;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

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
 * Creates one background tab per url (in plan order), groups the ones that
 * opened, and names the native group `plan.groupName` with a stable color.
 *
 * Resilient by design (never orphans tabs, never bricks a folder):
 * - Non-http(s) urls (`javascript:`, `chrome://`, `file://`, …) are skipped up
 *   front — they are unsafe and/or `chrome.tabs.create` rejects them.
 * - Each create is wrapped in try/catch, so one un-creatable url can never abort
 *   the whole reopen and strand the tabs that already opened.
 * - Creates are chunked with an event-loop yield so a large reopen doesn't hang
 *   the service worker.
 *
 * Returns the created tab ids, the group id (or `NO_GROUP` when nothing opened),
 * and how many urls were skipped so the caller can inform the user.
 */
export async function executeReopen(
  plan: ReopenPlan,
  adapter: ChromeAdapter,
): Promise<ReopenResult> {
  const tabIds: number[] = [];
  let skipped = 0;
  let sinceYield = 0;

  // Sequential so tabs land in the group in the folder's saved order.
  for (const url of plan.urls) {
    if (!isReopenableUrl(url)) {
      skipped++;
      continue;
    }
    try {
      tabIds.push(await adapter.createTab(url, false));
    } catch {
      // A single un-creatable url must not abort the rest of the reopen.
      skipped++;
    }
    if (++sinceYield >= CREATE_BATCH_SIZE) {
      sinceYield = 0;
      await yieldToEventLoop();
    }
  }

  if (tabIds.length === 0) {
    return { groupId: NO_GROUP, tabIds: [], skipped };
  }

  const groupId = await adapter.groupTabs(tabIds);
  await adapter.nameGroup(
    groupId,
    plan.groupName,
    pickGroupColor(plan.groupName),
  );
  return { groupId, tabIds, skipped };
}
