import {
  CD_FWD0,
  CD_MEMBER_COUNT,
  CD_MEMBER_START,
  CELL_DIR_STRIDE,
  CELL_FWD_COUNT,
  ENTITY_STRIDE,
  E_POS_X,
  E_POS_Y,
  E_SIZE_X,
  E_SIZE_Y,
  E_TYPE,
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

type CellSpec = {
  /** Member entity indices in this cell. */
  members: number[];
  /** Forward-neighbour cell indices (padded with -1 up to CELL_FWD_COUNT). */
  fwd?: number[];
};

/**
 * Builds the shared buffers the SAB collision worker reads/writes. The worker is
 * a plain function over typed-array views, so we exercise the full cell-directory
 * enumeration without a real Worker.
 */
function buildBuffers(
  entities: Array<[posX: number, posY: number, sizeX: number, sizeY: number, typeCode: number]>,
  cells: CellSpec[],
  resultCapacity: number,
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

  const totalMembers = cells.reduce((sum, c) => sum + c.members.length, 0);
  const memberSab = new SharedArrayBuffer(totalMembers * Int32Array.BYTES_PER_ELEMENT);
  const memberView = new Int32Array(memberSab);
  const cellDirSab = new SharedArrayBuffer(
    cells.length * CELL_DIR_STRIDE * Int32Array.BYTES_PER_ELEMENT,
  );
  const cellDirView = new Int32Array(cellDirSab);

  let pos = 0;
  cells.forEach((cell, ci) => {
    const dBase = ci * CELL_DIR_STRIDE;
    cellDirView[dBase + CD_MEMBER_START] = pos;
    cellDirView[dBase + CD_MEMBER_COUNT] = cell.members.length;
    for (const m of cell.members) {
      memberView[pos++] = m;
    }
    for (let k = 0; k < CELL_FWD_COUNT; k++) {
      cellDirView[dBase + CD_FWD0 + k] = cell.fwd?.[k] ?? -1;
    }
  });

  const resultSab = new SharedArrayBuffer(
    resultCapacity * RESULT_STRIDE * Float64Array.BYTES_PER_ELEMENT,
  );
  const resultView = new Float64Array(resultSab);

  const countSab = new SharedArrayBuffer(workerCount * Int32Array.BYTES_PER_ELEMENT);
  const countView = new Int32Array(countSab);

  return { entitySab, memberSab, cellDirSab, resultSab, countSab, resultView, countView };
}

function readResult(resultView: Float64Array, slot: number) {
  const off = slot * RESULT_STRIDE;
  return {
    indexA: resultView[off + R_INDEX_A],
    indexB: resultView[off + R_INDEX_B],
    normal: [resultView[off + R_NORMAL_X], resultView[off + R_NORMAL_Y]] as [number, number],
    penetration: resultView[off + R_PENETRATION],
  };
}

const C = SHAPE_CIRCLE;

describe('handleCollisionSab', () => {
  it('detects within-cell collisions and publishes the count atomically', () => {
    // 0 & 1 overlap (centres 8 apart, r5 + r5 = 10); 2 is far away.
    const { resultView, countView, ...buffers } = buildBuffers(
      [
        [0, 0, 10, 10, C],
        [8, 0, 10, 10, C],
        [100, 100, 10, 10, C],
      ],
      [{ members: [0, 1, 2] }],
      3, // C(3,2) = 3 candidate slots
      1,
    );

    handleCollisionSab({
      entityBuffer: buffers.entitySab,
      memberBuffer: buffers.memberSab,
      cellDirBuffer: buffers.cellDirSab,
      resultBuffer: buffers.resultSab,
      countBuffer: buffers.countSab,
      workerIndex: 0,
      startCell: 0,
      endCell: 1,
      resultSlotStart: 0,
      resultSlotCapacity: 3,
    });

    expect(Atomics.load(countView, 0)).toBe(1);
    const hit = readResult(resultView, 0);
    expect(hit.indexA).toBe(0);
    expect(hit.indexB).toBe(1);
    expect(hit.penetration).toBeCloseTo(2);
    expect(hit.normal[0]).toBeCloseTo(-1);
    expect(hit.normal[1]).toBeCloseTo(0);
  });

  it('detects cell x forward-neighbour collisions', () => {
    // Entity 0 in cell 0, entity 1 in cell 1; cell 0 lists cell 1 as a forward neighbour.
    const { resultView, countView, ...buffers } = buildBuffers(
      [
        [0, 0, 10, 10, C],
        [8, 0, 10, 10, C],
      ],
      [
        { members: [0], fwd: [1] }, // cell 0 -> forward neighbour cell 1
        { members: [1] }, // cell 1
      ],
      2,
      1,
    );

    handleCollisionSab({
      entityBuffer: buffers.entitySab,
      memberBuffer: buffers.memberSab,
      cellDirBuffer: buffers.cellDirSab,
      resultBuffer: buffers.resultSab,
      countBuffer: buffers.countSab,
      workerIndex: 0,
      startCell: 0,
      endCell: 2,
      resultSlotStart: 0,
      resultSlotCapacity: 2,
    });

    expect(Atomics.load(countView, 0)).toBe(1);
    const hit = readResult(resultView, 0);
    expect(hit.indexA).toBe(0);
    expect(hit.indexB).toBe(1);
  });

  it('skips a member that spans both a cell and its forward neighbour', () => {
    // Entity 1 is in both cells (spanning). The cross pair (1, 1) must be skipped;
    // (0, 1) within cell 0 still collides.
    const { countView, ...buffers } = buildBuffers(
      [
        [0, 0, 10, 10, C],
        [8, 0, 10, 10, C],
      ],
      [
        { members: [0, 1], fwd: [1] },
        { members: [1] },
      ],
      4,
      1,
    );

    handleCollisionSab({
      entityBuffer: buffers.entitySab,
      memberBuffer: buffers.memberSab,
      cellDirBuffer: buffers.cellDirSab,
      resultBuffer: buffers.resultSab,
      countBuffer: buffers.countSab,
      workerIndex: 0,
      startCell: 0,
      endCell: 2,
      resultSlotStart: 0,
      resultSlotCapacity: 4,
    });

    // (0,1) within cell 0 collides; cross pairs (0,1) and (1,1-skip) — the duplicate
    // (0,1) is left for the main thread to dedup, so the worker reports 2 here.
    expect(Atomics.load(countView, 0)).toBe(2);
  });

  it('writes each worker into its own count slot and result region', () => {
    // Two independent colliding cells; two workers, each owns one cell and a
    // disjoint result region (slot 0 and slot 1).
    const { resultView, countView, ...buffers } = buildBuffers(
      [
        [0, 0, 10, 10, C],
        [8, 0, 10, 10, C],
        [0, 100, 10, 10, C],
        [8, 100, 10, 10, C],
      ],
      [{ members: [0, 1] }, { members: [2, 3] }],
      2,
      2,
    );

    const shared = {
      entityBuffer: buffers.entitySab,
      memberBuffer: buffers.memberSab,
      cellDirBuffer: buffers.cellDirSab,
      resultBuffer: buffers.resultSab,
      countBuffer: buffers.countSab,
    };

    handleCollisionSab({ ...shared, workerIndex: 0, startCell: 0, endCell: 1, resultSlotStart: 0, resultSlotCapacity: 1 });
    handleCollisionSab({ ...shared, workerIndex: 1, startCell: 1, endCell: 2, resultSlotStart: 1, resultSlotCapacity: 1 });

    expect(Atomics.load(countView, 0)).toBe(1);
    expect(Atomics.load(countView, 1)).toBe(1);
    expect(readResult(resultView, 0).indexA).toBe(0);
    expect(readResult(resultView, 1).indexA).toBe(2);
  });

  it('stops writing when its result region is full', () => {
    const { countView, ...buffers } = buildBuffers(
      [
        [0, 0, 10, 10, C],
        [8, 0, 10, 10, C],
        [0, 4, 10, 10, C],
      ],
      [{ members: [0, 1, 2] }], // all three overlap → up to 3 collisions
      1,
      1,
    );

    handleCollisionSab({
      entityBuffer: buffers.entitySab,
      memberBuffer: buffers.memberSab,
      cellDirBuffer: buffers.cellDirSab,
      resultBuffer: buffers.resultSab,
      countBuffer: buffers.countSab,
      workerIndex: 0,
      startCell: 0,
      endCell: 1,
      resultSlotStart: 0,
      resultSlotCapacity: 1, // only room for one
    });

    // Capacity caps the worker at one write even though more pairs collide.
    expect(Atomics.load(countView, 0)).toBe(1);
  });
});

describe('shape type codes', () => {
  it('round-trips known shapes and maps unknowns to a sentinel', () => {
    expect(shapeTypeToCode('rect')).toBe(0);
    expect(shapeTypeToCode('circle')).toBe(SHAPE_CIRCLE);
    expect(shapeTypeToCode('polygon')).toBe(-1);
  });
});
