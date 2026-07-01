# Easy Tab Groups — Engineering Plan (Authoritative Build Spec)

> This is the **build contract**. Implementer agents follow it exactly. Product
> intent lives in [`DESIGN.md`](./DESIGN.md); the *hard constraints* there are
> non-negotiable. Where this document gives a signature, implement that
> signature. Where it gives a filename, create that file. Deviations require an
> explicit note in the commit and a `CHANGELOG.md` entry.

---

## 0. Guiding principles

1. **Pure core, dirty edges.** All logic (tree, storage schema, dedupe, search,
   reopen planning, export) lives in `src/core/**` and imports **no `chrome.*`
   and no DOM**. Everything that touches `chrome.*` lives in `src/platform/**`
   and `src/background/**`; everything that touches the DOM lives in
   `src/dashboard/**`. This is what makes the product auditable and unit-testable.
2. **Single writer to IndexedDB** = the dashboard page. The service worker never
   writes IndexedDB (avoids MV3 ephemeral-SW write races). The SW only reads (for
   reopen planning if ever needed) and orchestrates `chrome.tabs`/`chrome.tabGroups`.
3. **Zero network, provably.** No networking primitive appears in runtime source
   *or* in the built `dist/`. CI fails otherwise (§7).
4. **Favicons are local-only** via the `_favicon/` endpoint, or a letter chip.
5. **Untrusted strings are data, never markup.** `textContent` only; no `innerHTML`
   with tab/folder data; no `eval`; no `new Function`.

---

## 1. Stack & exact versions

| Concern | Choice | Version (pin in `package.json`) |
|---|---|---|
| Language | TypeScript (strict) | `^5.7.2` |
| Build tool | **Vite** (multi-entry) + a first-party inline manifest plugin | `vite@^6.0.5` |
| UI runtime lib | **Preact** (JSX via esbuild automatic runtime, no Babel) | `preact@^10.25.3` |
| Test runner | **Vitest** | `^3.0.5` |
| IndexedDB test shim | **fake-indexeddb** | `^6.0.0` |
| Lint | **ESLint** (flat config) + **typescript-eslint** | `eslint@^9.17.0`, `typescript-eslint@^8.19.0` |
| Format | **Prettier** | `^3.4.2` |
| Types | `@types/chrome`, `@types/node` | `@types/chrome@^0.0.297`, `@types/node@^22.10.5` |
| Node engine | `>=20` (CI on Node 20) | — |

**Runtime third-party dependencies: exactly one — `preact`.** Everything else is
a dev dependency. There is **no IndexedDB wrapper library** and **no drag-and-drop
library**: the storage adapter hand-rolls a ~60-line promise wrapper over raw
IndexedDB, and drag-and-drop uses the native HTML5 DnD API. This maximizes the
auditability story (fewer runtime deps = smaller attack/trust surface, directly
serving the "user keeps crypto wallets here" threat model).

### 1.1 Why Vite + a first-party manifest plugin (not @crxjs, not raw esbuild)

- **Not `@crxjs/vite-plugin`:** it is the ergonomic option, but its value is
  mostly content-script HMR and manifest-entry rewriting — we have **no content
  scripts** and only **one** stable-named entry (the service worker). Its
  maintenance cadence has been uneven, and adding a heavyweight build dep that
  rewrites our manifest works against the "auditable, minimal, we control the
  output" posture. We reject taking that dependency.
- **Not raw esbuild:** esbuild alone doesn't give first-class HTML entry handling,
  CSS pipeline, or a dev server ergonomics we want for the dashboard page.
- **Vite** gives robust HTML/CSS/TS bundling and a stable, well-maintained core.
  We add a **~40-line first-party inline plugin** (`makeManifest`, in
  `vite.config.ts`, sourced from `src/manifest.config.ts`) that emits
  `dist/manifest.json` and **asserts the permission allowlist at build time**
  (build fails if a forbidden permission or `host_permissions` ever appears).
  The service worker gets a **stable output filename** via `output.entryFileNames`.
  Net: robust tooling, minimal third-party trust, and the manifest is a typed,
  test-guarded artifact we own.

### 1.2 JSX without Babel

