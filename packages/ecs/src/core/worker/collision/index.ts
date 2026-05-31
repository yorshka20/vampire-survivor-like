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
  shapeCodeToType,
} from '@ecs/systems/physics/collision/collisionSabLayout';
import {
  CollisionPair,
  getCollisionNormalAndPenetration,
  getCollisionNormalAndPenetrationScalar,
} from '@ecs/systems/physics/collision/collisionUtils';
import { getNumericPairKey } from '@ecs/utils';
import { CollisionSabWorkerData, CollisionWorkerData } from '../types';

export function handleCollision(data: CollisionWorkerData): CollisionPair[] {
  const { entities, pairs, pairMode = 'object-object' } = data;
  const collisions: CollisionPair[] = [];
  const checkedPairs = new Set<number>();

  for (const pair of pairs) {
    const entityA = entities[pair.a];
    const entityB = entities[pair.b];

    if (!entityA || !entityB) continue;

    const pairKey = getNumericPairKey(entityA.numericId, entityB.numericId);
    if (checkedPairs.has(pairKey)) continue;
    checkedPairs.add(pairKey);

    switch (pairMode) {
      case 'object-object':
        if (entityA.isAsleep && entityB.isAsleep) continue;

        const objectCollision = getCollisionNormalAndPenetration(
          entityA.position,
          entityA.size,
          entityA.type,
          entityB.position,
          entityB.size,
          entityB.type,
        );

        if (objectCollision) {
          collisions.push({
            a: entityA.id,
            b: entityB.id,
            type: 'object-object',
            normal: objectCollision.normal,
            penetration: objectCollision.penetration,
          });
        }
        break;
      case 'object-obstacle':
        // Ensure A is object and B is obstacle
        const objectEntity = entityA.entityType === 'object' ? entityA : entityB;
        const obstacleEntity = entityA.entityType === 'obstacle' ? entityA : entityB;

        if (objectEntity.entityType !== 'object' || obstacleEntity.entityType !== 'obstacle')
          continue;

        // Obstacles are static, so no need to check asleep status for the pair
        if (objectEntity.isAsleep) continue;

        const collision = getCollisionNormalAndPenetration(
          objectEntity.position,
          objectEntity.size,
          objectEntity.type,
          obstacleEntity.position,
          obstacleEntity.size,
          obstacleEntity.type,
        );

        if (collision) {
          collisions.push({
            a: objectEntity.id,
            b: obstacleEntity.id,
            type: 'object-obstacle',
            normal: collision.normal,
            penetration: collision.penetration,
          });
        }
        break;
    }
  }

  return collisions;
}

/**
 * Narrow-phase test for one candidate pair, writing the result if they collide.
 *
 * Returns true when a collision was written at `writeOffset`, so the caller can
 * advance its result cursor. Kept as a free function (not a closure) so the hot
 * enumeration loops stay monomorphic.
 */
function testAndWritePair(
  entities: Float64Array,
  results: Float64Array,
  writeOffset: number,
  indexA: number,
  indexB: number,
): boolean {
  const aBase = indexA * ENTITY_STRIDE;
  const bBase = indexB * ENTITY_STRIDE;

  const collision = getCollisionNormalAndPenetrationScalar(
    entities[aBase + E_POS_X],
    entities[aBase + E_POS_Y],
    entities[aBase + E_SIZE_X],
    entities[aBase + E_SIZE_Y],
    shapeCodeToType(entities[aBase + E_TYPE]),
    entities[bBase + E_POS_X],
    entities[bBase + E_POS_Y],
    entities[bBase + E_SIZE_X],
    entities[bBase + E_SIZE_Y],
    shapeCodeToType(entities[bBase + E_TYPE]),
  );

  if (!collision) {
    return false;
  }

  results[writeOffset + R_INDEX_A] = indexA;
  results[writeOffset + R_INDEX_B] = indexB;
  results[writeOffset + R_NORMAL_X] = collision.normal[0];
  results[writeOffset + R_NORMAL_Y] = collision.normal[1];
  results[writeOffset + R_PENETRATION] = collision.penetration;
  return true;
}

/**
 * SharedArrayBuffer-based object-object broad phase, run inside the worker.
 *
 * This worker owns the contiguous cell range [startCell, endCell). For each cell
 * it enumerates candidate pairs straight from the shared cell directory —
 * within-cell pairs plus cell x forward-neighbour pairs — runs the narrow phase,
 * and writes collisions into its own disjoint result region.
 *
 * The forward-neighbour scheme means every pair of cells is owned by exactly one
 * cell (hence one worker), so workers never duplicate each other's work and never
 * write to each other's result region — only the count uses Atomics, as the
 * cross-thread visibility/handshake signal. Duplicates from entities whose AABB
 * spans multiple cells are collapsed by the main thread at readback.
 */
export function handleCollisionSab(data: CollisionSabWorkerData): void {
  const {
    entityBuffer,
    memberBuffer,
    cellDirBuffer,
    resultBuffer,
    countBuffer,
    workerIndex,
    startCell,
    endCell,
    resultSlotStart,
    resultSlotCapacity,
  } = data;

  const entities = new Float64Array(entityBuffer);
  const members = new Int32Array(memberBuffer);
  const dir = new Int32Array(cellDirBuffer);
  const results = new Float64Array(resultBuffer);
  const counts = new Int32Array(countBuffer);

  let writeSlot = resultSlotStart;
  const maxSlot = resultSlotStart + resultSlotCapacity;
  let localCount = 0;

  for (let c = startCell; c < endCell; c++) {
    const dBase = c * CELL_DIR_STRIDE;
    const mStart = dir[dBase + CD_MEMBER_START];
    const mCount = dir[dBase + CD_MEMBER_COUNT];

    // Within-cell pairs (i < j).
    for (let i = 0; i < mCount; i++) {
      const indexA = members[mStart + i];
      for (let j = i + 1; j < mCount; j++) {
        if (writeSlot >= maxSlot) {
          break;
        }
        if (testAndWritePair(entities, results, writeSlot * RESULT_STRIDE, indexA, members[mStart + j])) {
          writeSlot++;
          localCount++;
        }
      }
    }

    // Cell x forward-neighbour pairs.
    for (let k = 0; k < CELL_FWD_COUNT; k++) {
      const nc = dir[dBase + CD_FWD0 + k];
      if (nc < 0) {
        continue;
      }
      const nBase = nc * CELL_DIR_STRIDE;
      const nStart = dir[nBase + CD_MEMBER_START];
      const nCount = dir[nBase + CD_MEMBER_COUNT];

      for (let i = 0; i < mCount; i++) {
        const indexA = members[mStart + i];
        for (let j = 0; j < nCount; j++) {
          const indexB = members[nStart + j];
          if (indexA === indexB) {
            continue; // same entity spanning both cells
          }
          if (writeSlot >= maxSlot) {
            break;
          }
          if (testAndWritePair(entities, results, writeSlot * RESULT_STRIDE, indexA, indexB)) {
            writeSlot++;
            localCount++;
          }
        }
      }
    }
  }

  // Publish the count last: the main thread Atomics.load()s this to learn how
  // many results to read, which also establishes happens-before for the writes above.
  Atomics.store(counts, workerIndex, localCount);
}
