/**
 * LEFT pane (docs/PLAN.md §2.6): the browser's live open tabs, grouped by
 * window, with a domain filter, checkbox multi-select + "select all matching",
 * and batch-move into a folder (optionally closing the tabs to free RAM). The
 * "Import open tabs" button captures everything into the Inbox at once.
 *
 * Performance: with 1,600+ open tabs the rendered rows are capped
 * (`renderLimit`) while selection/counts operate on the FULL filtered set, so
 * "select all matching" stays correct without mounting thousands of DOM nodes.
 */
import { useMemo, useState } from 'preact/hooks';
import { TabRow } from '../components/TabRow';
import { EmptyState } from '../components/EmptyState';
import { MoveTargetPicker } from '../components/MoveTargetPicker';
import { domainOf } from '../../core/url';
import type { Folder, FolderId } from '../../core/types';
import type { LiveTab } from '../../platform/chrome';

export interface InboxPaneProps {
  liveTabs: LiveTab[];
  loading: boolean;
  folders: Folder[];
  busy: boolean;
  onImportAll: (live: LiveTab[]) => void;
  onFileLive: (
    live: LiveTab[],
    folderId: FolderId,
    closeAfter: boolean,
  ) => void;
  onRefresh: () => void;
  onCreateFolder: (
    name: string,
    parentId: FolderId | null,
  ) => Promise<FolderId>;
}

const RENDER_STEP = 200;

interface TabIndexEntry {
  tab: LiveTab;
  domain: string;
  urlLower: string;
  titleLower: string;
}