Configure esbuild in Vite: `esbuild: { jsx: 'automatic', jsxImportSource: 'preact' }`
and `tsconfig` `"jsx": "react-jsx", "jsxImportSource": "preact"`. No
`@preact/preset-vite`, no Babel. State via `useState`/`useReducer` + a tiny
first-party pub/sub store — **no `@preact/signals`** (keeps runtime deps at one).

---

## 2. File / directory MANIFEST

Every file to be created, grouped by module. `(pure)` = no `chrome.*`, no DOM.

### 2.1 Repo root / tooling
```
Easy-Tab-Groups/
├─ package.json
├─ tsconfig.json                  # app config (strict, preact jsx)
├─ tsconfig.node.json             # config/scripts typecheck (node env)
├─ vite.config.ts                 # build + inline makeManifest plugin + SW stable name
├─ vitest.config.ts               # test env=node, setupFiles, coverage
├─ eslint.config.js               # flat config, ts + preact rules, no-restricted-syntax net guards
├─ .prettierrc.json
├─ .prettierignore
├─ .editorconfig
├─ .gitignore                     # node_modules, dist, coverage, *.local
├─ LICENSE                        # MIT (placeholder; README notes it can change)
├─ README.md
├─ CONTRIBUTING.md
├─ CHANGELOG.md                   # Keep a Changelog format
├─ .github/workflows/ci.yml
├─ docs/DESIGN.md                 # (exists)
├─ docs/PLAN.md                   # (this file)
├─ scripts/no-network-guard.mjs   # §7.2 network guard (node, cross-platform)
└─ public/icons/{icon16,icon32,icon48,icon128}.png  # placeholder icons
```

### 2.2 Manifest source
```
src/manifest.config.ts            # typed chrome.runtime.ManifestV3 object (single source of truth)
```

### 2.3 Core (pure, unit-tested) — `src/core/`
```
src/core/types.ts                 # Folder, SavedTab, VaultSnapshot, ids, constants
src/core/ids.ts                   # newId(), orderBetween()/nextOrder() helpers
src/core/url.ts                   # domainOf(), safe URL parsing (never throws)
src/core/tree.ts                  # folder-tree model (build/create/rename/move/delete/collect)
src/core/storage.ts               # VaultStorage interface + IndexedDB implementation
src/core/dedupe.ts                # exact/normalized duplicate detection
src/core/search.ts                # full-text search over title/url/domain
src/core/reopen.ts                # planReopen(): pure plan for reopen-as-group
src/core/export.ts                # toJson/fromJson + toBookmarksHtml (Netscape format)
```
Co-located tests: `src/core/{tree,storage,dedupe,search,reopen,export,url}.test.ts`.

### 2.4 Platform (chrome.* edges, thin) — `src/platform/`
```
src/platform/chrome.ts            # ChromeAdapter interface + real chrome.* impl (promisified)
src/platform/messages.ts          # Message/Response union + typed sendMessage/onMessage
src/platform/reopen-exec.ts       # executeReopen(plan, adapter): creates tabs + native group
src/platform/prefs.ts             # chrome.storage.local key/value wrapper (Prefs)
```

### 2.5 Background / runtime — `src/background/`
```
src/background/service-worker.ts  # action.onClicked -> open/focus dashboard; message router
```

### 2.6 Dashboard UI (DOM, Preact) — `src/dashboard/`
```
src/dashboard.html                # HTML entry: <div id="root"> + module script -> main.tsx
src/dashboard/main.tsx            # mount App
src/dashboard/App.tsx             # two-pane layout, load storage, own top-level state
src/dashboard/state/store.ts      # tiny pub/sub store mirroring TreeState <-> storage
src/dashboard/favicon.ts          # faviconUrl(pageUrl,size) -> local "_favicon/?..." URL
src/dashboard/styles.css
src/dashboard/panes/InboxPane.tsx # LEFT: windows, domain filter, multiselect, batch-move
src/dashboard/panes/TreePane.tsx  # RIGHT: recursive tree, DnD, folder CRUD
src/dashboard/components/Toolbar.tsx
src/dashboard/components/SearchBar.tsx
src/dashboard/components/TabRow.tsx
src/dashboard/components/Favicon.tsx        # _favicon URL or letter/color chip fallback
src/dashboard/components/FolderNode.tsx     # one tree node (recursion happens here)
src/dashboard/components/MoveTargetPicker.tsx
src/dashboard/components/DedupeDialog.tsx
src/dashboard/components/ExportImportDialog.tsx
src/dashboard/components/EmptyState.tsx
src/dashboard/components/FirstRunIntro.tsx
```

