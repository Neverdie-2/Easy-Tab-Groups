/**
 * Export (JSON + HTML bookmarks) and import (JSON) dialog.
 *
 * All strictly local: reads the vault snapshot, serializes with the pure core,
 * and saves via `Blob` + `URL.createObjectURL` + a temporary `<a download>`.
 * There is no network — no upload, no remote endpoint. Import reads a local file
 * the user picks and validates it through `core/export.fromJson`.
 */
import { useState } from 'preact/hooks';
import { Modal } from './Modal';
import { toBookmarksHtml, toJson, fromJson } from '../../core/export';
import type { VaultStorage } from '../../core/storage';
import type { VaultSnapshot } from '../../core/types';

export interface ExportImportDialogProps {
  storage: VaultStorage;
  onImport: (snap: VaultSnapshot, mode: 'merge' | 'replace') => Promise<void>;
  onStatus: (message: string) => void;
  onClose: () => void;
}

function timestamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Save `text` locally as a download. Blob URL is local — never a network hop. */
function downloadText(filename: string, type: string, text: string): void {
  const blob = new Blob([text], { type });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the download a tick to start before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export function ExportImportDialog({
  storage,
  onImport,
  onStatus,
  onClose,
}: ExportImportDialogProps) {
  const [pending, setPending] = useState<VaultSnapshot | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function exportJson(): Promise<void> {
    const snap = await storage.exportSnapshot();
    downloadText(
      `easy-tab-groups-${timestamp()}.json`,
      'application/json',
      toJson(snap),
    );
    onStatus('Exported vault to JSON.');
  }

  async function exportHtml(): Promise<void> {
    const snap = await storage.exportSnapshot();
    downloadText(
      `easy-tab-groups-${timestamp()}.html`,
      'text/html',
      toBookmarksHtml(snap),
    );
    onStatus('Exported vault to an HTML bookmarks file.');
  }

  async function onFile(e: Event): Promise<void> {
    setError(null);
    setPending(null);
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const snap = fromJson(text);
      setPending(snap);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function confirmImport(): Promise<void> {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await onImport(pending, mode);
      onStatus(
        `Imported ${pending.folders.length} folder(s) and ${pending.tabs.length} tab(s).`,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Modal title="Export & import" onClose={onClose} dismissOnBackdrop={false}>
      <section class="etg-io__section">
        <h3 class="etg-io__title">Export</h3>
        <p class="etg-io__hint">
          Save your whole vault locally. You are never locked in.
        </p>
        <div class="etg-io__row">
          <button
            type="button"
            class="etg-btn"
            onClick={() => void exportJson()}
          >
            Export JSON
          </button>
          <button
            type="button"
            class="etg-btn"
            onClick={() => void exportHtml()}
          >
            Export HTML bookmarks
          </button>
        </div>
      </section>

      <section class="etg-io__section">
        <h3 class="etg-io__title">Import</h3>
        <p class="etg-io__hint">
          Load a previously exported JSON file. Choose whether to merge into the
          current vault or replace it entirely.
        </p>
        <input
          type="file"
          accept="application/json,.json"
          class="etg-io__file"
          aria-label="Choose a JSON file to import"
          onChange={(e) => void onFile(e)}
        />

        {pending ? (
          <div class="etg-io__confirm">
            <p>
              Ready to import <strong>{pending.folders.length}</strong>{' '}
              folder(s) and <strong>{pending.tabs.length}</strong> tab(s).
            </p>
            <div class="etg-io__row">
              <label class="etg-check">
                <input
                  type="radio"
                  name="etg-import-mode"
                  checked={mode === 'merge'}
                  onChange={() => setMode('merge')}
                />
                Merge
              </label>
              <label class="etg-check">
                <input
                  type="radio"
                  name="etg-import-mode"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                />
                Replace everything
              </label>
            </div>
            <button
              type="button"
              class="etg-btn etg-btn--primary"
              disabled={busy}
              onClick={() => void confirmImport()}
            >
              Import
            </button>
          </div>
        ) : null}

        {error ? <p class="etg-error">{error}</p> : null}
      </section>
    </Modal>
  );
}
