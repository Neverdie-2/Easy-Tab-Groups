# Easy Tab Groups

**A privacy-first, local-only tab organizer for Brave / Chromium (Manifest V3).**

Rescue yourself from hundreds or thousands of open tabs: **capture → file into an
unlimited nested folder tree → close to free RAM → reopen on demand as a native
Brave tab group.** The deep hierarchy is your _librarian_; native tab groups are
your _workbench_.

> Status: working MV3 build — the full-page two-pane dashboard, background
> service worker, and IndexedDB vault are wired end-to-end. See
> [`docs/DESIGN.md`](docs/DESIGN.md) for the product spec,
> [`docs/PLAN.md`](docs/PLAN.md) for the engineering build contract, and
> [`docs/MANUAL-QA.md`](docs/MANUAL-QA.md) for the hands-on verification
> checklist.

---

## Why it exists

Power users and traders keep **many** tabs open and cannot afford to lose the
links — but also cannot afford the RAM. Easy Tab Groups files them into a deep,
searchable local vault and hands you back a clean, native working set on demand.

## The privacy / zero-network guarantee

This is the whole point of the project, not a footnote:

- **Zero network at runtime.** No `fetch`, `XMLHttpRequest`, `WebSocket`,
  `navigator.sendBeacon`, remote imports, or remote `<img>` anywhere in the
  shipped runtime. Everything is local. A
  [no-network guard](scripts/no-network-guard.mjs) enforces this — it scans both
  the source **and** the built bundle and fails on any networking primitive, and
  it runs automatically before every push via a local git pre-push hook
  (`npm run verify`). No cloud CI, by design.
- **Minimal permissions only:**
  `["tabs", "tabGroups", "storage", "unlimitedStorage", "favicon"]`.
  **No** `host_permissions`, **no** `<all_urls>`, **no** `content_scripts`,
  **no** cookies / history / webRequest, **no** `externally_connectable`.
  The extension is **structurally unable to read your page contents** — which
  matters if you keep crypto wallets in this browser.
- **Favicons come from the browser's local cache only**, via the MV3
  `_favicon/` endpoint — never a remote image request. If a favicon is
  unavailable it degrades to a letter/color chip. Still no network.
- **XSS-safe rendering.** Saved titles and URLs are treated as untrusted data
  (`textContent` / safe DOM APIs only); no `innerHTML` with untrusted strings,
  no `eval`.

A security-minded auditor can read the manifest and source in minutes and
confirm the extension cannot exfiltrate anything.

## Features

- **Capture** all open tabs into an Inbox (with a live count).
- **Filter** by domain / window, **select-all-matching**, and **batch-move**
  into any folder.
- **Unlimited nested folders** with drag-and-drop create / rename / reorder /
  delete.
- **Reopen a folder → native Brave tab group** named after the folder, with an
  include-subfolders option.
- **Dedupe finder** for exact-duplicate URLs, with one-click cleanup.
- **Full-text search** across the vault (title / url / domain).
- **Export** to JSON **and** HTML bookmarks; **import** from JSON. You are never
  locked in.
- Sensible **empty states** and a **first-run intro**.

## Install (Load unpacked)

> Not yet published to a store. Run it locally:

1. `npm install`
2. `npm run build` — outputs the loadable extension to **`dist/`** (emits
   `dist/manifest.json`, `dist/service-worker.js`, `dist/dashboard.html`,
   hashed `dist/assets/*`, and `dist/icons/*`). `dist/` is git-ignored and
   regenerated on every build.
3. Open `brave://extensions` (or `chrome://extensions`).
4. Enable **Developer mode**.
5. Click **Load unpacked** and select the **`dist/`** folder (the one that
   contains `manifest.json`) — not the repository root.
6. Click the toolbar icon to open the full-page dashboard in its own tab.

For a full hands-on verification of every feature and the zero-network
guarantee, follow [`docs/MANUAL-QA.md`](docs/MANUAL-QA.md).

## Screenshots

_Placeholder — screenshots of the two-pane dashboard will be added here._

<!-- ![Dashboard](docs/screenshots/dashboard.png) -->

## Development

```bash
npm install          # install dependencies
npm run typecheck    # strict TypeScript, no emit
npm run lint         # ESLint (flat config)
npm run format:check # Prettier
npm run test         # Vitest (+ fake-indexeddb)
npm run build        # Vite build -> dist/ (emits + validates manifest.json)
npm run guard:network # scan src AND dist for any networking primitive
```

Architecture in one line: **pure core, dirty edges.** All logic (tree, storage,
dedupe, search, reopen planning, export) lives in `src/core/**` and imports no
`chrome.*` and no DOM, which is what makes it auditable and unit-testable.
See [`docs/PLAN.md`](docs/PLAN.md) for the full module map and interfaces.

## Roadmap

1. **Side panel** surface reusing the same core + UI modules.
2. Keyboard-driven quick-file palette.
3. Smarter dedupe (URL normalization options).
4. Bulk operations across folders (merge, flatten, move subtree).

## License

[MIT](LICENSE) — placeholder; this can be changed before a public launch.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Changes must keep the zero-network guard
green and must not add permissions beyond the allowlist.