### 2.7 Test support
```
tests/setup.ts                    # import 'fake-indexeddb/auto'; global test helpers
```

---

## 3. Module boundaries & PUBLIC INTERFACES

Signatures below are the contract. Types marked here live in `src/core/types.ts`
unless noted. IDs are strings (`crypto.randomUUID()`), independent of live
`chrome.tabs` numeric ids.

### 3.1 Core types — `src/core/types.ts`
```ts
export type FolderId = string;
export type TabId = string;

/** Reserved root folder that holds freshly captured, unfiled tabs. */
export const INBOX_ID = 'inbox' as const;

export interface Folder {
  id: FolderId;
  name: string;
  parentId: FolderId | null;   // null = top level
  order: number;               // fractional/step order within parent
  createdAt: number;           // epoch ms
  system?: boolean;            // true for INBOX_ID; cannot be renamed/deleted/moved
}

export interface SavedTab {
  id: TabId;
  url: string;
  title: string;
  /**
   * OPTIONAL, EXPORT-COMPAT ONLY. May be present in imported data. It is NEVER
   * rendered as a remote <img src> and NEVER fetched. The UI always derives the
   * icon from `url` via the local `_favicon/` endpoint (see dashboard/favicon.ts).
   */
  favicon?: string;
  savedAt: number;             // epoch ms
  folderId: FolderId;          // parent folder (INBOX_ID for freshly captured)
  order: number;               // order within folder
}

export interface VaultSnapshot {
  version: 1;
  exportedAt: number;
  folders: Folder[];
  tabs: SavedTab[];
}
```

### 3.2 IDs & ordering — `src/core/ids.ts` (pure)
```ts
export function newId(): string;                       // crypto.randomUUID()
export function nextOrder(siblings: { order: number }[]): number;      // max+STEP
export function orderBetween(before?: number, after?: number): number; // fractional insert
```

### 3.3 URL helper — `src/core/url.ts` (pure)
```ts
/** Registrable-ish host for grouping/filter/search. Never throws.
 *  chrome://newtab -> 'chrome', about:blank -> 'about', file:// -> 'file',
 *  invalid -> '' */
export function domainOf(url: string): string;
export function safeParseUrl(url: string): URL | null;
```

### 3.4 Folder-tree model — `src/core/tree.ts` (pure)
Operates on plain arrays loaded from storage; returns **new objects / id lists**
(never mutates inputs, never persists). The caller persists via `VaultStorage`.
```ts
export interface TreeNode { folder: Folder; children: TreeNode[]; tabs: SavedTab[]; }

/** Build the nested view, children & tabs sorted by `order`. Orphans (missing
 *  parent) are attached to top level defensively. */
export function buildTree(folders: Folder[], tabs: SavedTab[]): TreeNode[];

export function createFolder(name: string, parentId: FolderId | null, siblings: Folder[]): Folder;
export function renameFolder(folder: Folder, name: string): Folder;      // guards: no rename of system

/** Returns folders whose parentId/order changed. Throws if moving a folder into
 *  its own subtree (cycle) or moving a system folder. */
export function moveFolder(folderId: FolderId, newParentId: FolderId | null,
                           indexInParent: number, folders: Folder[]): Folder[];

/** All descendant folder ids (excludes self). Used for include-subfolders + cycle guard. */
export function descendantFolderIds(folderId: FolderId, folders: Folder[]): FolderId[];
export function isDescendant(candidateId: FolderId, ancestorId: FolderId, folders: Folder[]): boolean;

/** Cascade delete plan: this folder + all descendants + their tabs. System folder rejected. */
export function deleteFolderCascade(folderId: FolderId, folders: Folder[], tabs: SavedTab[])
  : { folderIds: FolderId[]; tabIds: TabId[] };

/** Reassign folderId + append order for a batch move (used by select-all-matching). */
export function moveTabs(tabIds: TabId[], targetFolderId: FolderId, tabs: SavedTab[]): SavedTab[];

/** Reorder a tab within/into a folder at index. Returns changed tabs. */
export function reorderTab(tabId: TabId, targetFolderId: FolderId, index: number, tabs: SavedTab[]): SavedTab[];

/** Tabs to reopen for a folder; depth-first when includeSubfolders. */
export function collectTabs(folderId: FolderId, includeSubfolders: boolean,
                            folders: Folder[], tabs: SavedTab[]): SavedTab[];

export function folderPath(folderId: FolderId, folders: Folder[]): string; // "A / B / C"
```

