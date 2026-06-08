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
 * - entity   buffer (Float64Array, stride ENTITY_STRIDE):   per active object entity
 * - member   buffer (Int32Array,   flat):                   per cell, its members' entity indices
 * - cell-dir buffer (Int32Array,   stride CELL_DIR_STRIDE): per cell, member slice + forward neighbours
 * - result   buffer (Float64Array, stride RESULT_STRIDE):   per detected collision
 * - count    buffer (Int32Array,   length = workerCount):   collisions written per worker (Atomics signal)
 *
 * The broad phase (candidate-pair enumeration) runs inside the workers: the main
 * thread only describes the grid via the member + cell-dir buffers, and each
 * worker enumerates the cells it owns. So there is no pair buffer.
 */

// --- Entity columns (Float64) ---
export const ENTITY_STRIDE = 5;
export const E_POS_X = 0;
export const E_POS_Y = 1;
export const E_SIZE_X = 2;
export const E_SIZE_Y = 3;
export const E_TYPE = 4;

// --- Cell directory columns (Int32) ---
// Each occupied cell gets a dense index 0..cellCount-1 and one row here.
export const CELL_FWD_COUNT = 4; // forward-neighbour count (the other half is covered by those cells)
export const CELL_DIR_STRIDE = 2 + CELL_FWD_COUNT; // [memberStart, memberCount, fwd0..fwd3]
export const CD_MEMBER_START = 0;
export const CD_MEMBER_COUNT = 1;
export const CD_FWD0 = 2; // forward-neighbour cell indices live at CD_FWD0 .. CD_FWD0+CELL_FWD_COUNT-1 (-1 = none)

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
  if (type === 'circle') return SHAPE_CIRCLE;
  // Everything else (rect plus complex geometry: polygon, parametric, bezier...)
  // collides as its axis-aligned bounding box. ShapeComponent.getSize() returns
  // that box for the complex types, so this is a "good enough" AABB approximation
  // without per-type narrow-phase support.
  return SHAPE_RECT;
}

export function shapeCodeToType(code: number): string {
  if (code === SHAPE_RECT) return 'rect';
  if (code === SHAPE_CIRCLE) return 'circle';
  return 'unknown';
}
