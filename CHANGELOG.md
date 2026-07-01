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
- Local verification via `npm run verify` (typecheck, lint, format check, test,
  build, and the no-network guard), wired to a git **pre-push hook** that runs
  it automatically before every push. No cloud CI — verification is local, free,
  and offline.
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
- Integration pass: `tests/integration.test.ts` — an end-to-end trace of the
  core loop (capture → file into a nested tree → persist → reopen-as-native-group
  via a second `VaultStorage` handle that mirrors the background service worker
  reading the same IndexedDB origin → export/import round-trip), wiring the real
  storage, store, tree, reopen planner, reopen executor and export modules.
- `docs/MANUAL-QA.md`: a step-by-step Load-Unpacked checklist for Brave that
  verifies every feature and the zero-network / privacy guarantees by hand.

### Changed

- README: install steps now name the exact `dist/` build output to load, link
  the manual-QA checklist, and the status note reflects the working build.
- Reopen-as-group now asks for confirmation before opening more than 15 tabs,
  reports how many tabs opened (and how many were skipped), and short-circuits
  when a folder has no saved tabs — protecting against the RAM spike of
  reopening a huge folder / the whole Inbox with subfolders.
- Reopening creates tabs in small batches (with an event-loop yield) and only
  attempts http(s) URLs, so a large reopen never hangs the service worker.
- Dedupe now pre-checks only same-folder duplicates by default; a copy filed in
  a different folder is shown but left unchecked (and the count is surfaced), so
  a careless "Remove" can't delete a deliberately-filed copy elsewhere.
- Toolbar duplicate badge is derived from a cheap exact-URL pass instead of a
  full options-aware dedupe scan on every vault mutation.
- Modal now implements a real focus trap (initial focus, Tab/Shift+Tab cycling,
  focus restore on close); the Export/Import and Dedupe dialogs no longer close
  on a stray backdrop click (they hold unsaved work).
- `package.json` gains `keywords` for discoverability.

### Security

- **Runtime CSP added.** The manifest now ships
  `content_security_policy.extension_pages` with `connect-src 'none'`, so the
  browser structurally blocks all network egress from extension pages at
  runtime — the zero-network guarantee no longer relies only on the build-time
  text scan. `assertManifestPolicy` and the standalone guard both REQUIRE this
  directive so it can never be silently dropped.
- No-network guard hardened: it now also flags WebRTC (`RTCPeerConnection` /
  `webkitRTCPeerConnection`), `SharedWorker`, and any hard-coded remote URL
  literal (allowlisting only the benign W3C namespace URIs), and it is now
  covered by a unit test (`tests/no-network-guard.test.ts`) that proves both the
  scanner and the manifest policy FAIL on known-bad input.
- Stored/imported URLs are scheme-checked (`http`/`https` only) before reaching
  `chrome.tabs.create`, so a poisoned imported vault can't route a
  `javascript:`/`data:` URL to the tab sink.

### Fixed

- Filing live tabs with "close after" now closes exactly the tabs that were
  saved. A still-loading tab that momentarily reports no URL is kept open (never
  closed-without-saving), closing a "never lose a link" gap.
- Malformed imports can no longer corrupt or white-screen the vault:
  `fromJson` rejects self-parented folders and parent cycles; `buildTree` is
  cycle-safe (a self-parent is never made its own child, and cyclic folders are
  surfaced at the top level instead of vanishing).
- Merge-import re-homes tabs whose `folderId` is missing to the Inbox (and
  folders with an unknown `parentId` to the top level), so imported links stay
  visible instead of silently disappearing from the tree view.
- `moveFolder` no longer displaces or renumbers the pinned system Inbox when a
  user folder is moved to the top of the root list.
- A single un-creatable URL (e.g. `chrome://`, `file://`, `javascript:`) no
  longer aborts a reopen and strands already-opened tabs; failures are skipped
  and counted, and the surviving tabs are still grouped + named.
- Drag-over no longer highlights an illegal folder drop (onto itself or a
  descendant) as valid; dropping onto a collapsed folder now expands it so the
  moved item is visible.
- Store mutations are serialized through an internal queue, so two rapid actions
  can no longer read stale state and assign colliding `order` values.
- `MoveTargetPicker` indentation is computed from the real ancestor chain, so a
  folder name containing `" / "` no longer inflates its displayed depth.
- Inbox domain/url/title filtering pre-parses each URL once per tab change
  instead of on every keystroke, removing typing lag with thousands of tabs.
- Focus-driven live-tab refresh is throttled (and dedupe-render capped) so
  reopening at scale / large duplicate sets no longer jank-freeze the dashboard.

### Removed

- Dead, unreferenced exports `reorderTab` (core/tree) and `orderBetween`
  (core/ids), which shipped nothing but inflated the reported core coverage.

[Unreleased]: https://github.com/Neverdie-2/Easy-Tab-Groups/commits/main