### 3.5 Storage adapter — `src/core/storage.ts` (only IndexedDB module)
DB name `easy-tab-groups`, version `1`. Object stores: `folders` (keyPath `id`),
`tabs` (keyPath `id`, indexes: `by_folder` on `folderId`, `by_url` on `url`).
On init, seed the system `INBOX_ID` folder if absent. Batch writes use one
transaction. Async only; injectable `IDBFactory` for tests (defaults to global).
```ts
export interface VaultStorage {
  init(): Promise<void>;

  getAllFolders(): Promise<Folder[]>;
  getAllTabs(): Promise<SavedTab[]>;
  getTabsByFolder(folderId: FolderId): Promise<SavedTab[]>;   // uses by_folder
  findTabsByUrl(url: string): Promise<SavedTab[]>;            // uses by_url

  putFolder(folder: Folder): Promise<void>;
  putFolders(folders: Folder[]): Promise<void>;              // one txn
  deleteFolders(ids: FolderId[]): Promise<void>;

  putTab(tab: SavedTab): Promise<void>;
  putTabs(tabs: SavedTab[]): Promise<void>;                  // one txn (thousands ok)
  deleteTabs(ids: TabId[]): Promise<void>;

  exportSnapshot(): Promise<VaultSnapshot>;
  importSnapshot(snap: VaultSnapshot, mode: 'merge' | 'replace'): Promise<void>;
  clearAll(): Promise<void>;                                 // preserves seeded Inbox
}

export function createVaultStorage(opts?: { dbName?: string; factory?: IDBFactory }): VaultStorage;
```

### 3.6 Dedupe — `src/core/dedupe.ts` (pure)
```ts
export interface DedupeOptions {
  ignoreHash?: boolean;          // default false (design = EXACT dupes)
  ignoreTrailingSlash?: boolean; // default false
  ignoreQuery?: boolean;         // default false
}
export interface DuplicateGroup {
  key: string;                   // normalized url the group shares
  tabs: SavedTab[];              // >= 2, ordered by savedAt asc
  keep: TabId;                   // earliest savedAt
  remove: TabId[];               // the rest
}
export function normalizeUrl(url: string, opts?: DedupeOptions): string;   // never throws
export function findDuplicates(tabs: SavedTab[], opts?: DedupeOptions): DuplicateGroup[];
```

### 3.7 Search — `src/core/search.ts` (pure)
```ts
export interface SearchResult {
  tab: SavedTab;
  score: number;                          // higher = better
  matched: Array<'title' | 'url' | 'domain'>;
}
export function tokenize(s: string): string[];
/** Case-insensitive, AND over tokens. Empty/blank query -> []. Ranks
 *  domain/title matches above url matches; exact token above substring. */
export function search(query: string, tabs: SavedTab[]): SearchResult[];
```

### 3.8 Reopen planner — `src/core/reopen.ts` (pure)
```ts
export interface ReopenPlan { groupName: string; urls: string[]; }
/** groupName = folder's own name; urls in tree order (depth-first if subfolders). */
export function planReopen(folderId: FolderId, includeSubfolders: boolean,
                           folders: Folder[], tabs: SavedTab[]): ReopenPlan;
```

### 3.9 Export/import serializers — `src/core/export.ts` (pure)
```ts
export function toJson(snap: VaultSnapshot): string;         // stable, pretty
export function fromJson(text: string): VaultSnapshot;       // validates shape; throws on bad
export function toBookmarksHtml(snap: VaultSnapshot): string;// Netscape bookmark file, HTML-escaped
```

