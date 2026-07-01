/**
 * Top toolbar: vault-wide actions (find duplicates, export/import, refresh) plus
 * the zero-network trust badge and live counts. Per-pane actions (import open
 * tabs, new folder, search) live in their panes.
 */
export interface ToolbarProps {
  savedCount: number;
  folderCount: number;
  duplicateCount: number;
  busy: boolean;
  onOpenDedupe: () => void;
  onOpenExportImport: () => void;
  onRefresh: () => void;
}

export function Toolbar({
  savedCount,
  folderCount,
  duplicateCount,
  busy,
  onOpenDedupe,
  onOpenExportImport,
  onRefresh,
}: ToolbarProps) {
  return (
    <div class="etg-toolbar">
      <span
        class="etg-badge"
        title="No network permissions — everything is local"
      >
        🔒 Local-only
      </span>
      <span class="etg-toolbar__stats">
        {savedCount} saved · {folderCount} folder{folderCount === 1 ? '' : 's'}
      </span>
      <span class="etg-toolbar__spacer" />
      {busy ? <span class="etg-toolbar__busy">Working…</span> : null}
      <button
        type="button"
        class="etg-btn"
        onClick={onRefresh}
        disabled={busy}
        title="Re-read the open tabs"
      >
        Refresh
      </button>
      <button
        type="button"
        class="etg-btn"
        onClick={onOpenDedupe}
        disabled={busy}
      >
        Find duplicates{duplicateCount > 0 ? ` (${duplicateCount})` : ''}
      </button>
      <button
        type="button"
        class="etg-btn"
        onClick={onOpenExportImport}
        disabled={busy}
      >
        Export / Import
      </button>
    </div>
  );
}
