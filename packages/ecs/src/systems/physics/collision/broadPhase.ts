/**
 * @file broadPhase.ts
 * @description Shared constants for the spatial-grid broad phase.
 */

/**
 * Forward half of the 3x3 cell neighbourhood.
 *
 * The broad phase handles the cell itself separately (within-cell pairs) and
 * then scans only these neighbours. For correctness this list must contain
 * exactly one of every {offset, -offset} opposing pair among the 8 neighbours,
 * so that sweeping every cell visits each unordered pair of adjacent cells
 * exactly once — no pair missed, none visited twice. See broadPhase.test.ts.
 */
export const FORWARD_NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];