### 3.10 Chrome adapter — `src/platform/chrome.ts` (edge)
Promisified, mockable wrapper. Pure core never imports this.
```ts
export interface LiveTab { id: number; windowId: number; url: string; title: string; }
export interface ChromeAdapter {
  queryAllTabs(): Promise<LiveTab[]>;                        // chrome.tabs.query({})
  createTab(url: string, active?: boolean): Promise<number>;// returns new tab id
  closeTabs(tabIds: number[]): Promise<void>;               // chrome.tabs.remove
  groupTabs(tabIds: number[]): Promise<number>;             // chrome.tabs.group -> groupId
  nameGroup(groupId: number, title: string, color?: string): Promise<void>; // chrome.tabGroups.update
  openDashboard(): Promise<void>;                           // focus existing or create dashboard.html
  currentWindowId(): Promise<number>;
}
export function createChromeAdapter(): ChromeAdapter;
```

### 3.11 Messaging protocol — `src/platform/messages.ts` (shared, typed)
Enables the SW (and a future side panel) to request privileged actions. In v1 the
dashboard performs capture/reopen/close itself via the adapter; the SW handles
`OPEN_DASHBOARD` (from `action.onClicked`) and re-broadcasts `CAPTURE_TABS` so any
surface can trigger a capture. Every message has a discriminant `type`.
```ts
export type Message =
  | { type: 'OPEN_DASHBOARD' }
  | { type: 'CAPTURE_TABS' }                                        // -> CaptureResult
  | { type: 'REOPEN_FOLDER'; folderId: FolderId; includeSubfolders: boolean } // -> ReopenResult
  | { type: 'CLOSE_TABS'; tabIds: number[] };                       // -> { closed: number }

export interface CaptureResult { tabs: LiveTab[]; }
export interface ReopenResult { groupId: number; tabIds: number[]; }

export type Response =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export function sendMessage<T extends Message>(msg: T): Promise<Response>;
export function onMessage(handler: (msg: Message) => Promise<Response>): void;
```

### 3.12 Reopen executor — `src/platform/reopen-exec.ts` (edge)
```ts
export async function executeReopen(plan: ReopenPlan, adapter: ChromeAdapter): Promise<ReopenResult>;
// creates tabs (adapter.createTab per url), groups them, names the group = plan.groupName.
```

### 3.13 Prefs — `src/platform/prefs.ts` (edge)
Tiny key/value over `chrome.storage.local` for non-vault settings.
```ts
export interface Prefs {
  firstRunSeen: boolean;
  dedupe: import('../core/dedupe').DedupeOptions;
  lastMoveTargetFolderId: string | null;
  includeSubfoldersDefault: boolean;
}
export function getPrefs(): Promise<Prefs>;
export function setPrefs(patch: Partial<Prefs>): Promise<void>;
```

### 3.14 Service worker — `src/background/service-worker.ts` (edge)
```
- chrome.runtime.onInstalled: (optional) set firstRunSeen=false default.
- chrome.action.onClicked: adapter.openDashboard().
- onMessage router: OPEN_DASHBOARD -> openDashboard; CAPTURE_TABS -> queryAllTabs;
  REOPEN_FOLDER -> (reads snapshot via VaultStorage READ-ONLY, planReopen, executeReopen);
  CLOSE_TABS -> closeTabs. All wrapped -> Response {ok}. NEVER writes IndexedDB.
- Declared as ESM service worker ("type":"module").
```

### 3.15 Dashboard store — `src/dashboard/state/store.ts` (DOM-adjacent, no chrome logic)
```ts
export interface VaultState { folders: Folder[]; tabs: SavedTab[]; }
export interface Store {
  getState(): VaultState;
  subscribe(fn: () => void): () => void;                 // returns unsubscribe
  load(): Promise<void>;                                  // from VaultStorage
  // mutations: apply pure core op -> persist via storage -> notify
  captureLiveTabs(live: LiveTab[]): Promise<void>;        // -> Inbox SavedTabs
  moveTabsInto(tabIds: TabId[], folderId: FolderId): Promise<void>;
  createFolder(name: string, parentId: FolderId | null): Promise<FolderId>;
  renameFolder(id: FolderId, name: string): Promise<void>;
  moveFolder(id: FolderId, parentId: FolderId | null, index: number): Promise<void>;
  deleteFolder(id: FolderId): Promise<void>;
  removeTabs(ids: TabId[]): Promise<void>;                // used by dedupe cleanup
  importSnapshot(snap: VaultSnapshot, mode: 'merge'|'replace'): Promise<void>;
}
export function createStore(storage: VaultStorage): Store;
```

