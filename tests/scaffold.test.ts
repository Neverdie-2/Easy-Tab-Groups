/**
 * Scaffold smoke test: proves the Vitest + fake-indexeddb harness is wired up.
 * Real module tests are co-located in `src/core/**` and added in Phases 1-3.
 */
import { describe, expect, it } from 'vitest';
import { INBOX_ID } from '../src/core/types';

describe('scaffold', () => {
  it('exposes the reserved Inbox id', () => {
    expect(INBOX_ID).toBe('inbox');
  });

  it('has an in-memory IndexedDB from the setup file', () => {
    expect(typeof indexedDB).toBe('object');
    expect(typeof indexedDB.open).toBe('function');
  });
});
