/**
 * One folder tree node. Recursion (unlimited nesting) happens here: a node
 * renders its own row, then its child `FolderNode`s and its tab leaves.
 *
 * Interactions:
 * - expand/collapse, reopen-as-group, rename (inline), delete (confirmed),
 *   add subfolder (inline), and ↑/↓ reorder among siblings.
 * - Native HTML5 drag-and-drop: drag a folder or a tab onto a folder row to
 *   move it INTO that folder (the shared `dragRef` carries the payload since
 *   `dataTransfer` is unreadable during `dragover`). The system Inbox cannot be
 *   dragged, renamed or deleted.
 *
 * Performance: a folder's tab leaves are capped (`tabRenderLimit`) with a
 * "show more" affordance so a folder holding thousands of tabs never renders
 * them all at once.
 */
import { useState } from 'preact/hooks';
import { TabRow } from './TabRow';
import type { TreeNode } from '../../core/tree';
import type { FolderId, TabId } from '../../core/types';

export type DragPayload =
  { kind: 'folder'; id: FolderId } | { kind: 'tab'; id: TabId };

export interface TreeCallbacks {
  includeSubfolders: boolean;
  expanded: Set<FolderId>;
  onToggleExpand: (id: FolderId) => void;
  onReopen: (id: FolderId, includeSubfolders: boolean) => void;
  onOpenTab: (url: string) => void;
  onCreateSubfolder: (parentId: FolderId, name: string) => void;
  onRename: (id: FolderId, name: string) => void;
  onDelete: (id: FolderId) => void;
  onMoveFolder: (
    id: FolderId,
    parentId: FolderId | null,
    index: number,
  ) => void;
  onMoveTabsInto: (tabIds: TabId[], folderId: FolderId) => void;
  dragRef: { current: DragPayload | null };
  dropTargetId: FolderId | null;
  setDropTargetId: (id: FolderId | null) => void;
  tabRenderLimit: number;
}

export interface FolderNodeProps {
  node: TreeNode;
  depth: number;
  index: number;
  siblingCount: number;
  cb: TreeCallbacks;
}

const APPEND_INDEX = Number.MAX_SAFE_INTEGER;