### 3.16 Favicon helper — `src/dashboard/favicon.ts` (DOM)
```ts
/** Builds the extension-local favicon URL. Relative form resolves against the
 *  extension origin, so no id lookup needed and NO network is used. */
export function faviconUrl(pageUrl: string, size = 32): string; // `_favicon/?pageUrl=...&size=..`
```
`Favicon.tsx` sets `<img src={faviconUrl(url)}>` (extension-local URL, allowed);
on `onerror` it swaps to a letter/color chip (derived from `domainOf(url)`).

---

## 4. `manifest.json` — exact permissions & rationale

`src/manifest.config.ts` produces:
```jsonc
{
  "manifest_version": 3,
  "name": "Easy Tab Groups",
  "version": "0.1.0",
  "description": "Local-only tab rescue + nested organizer. Zero network. Can't read your pages.",
  "action": { "default_title": "Easy Tab Groups" },        // no popup; opens full-page dashboard
  "background": { "service_worker": "service-worker.js", "type": "module" },
  "icons": { "16": "...","32": "...","48": "...","128": "..." },
  "permissions": ["tabs", "tabGroups", "storage", "unlimitedStorage", "favicon"]
  // NO host_permissions, NO content_scripts, NO web_accessible_resources needed,
  // NO externally_connectable, NO optional_permissions.
}
```

| Permission | Why it is needed | Why it is safe |
|---|---|---|
| `tabs` | Read open tabs' `url`/`title`/`windowId` for capture + the left pane; create tabs on reopen; close tabs after saving. Without it, tab `url`/`title` are hidden. | Grants tab **metadata**, not page **content**. No host permission = cannot inject scripts or read DOM. |
| `tabGroups` | Create and **name** the native Brave/Chromium tab group on reopen (`chrome.tabs.group` + `chrome.tabGroups.update`). | Only manipulates group membership/labels of tabs we created. |
| `storage` | `chrome.storage.local` for tiny prefs (first-run flag, dedupe options, defaults). | Local key/value only. |
| `unlimitedStorage` | Let IndexedDB hold thousands of saved tabs beyond the default quota. | Local disk only; no network implication. |
| `favicon` | Enable the MV3 `_favicon/` endpoint so icons come from the browser's **local** cache. | The whole point: favicons **without** any network request. |

**Explicitly excluded (and CI-guarded):** `host_permissions`, `<all_urls>`,
`content_scripts`, `cookies`, `history`, `webRequest`/`declarativeNetRequest`,
`externally_connectable`, `scripting`. Their absence is the security guarantee:
the extension is structurally **unable to read page contents**. The `makeManifest`
build plugin asserts the `permissions` array equals the allowlist and that none of
these forbidden keys exist — the build fails if anyone adds one.

---

## 5. Test plan (Vitest + fake-indexeddb)

`tests/setup.ts` imports `fake-indexeddb/auto`. Coverage gate: **100% of
`src/core/**` pure modules** (branches + lines); storage adapter ≥ 90%. Pure
modules take no mocks (deterministic); storage tests run against fake-indexeddb.

**`url.test.ts`** — `domainOf`: https host, subdomain, port, IPv4, `chrome://`,
`about:blank`, `file://`, empty string, garbage → returns `''` and never throws.

**`tree.test.ts`**
- `buildTree`: correct nesting; children and tabs sorted by `order`; orphaned
  folder (missing parent) defensively surfaces at top level.
- `createFolder`: `order` = after last sibling; `parentId` set; not `system`.
- `renameFolder`: updates name; **throws** on system (Inbox).
- `moveFolder`: updates `parentId` + `order`; reindexes siblings; **throws** on
  cycle (into own descendant) and on system folder.
- `descendantFolderIds` / `isDescendant`: deep (≥ 5 levels) correctness.
- `deleteFolderCascade`: returns self + all descendant folder ids + all their tab
  ids; **throws** on system folder.
- `moveTabs`: reassigns `folderId`, appends `order`; batch of many (select-all).
- `collectTabs`: `includeSubfolders=false` → direct only; `true` → depth-first
  order across the subtree.