export function InboxPane({
  liveTabs,
  loading,
  folders,
  busy,
  onImportAll,
  onFileLive,
  onRefresh,
  onCreateFolder,
}: InboxPaneProps) {
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [closeAfter, setCloseAfter] = useState(true);
  const [renderLimit, setRenderLimit] = useState(RENDER_STEP);
  const [picking, setPicking] = useState(false);

  const q = filter.trim().toLowerCase();

  // Parse each url exactly ONCE per liveTabs change (not per keystroke). Typing
  // a filter over 1,600+ tabs then only does cheap string `includes`, never
  // `new URL()`, so the input stays responsive.
  const index = useMemo<TabIndexEntry[]>(
    () =>
      liveTabs.map((tab) => ({
        tab,
        domain: domainOf(tab.url),
        urlLower: tab.url.toLowerCase(),
        titleLower: tab.title.toLowerCase(),
      })),
    [liveTabs],
  );

  const filtered = useMemo(() => {
    if (q.length === 0) return liveTabs;
    return index
      .filter(
        (e) =>
          e.domain.includes(q) ||
          e.urlLower.includes(q) ||
          e.titleLower.includes(q),
      )
      .map((e) => e.tab);
  }, [liveTabs, index, q]);

  const domains = useMemo(() => {
    const set = new Set<string>();
    for (const e of index) if (e.domain) set.add(e.domain);
    return [...set].sort();
  }, [index]);

  // Group the FILTERED tabs by window, in stable window order.
  const groups = useMemo(() => {
    const windowIds = [...new Set(liveTabs.map((t) => t.windowId))].sort(
      (a, b) => a - b,
    );
    const label = new Map<number, number>();
    windowIds.forEach((id, i) => label.set(id, i + 1));
    const byWindow = new Map<number, LiveTab[]>();
    for (const t of filtered) {
      const list = byWindow.get(t.windowId);
      if (list) list.push(t);
      else byWindow.set(t.windowId, [t]);
    }
    return windowIds
      .filter((id) => byWindow.has(id))
      .map((id) => ({
        windowId: id,
        label: label.get(id) ?? 0,
        tabs: byWindow.get(id) ?? [],
      }));
  }, [liveTabs, filtered]);

  function toggle(id: number): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllMatching(): void {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const t of filtered) next.add(t.id);
      return next;
    });
  }

  function selectedLiveTabs(): LiveTab[] {
    return liveTabs.filter((t) => selected.has(t.id));
  }

  function onPick(folderId: FolderId): void {
    const chosen = selectedLiveTabs();
    setPicking(false);
    if (chosen.length === 0) return;
    onFileLive(chosen, folderId, closeAfter);
    setSelected(new Set());
  }

  let rendered = 0;
  const totalFiltered = filtered.length;

  return (
    <section class="etg-pane etg-pane--inbox" aria-label="Open and inbox tabs">
      <div class="etg-pane__head">
        <h2 class="etg-pane__title">
          Open tabs <span class="etg-count">{liveTabs.length}</span>
        </h2>
        <div class="etg-pane__head-actions">
          <button
            type="button"
            class="etg-btn"
            onClick={onRefresh}
            disabled={busy || loading}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button
            type="button"
            class="etg-btn etg-btn--primary"
            onClick={() => onImportAll(liveTabs)}
            disabled={busy || liveTabs.length === 0}
            title="Save every open tab into the Inbox (keeps them open)"
          >
            Import open tabs
          </button>
        </div>
      </div>

      <div class="etg-inbox__filter">
        <input
          type="search"
          class="etg-input"
          list="etg-domains"
          placeholder="Filter by domain, url or title…"
          value={filter}
          aria-label="Filter open tabs"
          onInput={(e) =>
            setFilter((e.currentTarget as HTMLInputElement).value)
          }
        />
        <datalist id="etg-domains">
          {domains.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </div>

      <div class="etg-inbox__selbar">
        <button
          type="button"
          class="etg-btn etg-btn--sm"
          onClick={selectAllMatching}
          disabled={totalFiltered === 0}
        >
          Select all matching ({totalFiltered})
        </button>
        <button
          type="button"
          class="etg-btn etg-btn--sm"
          onClick={() => setSelected(new Set())}
          disabled={selected.size === 0}
        >
          Clear
        </button>
        <label class="etg-check etg-check--sm">
          <input
            type="checkbox"
            checked={closeAfter}
            onChange={(e) =>
              setCloseAfter((e.currentTarget as HTMLInputElement).checked)
            }
          />
          Close after filing
        </label>
        <span class="etg-inbox__selcount">{selected.size} selected</span>
        <button
          type="button"
          class="etg-btn etg-btn--primary etg-btn--sm"
          onClick={() => setPicking(true)}
          disabled={selected.size === 0 || busy}
        >
          Move to folder…
        </button>
      </div>

      {liveTabs.length === 0 ? (
        <EmptyState
          icon="🗂"
          title={loading ? 'Reading your open tabs…' : 'No open tabs found'}
          hint={
            loading
              ? undefined
              : 'Open some tabs, then press Refresh to see them here.'
          }
        />
      ) : totalFiltered === 0 ? (
        <EmptyState
          icon="🔍"
          title="No tabs match this filter"
          hint="Try a different domain or clear the filter."
        />
      ) : (
        <div class="etg-inbox__list">
          {groups.map((group) => {
            const remaining = Math.max(0, renderLimit - rendered);
            const show = group.tabs.slice(0, remaining);
            rendered += show.length;
            const allInWindowSelected =
              group.tabs.length > 0 &&
              group.tabs.every((t) => selected.has(t.id));
            return (
              <div key={group.windowId} class="etg-window">
                <div class="etg-window__head">
                  <span class="etg-window__title">
                    Window {group.label}{' '}
                    <span class="etg-count">{group.tabs.length}</span>
                  </span>
                  <button
                    type="button"
                    class="etg-btn etg-btn--sm"
                    onClick={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (allInWindowSelected) {
                          for (const t of group.tabs) next.delete(t.id);
                        } else {
                          for (const t of group.tabs) next.add(t.id);
                        }
                        return next;
                      })
                    }
                  >
                    {allInWindowSelected ? 'Deselect window' : 'Select window'}
                  </button>
                </div>
                {show.map((tab) => (
                  <TabRow
                    key={tab.id}
                    url={tab.url}
                    title={tab.title}
                    selectable
                    selected={selected.has(tab.id)}
                    onSelectChange={() => toggle(tab.id)}
                  />
                ))}
              </div>
            );
          })}
          {rendered < totalFiltered ? (
            <div class="etg-inbox__more">
              <button
                type="button"
                class="etg-btn etg-btn--sm"
                onClick={() => setRenderLimit((n) => n + RENDER_STEP)}
              >
                Show more ({totalFiltered - rendered} hidden)
              </button>
            </div>
          ) : null}
        </div>
      )}

      {picking ? (
        <MoveTargetPicker
          folders={folders}
          count={selected.size}
          onCancel={() => setPicking(false)}
          onPick={onPick}
          onCreateFolder={onCreateFolder}
        />
      ) : null}
    </section>
  );
}
