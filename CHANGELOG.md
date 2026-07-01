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

[Unreleased]: https://example.com/easy-tab-groups/compare/HEAD