- Unlimited nesting: build & operate on a 50-deep chain without error.
- **Immutability**: inputs are not mutated.

**`storage.test.ts`**
- `init`: creates stores + `by_folder`/`by_url` indexes; seeds Inbox; idempotent
  on second `init`.
- Folder/tab `put`/`get` round-trip; `getTabsByFolder` uses the index; `findTabsByUrl`
  returns all matches.
- `putTabs` batch of 2,000 in one txn; read-back count correct.
- `deleteFolders`/`deleteTabs`.
- `exportSnapshot` → `importSnapshot('replace')` round-trips identically;
  `'merge'` preserves existing and adds new; id collisions handled deterministically.
- `clearAll` empties vault but re-seeds Inbox.
- Version guard: opening a DB at a higher version than the code expects fails
  loudly (no silent data loss).

**`dedupe.test.ts`**
- Exact dupes grouped; `keep` = earliest `savedAt`; `remove` = the rest.
- Distinct urls never grouped (no false positives).
- `normalizeUrl` options: `ignoreHash`, `ignoreTrailingSlash`, `ignoreQuery`
  each change grouping as specified; default = exact.
- Percent-encoding / unicode stability; invalid url handled (never throws).
- 5,000-tab set completes quickly (smoke perf).

**`search.test.ts`**
- Title / url / domain matches populate `matched[]` correctly.
- Case-insensitive; multi-token AND; blank query → `[]`.
- Ranking: domain/title above url; exact token above substring.
- Robust to `chrome://`, `file://`, malformed urls (no throw).

**`reopen.test.ts`**
- Single folder → urls in `order`; `groupName` = that folder's name.
- `includeSubfolders=true` → depth-first collection; group name stays the top
  folder's name.
- `includeSubfolders=false` → only direct tabs.
- Empty folder → `{ groupName, urls: [] }`.

**`export.test.ts`**
- `toJson`/`fromJson` round-trip; `fromJson` rejects wrong `version`/shape.
- `toBookmarksHtml` emits valid Netscape structure and **HTML-escapes** titles/urls
  (XSS/injection guard on export).

> UI components are covered by manual "Load unpacked" QA (§8); pure logic they
> depend on is already unit-tested above. (Component tests are a post-v1 add.)

---

## 6. CI plan — `.github/workflows/ci.yml`

Trigger on `push` and `pull_request`. Single job on `ubuntu-latest`, Node 20:
```
1. actions/checkout
2. actions/setup-node (node-version 20, cache: npm)
3. npm ci
4. npm run typecheck        # tsc -p tsconfig.json --noEmit  (and tsconfig.node.json)
5. npm run lint             # eslint .
6. npm run format:check     # prettier --check .
7. npm run test             # vitest run --coverage
8. npm run build            # vite build -> dist/  (emits + validates manifest.json)
9. npm run guard:network    # scripts/no-network-guard.mjs  (scans src AND dist)
```
`package.json` scripts define each. Step 8 before 9 so the guard also scans built
output (catches a dependency that introduces networking).

### 6.1 No-network guard — `scripts/no-network-guard.mjs`

A dependency-free Node script (cross-platform; behaves like a strict grep). It
scans **runtime source** (`src/**` excluding `*.test.ts`, `tests/**`, `scripts/**`)
and the **built bundle** (`dist/**/*.js`, excluding `*.map`). Fails (exit 1),
printing every offending `path:line`, if any pattern matches:

```
/\bfetch\s*\(/              fetch(
/\bXMLHttpRequest\b/        XHR
/\bWebSocket\b/             sockets
/\bEventSource\b/           SSE
/\.sendBeacon\s*\(/         navigator.sendBeacon(
/\bimportScripts\s*\(/      SW remote import vector
/\bnavigator\.serviceWorker/ (belt-and-suspenders; not used)
/from\s+['"]https?:\/\//    remote ESM import
/import\s*\(\s*['"]https?:\/\//  dynamic remote import
/src\s*=\s*['"]https?:\/\//  remote <img>/<script> (favicon guard)
/href\s*=\s*['"]https?:\/\/[^'"]*\.(png|ico|svg|jpg|jpeg|gif)/  remote icon in HTML
```

