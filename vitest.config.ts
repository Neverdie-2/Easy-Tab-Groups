import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pure core + storage tests run in a Node environment; fake-indexeddb is
    // installed globally via the setup file.
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Measure the pure core AND the platform edges (chrome adapter, reopen
      // executor, …) so the reported number reflects the real runtime surface,
      // not just the pure heart. (.tsx UI components are exercised by hand — see
      // docs/MANUAL-QA.md — and stay out of the unit-coverage scope.)
      include: ['src/core/**/*.ts', 'src/platform/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
});
