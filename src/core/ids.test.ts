import { describe, expect, it } from 'vitest';
import { ORDER_STEP, newId, nextOrder } from './ids';

describe('newId', () => {
  it('returns a unique non-empty string each call', () => {
    const a = newId();
    const b = newId();
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});

describe('nextOrder', () => {
  it('returns ORDER_STEP for an empty sibling list', () => {
    expect(nextOrder([])).toBe(ORDER_STEP);
  });

  it('returns max order + STEP', () => {
    expect(nextOrder([{ order: 1000 }, { order: 5000 }, { order: 3000 }])).toBe(
      6000,
    );
  });

  it('works when max is not the last element', () => {
    expect(nextOrder([{ order: 9000 }, { order: 100 }])).toBe(10000);
  });
});
