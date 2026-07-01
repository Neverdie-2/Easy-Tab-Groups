/**
 * RIGHT pane (docs/PLAN.md §2.6): the unlimited-depth nested folder tree with
 * native drag-and-drop, inline folder CRUD, a vault-wide search box and a
 * "reopen as native group" action. Search results replace the tree while a
 * query is active.
 *
 * DnD wiring: a `dragRef` carries the current payload (folder or tab) across the
 * drag because `DataTransfer` is unreadable during `dragover`; `dropTargetId`
 * drives the drop highlight. Folders can also be dropped on the root zone to
 * move them back to the top level.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { FolderNode } from '../components/FolderNode';
import type { DragPayload, TreeCallbacks } from '../components/FolderNode';
import { SearchBar } from '../components/SearchBar';
import { TabRow } from '../components/TabRow';
import { EmptyState } from '../components/EmptyState';
import { buildTree, folderPath } from '../../core/tree';
import { search } from '../../core/search';
import { INBOX_ID } from '../../core/types';
import type { Folder, FolderId, SavedTab, TabId } from '../../core/types';

export interface TreePaneProps {
  folders: Folder[];
  tabs: SavedTab[];
  busy: boolean;
  includeSubfolders: boolean;
  onIncludeSubfoldersChange: (value: boolean) => void;
  searchQuery: string;
  onSearchInput: (value: string) => void;
  onReopen: (id: FolderId, includeSubfolders: boolean) => void;
  onOpenTab: (url: string) => void;
  onCreateFolder: (name: string, parentId: FolderId | null) => void;
  onRename: (id: FolderId, name: string) => void;
  onDelete: (id: FolderId) => void;
  onMoveFolder: (
    id: FolderId,
    parentId: FolderId | null,
    index: number,
  ) => void;
  onMoveTabsInto: (tabIds: TabId[], folderId: FolderId) => void;
}

const APPEND_INDEX = Number.MAX_SAFE_INTEGER;
const SEARCH_RENDER_STEP = 200;
const TAB_RENDER_LIMIT = 100;

export function TreePane(props: TreePaneProps) {
  const {
    folders,
    tabs,
    busy,
    includeSubfolders,
    onIncludeSubfoldersChange,
    searchQuery,
    onSearchInput,
    onReopen,
    onOpenTab,
    onCreateFolder,
    onRename,
    onDelete,
    onMoveFolder,
    onMoveTabsInto,
  } = props;

  const [addingRoot, setAddingRoot] = useState(false);
  const [rootName, setRootName] = useState('');
  const [expanded, setExpanded] = useState<Set<FolderId>>(new Set());
  const [dropTargetId, setDropTargetId] = useState<FolderId | null>(null);
  const [rootDropActive, setRootDropActive] = useState(false);
  const [searchLimit, setSearchLimit] = useState(SEARCH_RENDER_STEP);
  const dragRef = useRef<DragPayload | null>(null);
  const seededRef = useRef(false);

  const roots = useMemo(() => buildTree(folders, tabs), [folders, tabs]);

  // Seed the expansion once, when the vault first loads: open the Inbox and the
  // top-level folders so the user sees structure immediately.
  useEffect(() => {
    if (seededRef.current || folders.length === 0) return;
    seededRef.current = true;
    const seed = new Set<FolderId>([INBOX_ID]);
    for (const f of folders) if (f.parentId === null) seed.add(f.id);
    setExpanded(seed);
  }, [folders]);

  const query = searchQuery.trim();
  const results = useMemo(
    () => (query.length > 0 ? search(query, tabs) : []),
    [query, tabs],
  );

  function toggleExpand(id: FolderId): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function commitRoot(): void {
    const name = rootName.trim();
    if (name.length > 0) onCreateFolder(name, null);
    setRootName('');
    setAddingRoot(false);
  }

  const cb: TreeCallbacks = {
    includeSubfolders,
    expanded,
    onToggleExpand: toggleExpand,
    onReopen,
    onOpenTab,
    onCreateSubfolder: (parentId, name) => onCreateFolder(name, parentId),
    onRename,
    onDelete,
    onMoveFolder,
    onMoveTabsInto,
    dragRef,
    dropTargetId,
    setDropTargetId,
    tabRenderLimit: TAB_RENDER_LIMIT,
  };

  const userFolderCount = folders.filter((f) => f.id !== INBOX_ID).length;
  const emptyVault = userFolderCount === 0 && tabs.length === 0;

  return (
    <section class="etg-pane etg-pane--tree" aria-label="Folder tree">
      <div class="etg-pane__head">
        <h2 class="etg-pane__title">Folders</h2>
        <div class="etg-pane__head-actions">
          <label
            class="etg-check etg-check--sm"
            title="Include nested folders when reopening"
          >
            <input
              type="checkbox"
              checked={includeSubfolders}
              onChange={(e) =>
                onIncludeSubfoldersChange(
                  (e.currentTarget as HTMLInputElement).checked,
                )
              }
            />
            Include subfolders
          </label>
          <button
            type="button"
            class="etg-btn etg-btn--primary etg-btn--sm"
            onClick={() => setAddingRoot((v) => !v)}
            disabled={busy}
          >
            New folder
          </button>
        </div>
      </div>

      {addingRoot ? (
        <div class="etg-tree__addroot">
          <input
            type="text"
            class="etg-input"
            placeholder="New top-level folder name…"
            value={rootName}
            autofocus
            aria-label="New top-level folder name"
            onInput={(e) =>
              setRootName((e.currentTarget as HTMLInputElement).value)
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRoot();
              if (e.key === 'Escape') {
                setAddingRoot(false);
                setRootName('');
              }
            }}
          />
          <button
            type="button"
            class="etg-btn etg-btn--primary etg-btn--sm"
            disabled={rootName.trim().length === 0}
            onClick={commitRoot}
          >
            Add
          </button>
        </div>
      ) : null}

      <SearchBar
        value={searchQuery}
        onInput={onSearchInput}
        resultCount={results.length}
      />

      {query.length > 0 ? (
        <SearchResults
          results={results}
          folders={folders}
          limit={searchLimit}
          onShowMore={() => setSearchLimit((n) => n + SEARCH_RENDER_STEP)}
          onOpenTab={onOpenTab}
        />
      ) : emptyVault ? (
        <EmptyState
          icon="🌱"
          title="Your vault is empty"
          hint="Import your open tabs on the left, then file them into folders here. Create a folder to get started."
        />
      ) : (
        <>
          <ul class="etg-tree">
            {roots.map((node, i) => (
              <FolderNode
                key={node.folder.id}
                node={node}
                depth={0}
                index={i}
                siblingCount={roots.length}
                cb={cb}
              />
            ))}
          </ul>
          <div
            class={
              rootDropActive
                ? 'etg-tree__rootdrop etg-tree__rootdrop--active'
                : 'etg-tree__rootdrop'
            }
            onDragOver={(e) => {
              if (dragRef.current?.kind === 'folder') {
                e.preventDefault();
                setRootDropActive(true);
              }
            }}
            onDragLeave={() => setRootDropActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              const payload = dragRef.current;
              dragRef.current = null;
              setRootDropActive(false);
              setDropTargetId(null);
              if (payload?.kind === 'folder') {
                onMoveFolder(payload.id, null, APPEND_INDEX);
              }
            }}
          >
            Drop a folder here to move it to the top level
          </div>
        </>
      )}
    </section>
  );
}

interface SearchResultsProps {
  results: ReturnType<typeof search>;
  folders: Folder[];
  limit: number;
  onShowMore: () => void;
  onOpenTab: (url: string) => void;
}

function SearchResults({
  results,
  folders,
  limit,
  onShowMore,
  onOpenTab,
}: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <EmptyState
        icon="🔍"
        title="No matches"
        hint="No saved tab matches your search."
      />
    );
  }
  const shown = results.slice(0, limit);
  return (
    <div class="etg-results">
      {shown.map(({ tab }) => (
        <TabRow
          key={tab.id}
          url={tab.url}
          title={tab.title}
          subtitle={folderPath(tab.folderId, folders) || 'Inbox'}
          trailing={
            <button
              type="button"
              class="etg-btn etg-btn--sm"
              onClick={() => onOpenTab(tab.url)}
            >
              Open
            </button>
          }
        />
      ))}
      {results.length > shown.length ? (
        <div class="etg-inbox__more">
          <button
            type="button"
            class="etg-btn etg-btn--sm"
            onClick={onShowMore}
          >
            Show more ({results.length - shown.length} hidden)
          </button>
        </div>
      ) : null}
    </div>
  );
}
