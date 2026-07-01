/**
 * Dedupe finder: groups exact-duplicate URLs (with optional normalization) and
 * offers one-click cleanup. The earliest-saved tab in each group is kept; the
 * rest are pre-checked for removal but every checkbox is user-overridable.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Modal } from './Modal';
import { EmptyState } from './EmptyState';
import { findDuplicates } from '../../core/dedupe';
import type { DedupeOptions } from '../../core/dedupe';
import { folderPath } from '../../core/tree';
import type { Folder, SavedTab, TabId } from '../../core/types';

export interface DedupeDialogProps {
  tabs: SavedTab[];
  folders: Folder[];
  options: DedupeOptions;
  onOptionsChange: (options: DedupeOptions) => void;
  onCleanup: (removeIds: TabId[]) => Promise<void>;
  onClose: () => void;
}

export function DedupeDialog({
  tabs,
  folders,
  options,
  onOptionsChange,
  onCleanup,
  onClose,
}: DedupeDialogProps) {
  const groups = useMemo(() => findDuplicates(tabs, options), [tabs, options]);

  const allRemovable = useMemo(() => {
    const ids = new Set<TabId>();
    for (const g of groups) for (const id of g.remove) ids.add(id);
    return ids;
  }, [groups]);

  const [selected, setSelected] = useState<Set<TabId>>(new Set());
  const [busy, setBusy] = useState(false);

  // Whenever the duplicate set changes (options change / cleanup happened),
  // default the selection to "remove every duplicate".
  useEffect(() => {
    setSelected(new Set(allRemovable));
  }, [allRemovable]);

  const pathOf = (id: string): string => folderPath(id, folders) || 'Inbox';

  function toggle(id: TabId): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setOption(key: keyof DedupeOptions, value: boolean): void {
    onOptionsChange({ ...options, [key]: value });
  }

  async function cleanup(): Promise<void> {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      await onCleanup([...selected]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Find duplicates" onClose={onClose} wide>
      <div class="etg-dedupe__opts">
        <label class="etg-check">
          <input
            type="checkbox"
            checked={!!options.ignoreHash}
            onChange={(e) =>
              setOption(
                'ignoreHash',
                (e.currentTarget as HTMLInputElement).checked,
              )
            }
          />
          Ignore #hash
        </label>
        <label class="etg-check">
          <input
            type="checkbox"
            checked={!!options.ignoreQuery}
            onChange={(e) =>
              setOption(
                'ignoreQuery',
                (e.currentTarget as HTMLInputElement).checked,
              )
            }
          />
          Ignore ?query
        </label>
        <label class="etg-check">
          <input
            type="checkbox"
            checked={!!options.ignoreTrailingSlash}
            onChange={(e) =>
              setOption(
                'ignoreTrailingSlash',
                (e.currentTarget as HTMLInputElement).checked,
              )
            }
          />
          Ignore trailing /
        </label>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon="✨"
          title="No duplicates found"
          hint="Every saved URL is unique under the current matching rules."
        />
      ) : (
        <>
          <p class="etg-dedupe__summary">
            {groups.length} duplicate group{groups.length === 1 ? '' : 's'} ·{' '}
            {allRemovable.size} removable · {selected.size} selected
          </p>
          <ul class="etg-dedupe__groups">
            {groups.map((g) => (
              <li key={g.key} class="etg-dedupe__group">
                <div class="etg-dedupe__key" title={g.key}>
                  {g.key}
                </div>
                {g.tabs.map((t) => {
                  const isKeep = t.id === g.keep;
                  return (
                    <label
                      key={t.id}
                      class={
                        isKeep
                          ? 'etg-dedupe__row etg-dedupe__row--keep'
                          : 'etg-dedupe__row'
                      }
                    >
                      <input
                        type="checkbox"
                        disabled={isKeep}
                        checked={isKeep ? false : selected.has(t.id)}
                        onChange={() => toggle(t.id)}
                      />
                      <span class="etg-dedupe__badge">
                        {isKeep ? 'keep' : 'remove'}
                      </span>
                      <span class="etg-dedupe__title" title={t.title || t.url}>
                        {t.title || t.url}
                      </span>
                      <span class="etg-dedupe__path">{pathOf(t.folderId)}</span>
                    </label>
                  );
                })}
              </li>
            ))}
          </ul>
          <div class="etg-modal__footer">
            <button type="button" class="etg-btn" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              class="etg-btn etg-btn--danger"
              disabled={busy || selected.size === 0}
              onClick={() => void cleanup()}
            >
              Remove {selected.size} duplicate{selected.size === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
