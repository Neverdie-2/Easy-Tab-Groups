/**
 * Vitest global setup (docs/PLAN.md §2.7). Installs an in-memory IndexedDB so
 * the storage adapter tests run without a browser.
 */
import 'fake-indexeddb/auto';
