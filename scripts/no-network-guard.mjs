#!/usr/bin/env node
/**
 * Zero-network guard (docs/PLAN.md §6.1) — the AUTHORITATIVE gate for the
 * project's headline security promise: nothing in the shipped runtime may make
 * a network request.
 *
 * It is dependency-free and cross-platform. It:
 *   1. scans runtime SOURCE (src/**, excluding *.test.ts) for networking
 *      primitives and remote references;
 *   2. scans the BUILT bundle (dist/**\/*.js, dist/**\/*.html, dist/**\/*.css,
 *      excluding *.map) so a dependency that introduces networking is caught;
 *   3. re-validates dist/manifest.json against the permission allowlist,
 *      independently of the Vite build plugin.
 *
 * Exits 1 and prints every offending `path:line` on any violation.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('..', import.meta.url));

/** Patterns that indicate a network capability. Order/labels are informative. */
const BANNED_PATTERNS = [
  { re: /\bfetch\s*\(/, label: 'fetch(' },
  { re: /\bXMLHttpRequest\b/, label: 'XMLHttpRequest' },
  { re: /\bWebSocket\b/, label: 'WebSocket' },
  { re: /\bEventSource\b/, label: 'EventSource' },
  { re: /\.sendBeacon\s*\(/, label: 'navigator.sendBeacon(' },
  { re: /\bimportScripts\s*\(/, label: 'importScripts(' },
  { re: /\bnavigator\.serviceWorker\b/, label: 'navigator.serviceWorker' },
  { re: /from\s+['"]https?:\/\//, label: 'remote ESM import' },
  { re: /import\s*\(\s*['"]https?:\/\//, label: 'dynamic remote import' },
  { re: /src\s*=\s*['"]https?:\/\//, label: 'remote src=' },
  {
    re: /href\s*=\s*['"]https?:\/\/[^'"]*\.(png|ico|svg|jpg|jpeg|gif)/i,
    label: 'remote icon href',
  },
];

const SCAN_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.html',
  '.css',
]);

/** True for files that are tests / non-runtime and must be skipped. */
function isExcludedSourceFile(path) {
  return (
    /\.test\.(ts|tsx|js)$/.test(path) ||
    /\.spec\.(ts|tsx|js)$/.test(path) ||
    path.endsWith('.d.ts')
  );
}

function walk(dir, onFile) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, onFile);
    } else {
      onFile(full);
    }
  }
}

/** Scan one file; push `{ file, line, label }` for every match. */
function scanFile(full, violations) {
  const ext = extname(full);
  if (!SCAN_EXTENSIONS.has(ext)) return;
  if (full.endsWith('.map')) return;
  const text = readFileSync(full, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const { re, label } of BANNED_PATTERNS) {
      if (re.test(line)) {
        violations.push({
          file: relative(rootDir, full),
          line: i + 1,
          label,
          text: line.trim().slice(0, 160),
        });
      }
    }
  });
}

// ---- Manifest allowlist (duplicated intentionally: independent second gate) --

const ALLOWED_PERMISSIONS = new Set([
  'tabs',
  'tabGroups',
  'storage',
  'unlimitedStorage',
  'favicon',
]);
const FORBIDDEN_MANIFEST_KEYS = [
  'host_permissions',
  'optional_host_permissions',
  'content_scripts',
  'externally_connectable',
  'optional_permissions',
];

function validateManifest(distDir, problems) {
  const manifestPath = join(distDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    problems.push(`dist/manifest.json is missing (build did not emit it)`);
    return;
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    problems.push(`dist/manifest.json is not valid JSON: ${err.message}`);
    return;
  }
  for (const key of FORBIDDEN_MANIFEST_KEYS) {
    if (key in manifest) {
      problems.push(`manifest contains forbidden top-level key "${key}"`);
    }
  }
  const perms = manifest.permissions;
  if (!Array.isArray(perms)) {
    problems.push('manifest "permissions" is not an array');
  } else {
    for (const p of perms) {
      if (!ALLOWED_PERMISSIONS.has(p)) {
        problems.push(`manifest permission "${p}" is not in the allowlist`);
      }
    }
  }
}

// ---- Run ----------------------------------------------------------------------

const violations = [];
const manifestProblems = [];

const srcDir = join(rootDir, 'src');
if (existsSync(srcDir)) {
  walk(srcDir, (full) => {
    if (isExcludedSourceFile(full)) return;
    scanFile(full, violations);
  });
} else {
  console.error('no-network-guard: src/ not found');
  process.exit(1);
}

const distDir = join(rootDir, 'dist');
if (existsSync(distDir)) {
  walk(distDir, (full) => scanFile(full, violations));
  validateManifest(distDir, manifestProblems);
} else {
  console.log(
    'no-network-guard: dist/ not present — skipping built-bundle scan ' +
      '(run `npm run build` first to scan the shipped output).',
  );
}

if (violations.length === 0 && manifestProblems.length === 0) {
  console.log('no-network-guard: OK — no networking primitives found.');
  process.exit(0);
}

console.error('\nno-network-guard: FAILED\n');
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  [${v.label}]  ${v.text}`);
}
for (const p of manifestProblems) {
  console.error(`  manifest: ${p}`);
}
console.error(
  `\n${violations.length} network-pattern violation(s), ` +
    `${manifestProblems.length} manifest problem(s).`,
);
process.exit(1);
