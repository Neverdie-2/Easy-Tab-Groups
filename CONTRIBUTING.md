# Contributing to Easy Tab Groups

Thanks for your interest! This project has an unusually strict security posture,
so please read the non-negotiables before opening a PR.

## Non-negotiable constraints

These are the product, not preferences. A PR that violates any of them will not
be merged:

1. **Zero network at runtime.** No `fetch`, `XMLHttpRequest`, `WebSocket`,
   `EventSource`, `navigator.sendBeacon`, remote imports, or remote `<img>`/
   `<script>` in runtime code. `npm run guard:network` must pass (it scans both
   `src/` and the built `dist/`).
2. **Minimal permissions only.** The manifest may request only
   `["tabs", "tabGroups", "storage", "unlimitedStorage", "favicon"]`. Never add
   `host_permissions`, `<all_urls>`, `content_scripts`, `cookies`, `history`,
   `webRequest`, `scripting`, or `externally_connectable`. The build fails if you
   do.
3. **Favicons are local-only** (the MV3 `_favicon/` endpoint) or a letter chip.
4. **XSS-safe rendering.** Untrusted titles/URLs go through `textContent` / safe
   DOM APIs. No `innerHTML` with untrusted strings, no `eval`.
5. **Pure core, dirty edges.** Logic lives in `src/core/**` with no `chrome.*`
   and no DOM. `chrome.*` lives in `src/platform/**` and `src/background/**`;
   DOM lives in `src/dashboard/**`.

## Development setup

```bash
npm install
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run build
npm run guard:network
```

All of the above must be green before you push. CI runs the same steps.

## Tests

- Pure modules in `src/core/**` are unit-tested with Vitest (deterministic, no
  mocks). Aim to keep them fully covered.
- Storage tests run against `fake-indexeddb`.
- Keep tree / storage / dedupe / search / reopen / export decoupled from
  `chrome.*` so they stay unit-testable.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) — e.g.
`feat(tree): add cascade delete`, `fix(storage): seed inbox on init`.

Add a [CHANGELOG.md](CHANGELOG.md) entry under `[Unreleased]` for any
user-visible change or any deviation from `docs/PLAN.md`.

## Pull requests

- Keep PRs focused and small where possible.
- Describe the change and how you verified it (paste the passing command
  output).
- Do not introduce runtime third-party dependencies without discussion — the
  auditability story depends on a tiny trust surface (currently exactly one
  runtime dependency: `preact`).