Notes:
- `_favicon/` and `URL.createObjectURL`/`Blob`/`<a download>` are **allowed**
  (local, not network) and match none of the above.
- The guard also asserts the manifest allowlist (imports `src/manifest.config.ts`
  build output `dist/manifest.json`) — no `host_permissions`, permissions ⊆ the
  approved set — as a second gate independent of the build plugin.
- ESLint additionally carries `no-restricted-globals`/`no-restricted-syntax`
  rules banning `fetch`, `XMLHttpRequest`, `WebSocket`, `eval` in `src/**`
  (defense in depth; the CI guard is the authority).

---

## 7. Build order & wiring

Implement in phases; **each phase ends green** (typecheck + test + build pass)
and is **committed** with a conventional message + the required trailer.

- **Phase 0 — scaffold.** All root tooling files, `tsconfig(.node)`, `vite.config.ts`
  (with `makeManifest` plugin + stable SW filename), `vitest.config.ts`, ESLint/
  Prettier, `.gitignore`/`.editorconfig`, `README`/`CONTRIBUTING`/`CHANGELOG`/
  `LICENSE`, CI workflow, `scripts/no-network-guard.mjs`, placeholder icons,
  `src/manifest.config.ts`, empty `src/dashboard.html`. Verify: `npm run typecheck`,
  `npm run guard:network`, `npm run build` (may build an empty SW stub).
- **Phase 1 — pure foundations.** `types.ts`, `ids.ts`, `url.ts`, `tree.ts` + tests.
- **Phase 2 — storage.** `storage.ts` + tests (fake-indexeddb), `tests/setup.ts`.
- **Phase 3 — pure features.** `dedupe.ts`, `search.ts`, `reopen.ts`, `export.ts` + tests.
- **Phase 4 — platform edges.** `chrome.ts`, `messages.ts`, `reopen-exec.ts`, `prefs.ts`.
- **Phase 5 — service worker.** `service-worker.ts` (action→dashboard, message router).
- **Phase 6 — dashboard shell.** `main.tsx`, `App.tsx`, `state/store.ts`, `styles.css`,
  `favicon.ts`, empty/first-run states; left pane reads live tabs via adapter.
- **Phase 7 — features UI.** InboxPane (filter/select-all/batch-move), TreePane
  (recursive FolderNode + native DnD + CRUD), SearchBar, DedupeDialog,
  ExportImportDialog, MoveTargetPicker, Favicon fallback chip.
- **Phase 8 — package & QA.** Final `vite build`; "Load unpacked" from `dist/` in
  Brave; manual QA of the core loop (capture → file → close → reopen-as-group);
  screenshots for README; CHANGELOG `0.1.0`.

### 7.1 Runtime data flow (wiring)
```
capture:  ChromeAdapter.queryAllTabs() ─▶ store.captureLiveTabs()
          └▶ core: build Inbox SavedTabs ─▶ VaultStorage.putTabs ─▶ store notifies ─▶ panes rerender

file:     InboxPane select-all-matching (domain filter) ─▶ store.moveTabsInto(ids, folderId)
          └▶ core tree.moveTabs ─▶ VaultStorage.putTabs ─▶ notify

close:    ChromeAdapter.closeTabs(liveTabIds)   // vault copy already persisted

reopen:   TreePane click ─▶ core.planReopen(folderId, includeSubfolders, state)
          └▶ platform.executeReopen(plan, adapter): createTab* ─▶ groupTabs ─▶ nameGroup(plan.groupName)

dedupe:   core.findDuplicates(tabs) ─▶ DedupeDialog ─▶ store.removeTabs(remove[])

search:   SearchBar query ─▶ core.search(query, tabs) ─▶ highlight/scroll results

export:   VaultStorage.exportSnapshot ─▶ core.toJson / toBookmarksHtml
          └▶ Blob + URL.createObjectURL + <a download>   // local, no network
import:   file read ─▶ core.fromJson ─▶ store.importSnapshot(snap, mode)
```
`chrome.*` appears only inside `src/platform/**` and `src/background/**`. `core/**`
is import-clean of both `chrome` and DOM, which is exactly what the unit tests rely
on and what the side-panel phase will reuse unchanged.
