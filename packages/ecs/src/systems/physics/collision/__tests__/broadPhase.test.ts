import { describe, expect, it } from 'vitest';
import { FORWARD_NEIGHBORS } from '../broadPhase';

/**
 * The broad phase relies on FORWARD_NEIGHBORS to visit each unordered pair of
 * adjacent cells exactly once (cell-vs-self is handled separately). These tests
 * pin down that invariant: getting it wrong silently drops or double-counts
 * collisions, which is nearly invisible in gameplay until objects tunnel.
 */
describe('FORWARD_NEIGHBORS', () => {
  const key = (dx: number, dy: number) => `${dx},${dy}`;
  const set = new Set(FORWARD_NEIGHBORS.map(([dx, dy]) => key(dx, dy)));

  it('contains only real neighbour offsets (no self, within the 3x3 ring)', () => {
    for (const [dx, dy] of FORWARD_NEIGHBORS) {
      expect(dx === 0 && dy === 0).toBe(false);
      expect(Math.abs(dx)).toBeLessThanOrEqual(1);
      expect(Math.abs(dy)).toBeLessThanOrEqual(1);
    }
  });

  it('has no duplicates', () => {
    expect(set.size).toBe(FORWARD_NEIGHBORS.length);
  });

  it('selects exactly one direction of every opposing neighbour pair', () => {
    // Walk all 8 neighbours. For each, exactly one of (offset, -offset) must be
    // present — that is what guarantees full, non-duplicated coverage.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const here = set.has(key(dx, dy));
        const opposite = set.has(key(-dx, -dy));
        expect(here !== opposite).toBe(true); // exactly one of the two
      }
    }
  });

  it('covers exactly 4 of the 8 neighbours', () => {
    expect(FORWARD_NEIGHBORS.length).toBe(4);
  });
});
