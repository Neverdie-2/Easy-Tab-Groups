/**
 * Destination-folder picker for batch-move (select-all-matching → folder) and
 * the "file these live tabs" flow. Lists every folder by its full path, filters
 * as you type, and can create a new folder inline before moving into it.
 */
import { useMemo, useState } from 'preact/hooks';
import { Modal } from './Modal';
import { folderPath } from '../../core/tree';
import type { Folder, FolderId } from '../../core/types';

export interface MoveTargetPickerProps {
  folders: Folder[];
  /** How many tabs will be moved — shown for confirmation. */
  count: number;
  onCancel: () => void;
  onPick: (folderId: FolderId) => void;
  onCreateFolder: (
    name: string,
    parentId: FolderId | null,
  ) => Promise<FolderId>;
}

interface Option {
  id: FolderId;
  path: string;
  depth: number;
}

export function MoveTargetPicker({
  folders,
  count,
  onCancel,
  onPick,
  onCreateFolder,
}: MoveTargetPickerProps) {
  const [filter, setFilter] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo<Option[]>(() => {
    return folders
      .map((f) => {
        const path = folderPath(f.id, folders);
        return { id: f.id, path, depth: path.split(' / ').length - 1 };
      })
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }, [folders]);

  const q = filter.trim().toLowerCase();
  const visible = q
    ? options.filter((o) => o.path.toLowerCase().includes(q))
    : options;

  async function createAndPick(): Promise<void> {
    const name = newName.trim();
    if (name.length === 0) return;
    setCreating(true);
    setError(null);
    try {
      const id = await onCreateFolder(name, null);
      onPick(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCreating(false);
    }
  }

  return (
    <Modal
      title={`Move ${count} tab${count === 1 ? '' : 's'} to…`}
      onClose={onCancel}
    >
      <input
        type="search"
        class="etg-input"
        placeholder="Filter folders…"
        value={filter}
        aria-label="Filter folders"
        onInput={(e) => setFilter((e.currentTarget as HTMLInputElement).value)}
      />

      <ul class="etg-picker__list">
        {visible.length === 0 ? (
          <li class="etg-picker__empty">No matching folders.</li>
        ) : (
          visible.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                class="etg-picker__item"
                style={{ paddingLeft: `${8 + o.depth * 16}px` }}
                onClick={() => onPick(o.id)}
              >
                {o.path}
              </button>
            </li>
          ))
        )}
      </ul>

      <div class="etg-picker__new">
        <input
          type="text"
          class="etg-input"
          placeholder="New top-level folder name…"
          value={newName}
          aria-label="New folder name"
          onInput={(e) =>
            setNewName((e.currentTarget as HTMLInputElement).value)
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') void createAndPick();
          }}
        />
        <button
          type="button"
          class="etg-btn etg-btn--primary"
          disabled={creating || newName.trim().length === 0}
          onClick={() => void createAndPick()}
        >
          Create &amp; move
        </button>
      </div>

      {error ? <p class="etg-error">{error}</p> : null}
    </Modal>
  );
}
