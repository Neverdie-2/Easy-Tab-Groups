import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { manifest, assertManifestPolicy } from './src/manifest.config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const srcDir = resolve(rootDir, 'src');
const outDir = resolve(rootDir, 'dist');
const publicDir = resolve(rootDir, 'public');

/**
 * First-party manifest plugin (docs/PLAN.md §1.1). Emits `dist/manifest.json`
 * from the typed single source of truth and FAILS THE BUILD if the manifest
 * ever violates the permission allowlist. No third-party manifest tooling.
 */
function makeManifest(): Plugin {
  return {
    name: 'easy-tab-groups:make-manifest',
    apply: 'build',
    buildStart() {
      assertManifestPolicy(manifest as unknown as Record<string, unknown>);
    },
    generateBundle() {
      const serialized = JSON.stringify(manifest, null, 2);
      // Re-validate the exact bytes we are about to ship.
      assertManifestPolicy(JSON.parse(serialized) as Record<string, unknown>);
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: `${serialized}\n`,
      });
    },
  };
}

export default defineConfig({
  root: srcDir,
  publicDir,
  // Relative base so extension-page assets resolve against the extension origin.
  base: './',
  build: {
    outDir,
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    // The modulepreload polyfill uses fetch() — disable it so the shipped
    // bundle stays provably network-free (see scripts/no-network-guard.mjs).
    modulePreload: false,
    rollupOptions: {
      input: {
        dashboard: resolve(srcDir, 'dashboard.html'),
        'service-worker': resolve(srcDir, 'background/service-worker.ts'),
      },
      output: {
        // Stable, unhashed name for the service worker (referenced by manifest);
        // everything else is content-hashed under assets/.
        entryFileNames: (chunk) =>
          chunk.name === 'service-worker'
            ? 'service-worker.js'
            : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  plugins: [makeManifest()],
});