export function FolderNode({
  node,
  depth,
  index,
  siblingCount,
  cb,
}: FolderNodeProps) {
  const { folder } = node;
  const system = folder.system === true;
  const isOpen = cb.expanded.has(folder.id);
  const isDropTarget = cb.dropTargetId === folder.id;

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(folder.name);
  const [adding, setAdding] = useState(false);
  const [addValue, setAddValue] = useState('');
  const [shownTabs, setShownTabs] = useState(cb.tabRenderLimit);

  function commitRename(): void {
    const name = editValue.trim();
    setEditing(false);
    if (name.length > 0 && name !== folder.name) cb.onRename(folder.id, name);
  }

  function commitAdd(): void {
    const name = addValue.trim();
    if (name.length > 0) {
      cb.onCreateSubfolder(folder.id, name);
      if (!isOpen) cb.onToggleExpand(folder.id);
    }
    setAddValue('');
    setAdding(false);
  }

  function onRowDragOver(e: DragEvent): void {
    if (!cb.dragRef.current) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    if (cb.dropTargetId !== folder.id) cb.setDropTargetId(folder.id);
  }

  function onRowDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const payload = cb.dragRef.current;
    cb.dragRef.current = null;
    cb.setDropTargetId(null);
    if (!payload) return;
    if (payload.kind === 'tab') {
      cb.onMoveTabsInto([payload.id], folder.id);
    } else if (payload.id !== folder.id) {
      cb.onMoveFolder(payload.id, folder.id, APPEND_INDEX);
    }
  }

  const tabsToShow = node.tabs.slice(0, shownTabs);
  const hiddenTabs = node.tabs.length - tabsToShow.length;

  return (
    <li class="etg-folder">
      <div
        class={
          isDropTarget
            ? 'etg-folder__row etg-folder__row--drop'
            : 'etg-folder__row'
        }
        style={{ paddingLeft: `${depth * 16}px` }}
        onDragOver={onRowDragOver}
        onDragLeave={() => {
          if (cb.dropTargetId === folder.id) cb.setDropTargetId(null);
        }}
        onDrop={onRowDrop}
      >
        <button
          type="button"
          class="etg-folder__caret"
          aria-label={isOpen ? 'Collapse' : 'Expand'}
          aria-expanded={isOpen}
          onClick={() => cb.onToggleExpand(folder.id)}
        >
          {node.children.length > 0 || node.tabs.length > 0
            ? isOpen
              ? '▾'
              : '▸'
            : '·'}
        </button>
        <span class="etg-folder__icon" aria-hidden="true">
          {system ? '📥' : '📁'}
        </span>

        {editing ? (
          <input
            type="text"
            class="etg-input etg-folder__edit"
            value={editValue}
            autofocus
            aria-label="Folder name"
            onInput={(e) =>
              setEditValue((e.currentTarget as HTMLInputElement).value)
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setEditing(false);
            }}
            onBlur={commitRename}
          />
        ) : (
          <span
            class="etg-folder__name"
            draggable={!system}
            title={
              system ? 'Inbox (system folder)' : 'Drag to move into a folder'
            }
            onDblClick={() => {
              if (!system) {
                setEditValue(folder.name);
                setEditing(true);
              }
            }}
            onDragStart={(e) => {
              if (system) return;
              cb.dragRef.current = { kind: 'folder', id: folder.id };
              if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', folder.name);
              }
            }}
            onDragEnd={() => {
              cb.dragRef.current = null;
              cb.setDropTargetId(null);
            }}
          >
            {folder.name}
          </span>
        )}

        <span class="etg-folder__count">{node.tabs.length}</span>

        <div class="etg-folder__actions">
          <button
            type="button"
            class="etg-btn etg-btn--sm"
            title={
              cb.includeSubfolders
                ? 'Reopen this folder and its subfolders as a native group'
                : 'Reopen this folder as a native group'
            }
            onClick={() => cb.onReopen(folder.id, cb.includeSubfolders)}
          >
            Open
          </button>
          <button
            type="button"
            class="etg-btn etg-btn--sm"
            title="Add subfolder"
            onClick={() => setAdding((v) => !v)}
          >
            ＋
          </button>
          {!system ? (
            <>
              <button
                type="button"
                class="etg-btn etg-btn--sm"
                title="Move up"
                disabled={index === 0}
                onClick={() =>
                  cb.onMoveFolder(folder.id, folder.parentId, index - 1)
                }
              >
                ↑
              </button>
              <button
                type="button"
                class="etg-btn etg-btn--sm"
                title="Move down"
                disabled={index >= siblingCount - 1}
                onClick={() =>
                  cb.onMoveFolder(folder.id, folder.parentId, index + 1)
                }
              >
                ↓
              </button>
              <button
                type="button"
                class="etg-btn etg-btn--sm"
                title="Rename"
                onClick={() => {
                  setEditValue(folder.name);
                  setEditing(true);
                }}
              >
                ✎
              </button>
              <button
                type="button"
                class="etg-btn etg-btn--sm etg-btn--danger"
                title="Delete folder and its contents"
                onClick={() => {
                  const hasContents =
                    node.tabs.length > 0 || node.children.length > 0;
                  if (
                    !hasContents ||
                    confirm(
                      `Delete "${folder.name}" and everything inside it? This cannot be undone.`,
                    )
                  ) {
                    cb.onDelete(folder.id);
                  }
                }}
              >
                🗑
              </button>
            </>
          ) : null}
        </div>
      </div>

      {adding ? (
        <div
          class="etg-folder__add"
          style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
        >
          <input
            type="text"
            class="etg-input"
            placeholder="New subfolder name…"
            value={addValue}
            autofocus
            aria-label="New subfolder name"
            onInput={(e) =>
              setAddValue((e.currentTarget as HTMLInputElement).value)
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitAdd();
              if (e.key === 'Escape') {
                setAdding(false);
                setAddValue('');
              }
            }}
          />
          <button
            type="button"
            class="etg-btn etg-btn--primary etg-btn--sm"
            disabled={addValue.trim().length === 0}
            onClick={commitAdd}
          >
            Add
          </button>
        </div>
      ) : null}

      {isOpen ? (
        <ul class="etg-folder__children">
          {node.children.map((child, i) => (
            <FolderNode
              key={child.folder.id}
              node={child}
              depth={depth + 1}
              index={i}
              siblingCount={node.children.length}
              cb={cb}
            />
          ))}
          {tabsToShow.map((tab) => (
            <li
              key={tab.id}
              class="etg-folder__leaf"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              <TabRow
                url={tab.url}
                title={tab.title}
                draggable
                onDragStart={(e) => {
                  cb.dragRef.current = { kind: 'tab', id: tab.id };
                  if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', tab.url);
                  }
                }}
                onDragEnd={() => {
                  cb.dragRef.current = null;
                  cb.setDropTargetId(null);
                }}
                trailing={
                  <button
                    type="button"
                    class="etg-btn etg-btn--sm"
                    title="Open this tab"
                    onClick={() => cb.onOpenTab(tab.url)}
                  >
                    Open
                  </button>
                }
              />
            </li>
          ))}
          {hiddenTabs > 0 ? (
            <li
              class="etg-folder__more"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              <button
                type="button"
                class="etg-btn etg-btn--sm"
                onClick={() => setShownTabs((n) => n + cb.tabRenderLimit)}
              >
                Show {Math.min(hiddenTabs, cb.tabRenderLimit)} more of{' '}
                {hiddenTabs}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}
