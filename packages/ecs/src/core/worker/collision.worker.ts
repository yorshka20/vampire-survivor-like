import {
  CollisionPair,
  getCollisionNormalAndPenetration,
} from '@ecs/systems/physics/collision/collisionUtils';
import { getNumericPairKey } from '@ecs/utils/name';
import { WorkerData } from './types';

// Listen for messages from the main thread
self.onmessage = (event: MessageEvent<WorkerData>) => {
  const { entities, pairs, pairMode = 'object-object', taskId } = event.data;
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

  self.postMessage({ taskId, collisions });
};
