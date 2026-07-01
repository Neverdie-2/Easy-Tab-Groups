# Easy Tab Groups — Product Design (Canonical Reference)

> Status: **AGREED**. This document is the single source of truth for *what*
> we are building and *why*. Implementers must not redesign it. Engineering
> details (stack, file layout, interfaces) live in [`PLAN.md`](./PLAN.md).

---

## 1. One-line pitch

A **privacy-first, local-only** tab organizer for Brave / Chromium (Manifest
V3) that rescues people drowning in hundreds or thousands of open tabs by
letting them **capture → file into an unlimited nested folder tree → close to
free RAM → reopen on demand as a native Brave tab group.**

## 2. Who it is for

Power users and traders who keep **many** tabs open and cannot afford to lose
the links, but also cannot afford the RAM. A concrete target user keeps **crypto
wallets in this browser**, so the extension's *inability to read page content*
is a headline feature, not a footnote.

## 3. The core loop

1. **CAPTURE** — one click imports every currently-open tab into an **Inbox**.
2. **FILE** — the user filters the Inbox by domain (e.g. all `opensea.io`),
   multi-selects (including *select-all-matching*), and moves the batch into a
   **nested folder tree of unlimited depth**
   (e.g. `Base chain` › `Blupets` › `Gold trait` › tabs).
3. **CLOSE** — saved tabs are closed to free RAM; the links live safely in the
   local vault.
4. **REOPEN ON DEMAND** — clicking a folder reopens its saved tabs and places
   them into a **native Brave tab group** named after the folder (with an
   *include-subfolders* option). The deep hierarchy lives in the extension UI;
   the reopened working set feels like normal native tab groups.

The deep nesting is the *librarian*; native tab groups are the *workbench*.

## 4. Primary surface — the full-page dashboard

Opens in its **own extension tab** (`chrome-extension://<id>/dashboard.html`).
Two panes:

- **LEFT — Live / Inbox tabs**
  - Shows live browser tabs and captured-but-unfiled tabs.
  - Grouped by **window**.
  - **Filterable by domain** (and by window).
  - Checkbox **multi-select** with **"select all matching"** the current filter.
  - **Batch-move** the selection into a chosen folder.
  - Live count of open tabs.

- **RIGHT — Nested folder tree**
  - **Drag-and-drop**: move folders and tabs.
  - Create / rename / reorder / delete folders.
  - **Unlimited nesting.**
  - Clicking a folder → reopen-as-tab-group action.

> **Side panel is a FUTURE phase.** Architect the core + UI so the same logic
> can later render in a `chrome.sidePanel` surface, but **do not build the side
> panel now.**

## 5. Data model (conceptual)

- A **tree of folders** with **unlimited nesting**; **saved tabs are leaves**.
- **Saved tab** = `{ id, url, title, favicon, savedAt }`.
- Persisted in **IndexedDB** (must hold thousands of entries and survive
  browser restarts) behind a clean async storage module.
- **Export is first-class**: export to **JSON** *and* to an **HTML-bookmarks**
  file, plus **import** of the JSON. Users must never be locked in.

## 6. Feature list

- Import all open tabs → Inbox (with live count).
- Filter by domain / window; **select-all-matching**; batch-move into a folder.
- **Dedupe finder**: detect exact-duplicate URLs and offer one-click cleanup.
- **Full-text search** across the vault (title / url / domain).
- **Open folder → native Brave tab group** (`chrome.tabGroups`), with an
  include-subfolders option.
- Rename / reorder / drag folders and tabs.
- **Export** to JSON + HTML bookmarks; **import** from JSON.
- Sensible **empty states** and a **first-run intro**.

## 7. Hard constraints — *these ARE the product; never violate*

### 7.1 Zero network at runtime
No `fetch` / `XMLHttpRequest` / `WebSocket` / `navigator.sendBeacon` / remote
imports / remote `<img>` anywhere in shipped runtime code. **Everything is
local.** A no-network guard enforces this, run locally on every push via a git
pre-push hook (see PLAN).

### 7.2 Favicons from the local cache only
Favicons must come from the browser's **local favicon cache** via the MV3
`_favicon/` mechanism:
- Declare the **`favicon`** permission.
- Build URLs like
  `chrome-extension://<id>/_favicon/?pageUrl=<encoded>&size=32`.
- **Never** render `<img src>` pointing at a remote favicon URL — that is a
  network request and breaks the zero-network guarantee.
- If a favicon is unavailable, **degrade to a letter/color chip** — still no
  network.

### 7.3 Minimal permissions ONLY
`["tabs", "tabGroups", "storage", "unlimitedStorage", "favicon"]`.
- **No** `host_permissions`, **no** `<all_urls>`.
- **No** `content_scripts`.
- **No** `cookies` / `history` / `webRequest`.
- **No** `externally_connectable`.
The extension must be **unable to read page contents** — this is the security
selling point (the user keeps crypto wallets in this browser).

### 7.4 XSS-safe rendering
Saved titles/URLs are untrusted. Render with `textContent` / safe DOM APIs.
**Never** `innerHTML` with untrusted strings. **No `eval`.**

## 8. Non-goals (explicitly out of scope for v1)

- No cloud sync, no accounts, no telemetry, no analytics, no auto-update pings.
- No reading or modifying page content.
- No side panel (planned next phase).
- No cross-browser store packaging beyond "Load unpacked" for v1.
- No fuzzy/AI search — deterministic substring/token search only.

## 9. Success criteria

- Capturing ~1,000 open tabs and filing them stays responsive.
- Reopening a folder reliably lands its tabs in one correctly-named native
  group.
- The no-network guard passes and would **fail** if any networking primitive
  were introduced.
- A security-minded auditor can read the manifest + source in minutes and
  confirm the extension cannot exfiltrate anything.

## 10. Roadmap (post-v1)

1. **Side panel** surface reusing the same core + UI modules.
2. Optional keyboard-driven quick-file palette.
3. Smarter dedupe (URL normalization options).
4. Bulk operations across folders (merge, flatten, move subtree).
