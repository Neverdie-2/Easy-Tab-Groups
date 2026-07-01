# Build Status — Easy Tab Groups

**Overall: GREEN.** Verification gate run on 2026-07-01 (Node v20.20.0).
The extension typechecks, lints, tests, and builds clean, the security
contract (zero-network + minimal permissions + local favicons) is verified
by an independent guard, and `dist/` is a loadable MV3 extension.

## Per-command results

| Command | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | **GREEN** | `tsc -p tsconfig.json --noEmit && tsc -p tsconfig.node.json --noEmit` — 0 errors |
| `npm run lint` | **GREEN** | `eslint .` — 0 problems |
| `npm run test` | **GREEN** | `vitest run` — 14 files, **151 tests passed**, 0 failed |
| `npm run build` | **GREEN** | `vite build` — 36 modules, emits `dist/` incl. manifest + SW + dashboard |
| `npm run guard:network` | **GREEN** | scans `src/` AND built `dist/` + re-validates manifest allowlist/CSP |

### Output tails

```
# typecheck — (no output = success)
> tsc -p tsconfig.json --noEmit && tsc -p tsconfig.node.json --noEmit

# lint — (no output = success)
> eslint .

# test
 Test Files  14 passed (14)
      Tests  151 passed (151)
   Duration  ~0.6s

# build
✓ 36 modules transformed.
../dist/manifest.json                   0.88 kB
../dist/service-worker.js               1.49 kB
../dist/dashboard.html                  0.41 kB
../dist/assets/dashboard-*.js          49.08 kB
../dist/assets/dashboard-*.css          9.29 kB
../dist/assets/storage-*.js             9.20 kB
✓ built in ~0.24s

# guard:network
no-network-guard: OK — no networking primitives found.
```

## Security contract — verified

**Permissions (dist/manifest.json) — EXACTLY the minimal set:**

```json
"permissions": ["tabs", "tabGroups", "storage", "unlimitedStorage", "favicon"]
```

- No `host_permissions` / `optional_host_permissions`.
- No `content_scripts`.
- No `externally_connectable`.
- No `<all_urls>`, cookies, history, or webRequest.
- CSP hardening present:
  `content_security_policy.extension_pages` =
  `script-src 'self'; object-src 'self'; connect-src 'none'; img-src 'self' data:; base-uri 'none'`.
  `connect-src 'none'` blocks all network egress at the platform level;
  `img-src 'self' data:` blocks any remote image (including remote favicons).

**Zero network — confirmed:**

- `npm run guard:network` scans runtime `src/` (excluding tests) and the built
  `dist/` bundle for `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
  `RTCPeerConnection`, `SharedWorker`, `navigator.sendBeacon`, `importScripts`,
  `navigator.serviceWorker`, remote ESM/dynamic imports, remote `src=`/`href=`,
  and any remote URL literal (W3C namespace URIs excepted). **0 findings.**
- The guard's scan + manifest-check logic is exported as pure functions and
  covered by `tests/no-network-guard.test.ts` (proves the gate fails on
  known-bad input — no silent-pass risk).
- Manual grep of `src/**/*.ts{,x}` (excluding tests) for the same primitives:
  **no matches.**

**Favicons — LOCAL `_favicon/` only:**

- `src/dashboard/favicon.ts` builds a relative `_favicon/?pageUrl=...&size=...`
  URL against the extension origin — no remote host, no network.
- `src/dashboard/components/Favicon.tsx` renders `<img src={faviconUrl(...)}>`
  (extension-local) and degrades to a deterministic letter/color chip on
  `onError` — still zero network. No `<img>` ever points at a remote URL.

## Loadable MV3 extension — confirmed

`dist/` contains a complete, loadable MV3 package:

- `dist/manifest.json` — MV3, minimal permissions, CSP (above).
- `dist/service-worker.js` — background service worker (`type: module`),
  registered via `background.service_worker`.
- `dist/dashboard.html` + `dist/assets/dashboard-*.js` + `dist/assets/dashboard-*.css`
  — the full-page two-pane dashboard.
- `dist/assets/storage-*.js` — shared core/storage chunk.
- `dist/icons/icon{16,32,48,128}.png` — action + extension icons.

### How to Load-Unpacked in Brave

1. Run `npm install` then `npm run build` (outputs to `dist/`).
2. Open `brave://extensions`.
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and select the `dist/` folder
   (`/Users/angelatanasov/Desktop/Easy-Tab-Groups/dist`).
5. Click the toolbar icon (or the extension's action) to open the full-page
   dashboard in its own tab.
   (Same steps work in any Chromium browser at `chrome://extensions`.)

## Feature checklist state

| Feature | State | Where |
| --- | --- | --- |
| Import all open tabs → Inbox (live count) | Done | SW `CAPTURE_TABS`, `InboxPane`, store |
| Filter by domain / window | Done | `InboxPane`, `SearchBar`, `core/url` |
| Select-all-matching + batch-move | Done | `InboxPane`, `MoveTargetPicker`, store |
| Nested folder tree, unlimited depth | Done | `core/tree`, `TreePane`, `FolderNode` |
| Create / rename / reorder / delete folders | Done | `core/tree`, `TreePane` |
| Drag-and-drop folders & tabs | Done | `TreePane`, `FolderNode`, `TabRow` |
| Open folder → native Brave tab group | Done | `core/reopen`, `platform/reopen-exec`, SW `REOPEN_FOLDER` |
| Include-subfolders option on reopen | Done | `core/reopen`, `platform/prefs` |
| Close saved tabs to free RAM | Done | SW `CLOSE_TABS`, `platform/chrome` |
| Dedupe finder + one-click cleanup | Done | `core/dedupe`, `DedupeDialog` |
| Full-text search (title / url / domain) | Done | `core/search`, `SearchBar` |
| Export JSON + HTML bookmarks / Import JSON | Done | `core/export`, `ExportImportDialog` |
| IndexedDB persistence (async storage module) | Done | `core/storage` |
| Local favicons via `_favicon/` + chip fallback | Done | `favicon.ts`, `Favicon.tsx` |
| Empty states + first-run intro | Done | `EmptyState`, `FirstRunIntro` |

## Known follow-ups

1. **Side-panel phase** — architected for reuse (pure core + Preact UI decoupled
   from `chrome.*`), but the side-panel surface is not built yet (roadmap item 1).
2. **Screenshots** — README has a screenshots placeholder section; add real
   two-pane dashboard captures before public launch.
3. **License confirmation** — currently MIT placeholder (`LICENSE` + README note);
   confirm/finalize the license before the open-source launch.

Minor/nice-to-have (not blockers): keyboard quick-file palette, smarter dedupe
URL-normalization options, and bulk cross-folder operations (merge/flatten/move
subtree) per the README roadmap.
