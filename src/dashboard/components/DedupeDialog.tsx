/**
 * Dedupe finder: groups exact-duplicate URLs (with optional normalization) and
 * offers one-click cleanup. The earliest-saved tab in each group is kept.
 *
 * Safe defaults: only duplicates that share the KEEP tab's folder are pre-
 * checked. A copy the user deliberately filed into a DIFFERENT folder is shown
 * but left unchecked, so a careless "Remove" click can't delete a copy from an
 * unrelated folder. Every checkbox is still user-overridable.
 *
 * At scale the rendered group list is capped (like the other lists) so opening
 * the dialog on thousands of duplicates never jank-freezes the dashboard; the
 * removable/selected counts are always computed over the FULL set.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Modal } from './Modal';
import { EmptyState } from './EmptyState';
import { findDuplicates } from '../../core/dedupe';
import type { DedupeOptions } from '../../core/dedupe';
import { folderPath } from '../../core/tree';
import type { Folder, SavedTab, TabId } from '../../core/types';

const GROUP_RENDER_STEP = 200;

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

  // Pre-checked by default: only removable copies that live in the SAME folder
  // as the kept tab. Cross-folder copies are deliberate and left unchecked.
  const sameFolderRemovable = useMemo(() => {
    const ids = new Set<TabId>();
    for (const g of groups) {
      const keepFolder = g.tabs.find((t) => t.id === g.keep)?.folderId;
      for (const t of g.tabs) {
        if (t.id !== g.keep && t.folderId === keepFolder) ids.add(t.id);
      }
    }
    return ids;
  }, [groups]);

  const crossFolderCount = allRemovable.size - sameFolderRemovable.size;

  const [selected, setSelected] = useState<Set<TabId>>(new Set());
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(GROUP_RENDER_STEP);

  // Whenever the duplicate set changes (options change / cleanup happened),
  // default the selection to the SAME-FOLDER duplicates only.
  useEffect(() => {
    setSelected(new Set(sameFolderRemovable));
  }, [sameFolderRemovable]);

  const shownGroups = groups.slice(0, shown);
  const hiddenGroups = groups.length - shownGroups.length;

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
    <Modal
      title="Find duplicates"
      onClose={onClose}
      wide
      dismissOnBackdrop={false}
    >
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
            {crossFolderCount > 0
              ? ` · ${crossFolderCount} in another folder left unchecked`
              : ''}
          </p>
          <ul class="etg-dedupe__groups">
            {shownGroups.map((g) => (
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
          {hiddenGroups > 0 ? (
            <div class="etg-inbox__more">
              <button
                type="button"
                class="etg-btn etg-btn--sm"
                onClick={() => setShown((n) => n + GROUP_RENDER_STEP)}
              >
                Show more ({hiddenGroups} group{hiddenGroups === 1 ? '' : 's'}{' '}
                hidden)
              </button>
            </div>
          ) : null}
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
