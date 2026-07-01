# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project scaffold (Phase 0): TypeScript (strict) + Vite build with a
  first-party inline manifest plugin, Vitest + fake-indexeddb test harness,
  ESLint (flat) + Prettier, and `.editorconfig`.
- MV3 `manifest.json` generated from a typed single source of truth
  (`src/manifest.config.ts`) with the minimal permission allowlist
  (`tabs`, `tabGroups`, `storage`, `unlimitedStorage`, `favicon`) asserted at
  build time.
- `scripts/no-network-guard.mjs`: authoritative zero-network gate that scans
  both source and the built bundle and re-validates the emitted manifest.
- GitHub Actions CI (`.github/workflows/ci.yml`): install, typecheck, lint,
  format check, test, build, and the no-network guard.
- Source skeleton: pure `src/core/**`, `src/platform/**` edges,
  `src/background/service-worker.ts`, and the `src/dashboard/**` Preact shell —
  placeholder modules with the interfaces defined in `docs/PLAN.md`.
- Open-source project files: MIT `LICENSE` (placeholder), `README.md`,
  `CONTRIBUTING.md`, this changelog, and `.gitignore`.
- Pure core completion (Phase 3): `core/export.ts` (stable JSON `toJson`/
  `fromJson` with strict shape validation, plus an HTML-escaped Netscape
  bookmarks exporter) and `core/reopen.ts` (`planReopen`), each with co-located
  unit tests.
- Dashboard data layer (Phase 6): `dashboard/state/store.ts` — the single vault
  writer (pure core op → persist → reload → notify), unit-tested under
  fake-indexeddb.
- Full-page dashboard UI (Phases 6–7): two-pane Preact app wired to the core +
  runtime.
  - LEFT (Inbox): live tabs grouped by window, domain/url/title filter with a
    domain datalist, checkbox multi-select, "select all matching",
    select/deselect per window, and batch-move into a folder (optionally closing
    the tabs to free RAM). "Import open tabs" captures everything into the Inbox.
    Rendered rows are capped for responsiveness with 1,600+ open tabs while
    selection operates on the full filtered set.
  - RIGHT (Tree): recursive unlimited-nesting folder tree with native HTML5
    drag-and-drop (drag folders/tabs into a folder; drop a folder on the root
    zone to promote it), inline create/rename, ↑/↓ reorder, confirmed cascade
    delete, per-folder tab caps, vault-wide full-text search results, an
    include-subfolders toggle, and "reopen as a native tab group" via the
    `REOPEN_FOLDER` runtime message.
  - Dedupe finder, Export/Import dialog (JSON + HTML bookmarks; local Blob
    downloads, no network), first-run intro, empty states, a status line, and a
    letter/color favicon chip fallback for the local `_favicon/` endpoint.
  - Added a small shared `dashboard/components/Modal.tsx` primitive (not in the
    original file manifest) to keep the dialogs consistent.

[Unreleased]: https://example.com/easy-tab-groups/compare/HEAD
