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
      // Pure logic is the auditable heart of the product — keep it covered.
      include: ['src/core/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
});
