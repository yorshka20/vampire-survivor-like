import {
  ENTITY_STRIDE,
  E_POS_X,
  E_POS_Y,
  E_SIZE_X,
  E_SIZE_Y,
  E_TYPE,
  PAIR_STRIDE,
  P_INDEX_A,
  P_INDEX_B,
  RESULT_STRIDE,
  R_INDEX_A,
  R_INDEX_B,
  R_NORMAL_X,
  R_NORMAL_Y,
  R_PENETRATION,
  SHAPE_CIRCLE,
  shapeTypeToCode,
} from '@ecs/systems/physics/collision/collisionSabLayout';
import { describe, expect, it } from 'vitest';
import { handleCollisionSab } from '../index';

/**
 * Builds the shared buffers the SAB collision worker reads/writes.
 *
 * The worker handler is a plain function over typed-array views, so we exercise
 * the full layout round-trip (offsets + Atomics handshake) without a real Worker.
 */
function buildBuffers(
  entities: Array<[posX: number, posY: number, sizeX: number, sizeY: number, typeCode: number]>,
  pairs: Array<[indexA: number, indexB: number]>,
  workerCount: number,
) {
  const entitySab = new SharedArrayBuffer(
    entities.length * ENTITY_STRIDE * Float64Array.BYTES_PER_ELEMENT,
  );
  const entityView = new Float64Array(entitySab);
  entities.forEach(([px, py, sx, sy, t], i) => {
    const b = i * ENTITY_STRIDE;
    entityView[b + E_POS_X] = px;
    entityView[b + E_POS_Y] = py;
    entityView[b + E_SIZE_X] = sx;
    entityView[b + E_SIZE_Y] = sy;
    entityView[b + E_TYPE] = t;
  });

  const pairSab = new SharedArrayBuffer(pairs.length * PAIR_STRIDE * Int32Array.BYTES_PER_ELEMENT);
  const pairView = new Int32Array(pairSab);
  pairs.forEach(([a, b], i) => {
    pairView[i * PAIR_STRIDE + P_INDEX_A] = a;
    pairView[i * PAIR_STRIDE + P_INDEX_B] = b;
  });

  // One result slot per pair (each pair yields at most one collision).
  const resultSab = new SharedArrayBuffer(
    pairs.length * RESULT_STRIDE * Float64Array.BYTES_PER_ELEMENT,
  );
  const resultView = new Float64Array(resultSab);

  const countSab = new SharedArrayBuffer(workerCount * Int32Array.BYTES_PER_ELEMENT);
  const countView = new Int32Array(countSab);

  return { entitySab, pairSab, resultSab, countSab, resultView, countView };
}

function readResult(resultView: Float64Array, pairIndex: number) {
  const off = pairIndex * RESULT_STRIDE;
  return {
    indexA: resultView[off + R_INDEX_A],
    indexB: resultView[off + R_INDEX_B],
    normal: [resultView[off + R_NORMAL_X], resultView[off + R_NORMAL_Y]] as [number, number],
    penetration: resultView[off + R_PENETRATION],
  };
}

describe('handleCollisionSab', () => {
  it('writes only colliding pairs and publishes the count atomically', () => {
    // 0 & 1 overlap (centers 8 apart, r5+r5=10); 2 is far away.
    const c = SHAPE_CIRCLE;
    const { resultView, countView, ...buffers } = buildBuffers(
      [
        [0, 0, 10, 10, c],
        [8, 0, 10, 10, c],
        [100, 100, 10, 10, c],
      ],
      [
        [0, 1], // collide
        [0, 2], // no
        [1, 2], // no
      ],
      1,
    );

    handleCollisionSab({
      entityBuffer: buffers.entitySab,
      pairBuffer: buffers.pairSab,
      resultBuffer: buffers.resultSab,
      countBuffer: buffers.countSab,
      workerIndex: 0,
      startPair: 0,
      endPair: 3,
    });

    expect(Atomics.load(countView, 0)).toBe(1);

    const hit = readResult(resultView, 0);
    expect(hit.indexA).toBe(0);
    expect(hit.indexB).toBe(1);
    expect(hit.penetration).toBeCloseTo(2);
    expect(hit.normal[0]).toBeCloseTo(-1);
    expect(hit.normal[1]).toBeCloseTo(0);
  });

  it('reports zero collisions when nothing overlaps', () => {
    const c = SHAPE_CIRCLE;
    const { countView, ...buffers } = buildBuffers(
      [
        [0, 0, 10, 10, c],
        [100, 0, 10, 10, c],
      ],
      [[0, 1]],
      1,
    );

    handleCollisionSab({
      entityBuffer: buffers.entitySab,
      pairBuffer: buffers.pairSab,
      resultBuffer: buffers.resultSab,
      countBuffer: buffers.countSab,
      workerIndex: 0,
      startPair: 0,
      endPair: 1,
    });

    expect(Atomics.load(countView, 0)).toBe(0);
  });

  it('partitions disjoint pair ranges across workers into separate regions', () => {
    // 4 pairs, all colliding; two workers split [0,2) and [2,4). Each worker must
    // write into its own count slot and its own result region (starting at startPair).
    const c = SHAPE_CIRCLE;
    const { resultView, countView, ...buffers } = buildBuffers(
      [
        [0, 0, 10, 10, c],
        [8, 0, 10, 10, c],
        [0, 8, 10, 10, c],
        [8, 8, 10, 10, c],
      ],
      [
        [0, 1],
        [0, 2],
        [1, 3],
        [2, 3],
      ],
      2,
    );

    const shared = {
      entityBuffer: buffers.entitySab,
      pairBuffer: buffers.pairSab,
      resultBuffer: buffers.resultSab,
      countBuffer: buffers.countSab,
    };

    handleCollisionSab({ ...shared, workerIndex: 0, startPair: 0, endPair: 2 });
    handleCollisionSab({ ...shared, workerIndex: 1, startPair: 2, endPair: 4 });

    expect(Atomics.load(countView, 0)).toBe(2);
    expect(Atomics.load(countView, 1)).toBe(2);

    // Worker 0 wrote at pair offsets 0,1; worker 1 at offsets 2,3 (== startPair).
    expect(readResult(resultView, 0).indexA).toBe(0);
    expect(readResult(resultView, 1).indexA).toBe(0);
    expect(readResult(resultView, 2).indexA).toBe(1);
    expect(readResult(resultView, 3).indexA).toBe(2);
  });
});

describe('shape type codes', () => {
  it('round-trips known shapes and maps unknowns to a sentinel', () => {
    expect(shapeTypeToCode('rect')).toBe(0);
    expect(shapeTypeToCode('circle')).toBe(SHAPE_CIRCLE);
    expect(shapeTypeToCode('polygon')).toBe(-1);
  });
});
