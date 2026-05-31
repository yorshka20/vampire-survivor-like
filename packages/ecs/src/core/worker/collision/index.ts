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
 * SharedArrayBuffer-based object-object broad phase.
 *
 * Reads entity columns and the candidate pair list from shared memory, runs the
 * narrow-phase test for this worker's assigned pair range, and writes detected
 * collisions back into the shared result buffer (no postMessage payload).
 *
 * Pairs are partitioned into disjoint ranges across workers, so each worker
 * writes into its own region of `resultBuffer` (starting at `startPair`) and its
 * own `countBuffer` slot — no contention, only the count uses Atomics as the
 * cross-thread visibility/handshake signal. Pairs are already de-duplicated on
 * the main thread, so no per-worker `checkedPairs` set is needed.
 */
export function handleCollisionSab(data: CollisionSabWorkerData): void {
  const { entityBuffer, pairBuffer, resultBuffer, countBuffer, workerIndex, startPair, endPair } =
    data;

  const entities = new Float64Array(entityBuffer);
  const pairs = new Int32Array(pairBuffer);
  const results = new Float64Array(resultBuffer);
  const counts = new Int32Array(countBuffer);

  // This worker's results begin at the same offset as its first pair, so the
  // disjoint pair ranges map to disjoint result regions automatically.
  let writeOffset = startPair * RESULT_STRIDE;
  let localCount = 0;

  for (let p = startPair; p < endPair; p++) {
    const pairBase = p * PAIR_STRIDE;
    const indexA = pairs[pairBase + P_INDEX_A];
    const indexB = pairs[pairBase + P_INDEX_B];

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

    if (collision) {
      results[writeOffset + R_INDEX_A] = indexA;
      results[writeOffset + R_INDEX_B] = indexB;
      results[writeOffset + R_NORMAL_X] = collision.normal[0];
      results[writeOffset + R_NORMAL_Y] = collision.normal[1];
      results[writeOffset + R_PENETRATION] = collision.penetration;
      writeOffset += RESULT_STRIDE;
      localCount++;
    }
  }

  // Publish the count last: the main thread Atomics.load()s this to learn how
  // many results to read, which also establishes happens-before for the writes above.
  Atomics.store(counts, workerIndex, localCount);
}
