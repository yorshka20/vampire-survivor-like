/**
 * @file collisionSabLayout.ts
 * @description Shared memory layout for the SharedArrayBuffer-based parallel collision path.
 *
 * Both the main thread (ParallelCollisionSystem) and the collision worker
 * (handleCollisionSab) read/write the same buffers using these strides and
 * offsets, so they MUST stay in sync. Keeping the layout in one module avoids
 * the per-frame `structuredClone` of an object tree that the old postMessage
 * path incurred (the source of the worker-side Major GC).
 *
 * Buffers (all flat, columnar / array-of-structures):
 * - entity buffer  (Float64Array, stride ENTITY_STRIDE): per active object entity
 * - pair   buffer  (Int32Array,   stride PAIR_STRIDE):   per candidate pair, entity indices
 * - result buffer  (Float64Array, stride RESULT_STRIDE): per detected collision
 * - count  buffer  (Int32Array,   length = workerCount): collisions written per worker (Atomics signal)
 */

// --- Entity columns (Float64) ---
export const ENTITY_STRIDE = 5;
export const E_POS_X = 0;
export const E_POS_Y = 1;
export const E_SIZE_X = 2;
export const E_SIZE_Y = 3;
export const E_TYPE = 4;

// --- Pair columns (Int32) ---
export const PAIR_STRIDE = 2;
export const P_INDEX_A = 0;
export const P_INDEX_B = 1;

// --- Result columns (Float64) ---
export const RESULT_STRIDE = 5;
export const R_INDEX_A = 0;
export const R_INDEX_B = 1;
export const R_NORMAL_X = 2;
export const R_NORMAL_Y = 3;
export const R_PENETRATION = 4;

// --- Shape type codes (avoid shipping strings into shared memory) ---
export const SHAPE_UNKNOWN = -1;
export const SHAPE_RECT = 0;
export const SHAPE_CIRCLE = 1;

export function shapeTypeToCode(type: string): number {
  if (type === 'rect') return SHAPE_RECT;
  if (type === 'circle') return SHAPE_CIRCLE;
  return SHAPE_UNKNOWN;
}

export function shapeCodeToType(code: number): string {
  if (code === SHAPE_RECT) return 'rect';
  if (code === SHAPE_CIRCLE) return 'circle';
  return 'unknown';
}
