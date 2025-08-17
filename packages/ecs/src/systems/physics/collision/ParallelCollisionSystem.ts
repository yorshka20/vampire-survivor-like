import {
  ColliderComponent,
  PhysicsComponent,
  ShapeComponent,
  TransformComponent,
} from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { SimpleEntity, WorkerPoolManager } from '@ecs/core/worker';
import { RenderSystem } from '@ecs/systems';
import { getNumericPairKey } from '@ecs/utils/name';
import { CollisionPair, CollisionResult, getCollisionNormalAndPenetration } from './collisionUtils';

/**
 * @class ParallelCollisionSystem
 * @description A collision system that uses Web Workers to parallelize collision detection.
 *
 * This system orchestrates the following process each frame:
 * 1. Gathers the state of all collidable entities.
 * 2. Divides the spatial grid cells among a pool of Web Workers.
 * 3. Sends the entity data and assigned cells to each worker.
 * 4. Awaits collision results (pairs of colliding entity IDs) from all workers.
 * 5. Aggregates the results and resolves each unique collision on the main thread.
 *
 * This approach offloads the O(n^2) detection phase to background threads,
 * freeing up the main thread to focus on rendering and other logic. The resolution
 * phase remains on the main thread to ensure deterministic state changes and avoid race conditions.
 */
export class ParallelCollisionSystem extends System {
  private workerPoolManager: WorkerPoolManager;

  constructor(private positionalCorrectTimes: number = 6) {
    super('ParallelCollisionSystem', SystemPriorities.COLLISION, 'logic');

    this.workerPoolManager = WorkerPoolManager.getInstance();
  }

  private getRenderSystem(): RenderSystem {
    return RenderSystem.getInstance();
  }

  // Main update loop
  async update(deltaTime: number): Promise<void> {
    if (!this.gridComponent) return;

    const grid = this.gridComponent.grid;
    if (!grid || grid.size === 0) return;

    // Start the collision detection process for the current frame
    const activePromises = this.startCollisionDetection(grid);

    if (activePromises.length > 0) {
      await this.handleWorkerResults(activePromises);
    }
  }

  // Distributes collision detection tasks to the workers
  private startCollisionDetection(
    grid: Map<string, { objects: Set<string> }>,
  ): Promise<CollisionPair[]>[] {
    // !NOTICE: be sure to make object entity contain all necessary components.
    const allEntities = this.world.getEntitiesByCondition(
      (entity) => entity.active && !entity.toRemove && entity.isType('object'),
    );
    const simpleEntities: Record<string, SimpleEntity> = {};

    // Prepare a simplified dataset for the workers
    for (const entity of allEntities) {
      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      const collider = entity.getComponent<ColliderComponent>(ColliderComponent.componentName);
      const physics = entity.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
      const shape = entity.getComponent<ShapeComponent>(ShapeComponent.componentName);

      if (transform && collider && physics && shape) {
        const position = transform.getPosition();
        simpleEntities[entity.id] = {
          id: entity.id,
          numericId: entity.numericId,
          isAsleep: physics.isAsleep(),
          position: position,
          collisionArea: collider.getCollisionArea(position, [0, 0, 0, 0]),
          size: shape.getSize(),
          type: shape.getType(),
          entityType: 'object',
        };
      }
    }

    if (Object.keys(simpleEntities).length < 2) return [];

    // Generate all unique object-object pairs from the grid
    const pairs: { a: string; b: string }[] = [];
    const checkedPairs = new Set<number>();

    for (const cellKey of grid.keys()) {
      const cell = grid.get(cellKey);
      if (!cell || !cell.objects || cell.objects.size < 1) continue;

      const neighborKeys: string[] = [];
      const [cellX, cellY] = cellKey.split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          neighborKeys.push(`${cellX + dx},${cellY + dy}`);
        }
      }

      const potentialPartners = new Set<string>(cell.objects);
      for (const key of neighborKeys) {
        const neighborCell = grid.get(key);
        if (neighborCell && neighborCell.objects) {
          for (const partnerId of neighborCell.objects) {
            potentialPartners.add(partnerId);
          }
        }
      }

      const cellObjects = Array.from(cell.objects);
      const partnerObjects = Array.from(potentialPartners);

      for (let i = 0; i < cellObjects.length; i++) {
        for (let j = 0; j < partnerObjects.length; j++) {
          const idA = cellObjects[i];
          const idB = partnerObjects[j];

          if (idA === idB) continue; // An object cannot collide with itself

          const pairKey = getNumericPairKey(
            simpleEntities[idA].numericId,
            simpleEntities[idB].numericId,
          );
          if (!checkedPairs.has(pairKey)) {
            pairs.push({ a: idA, b: idB });
            checkedPairs.add(pairKey);
          }
        }
      }
    }

    if (pairs.length === 0) return [];

    // Distribute pairs among workers
    const workerCount = this.workerPoolManager.getWorkerCount();
    const pairsPerWorker = Math.ceil(pairs.length / workerCount);
    const activePromises: Promise<CollisionPair[]>[] = [];

    for (let i = 0; i < workerCount; i++) {
      const start = i * pairsPerWorker;
      const end = start + pairsPerWorker;
      const assignedPairs = pairs.slice(start, end);

      if (assignedPairs.length > 0) {
        const workerEntities: Record<string, SimpleEntity> = {};
        for (const pair of assignedPairs) {
          if (simpleEntities[pair.a] && !workerEntities[pair.a]) {
            workerEntities[pair.a] = simpleEntities[pair.a];
          }
          if (simpleEntities[pair.b] && !workerEntities[pair.b]) {
            workerEntities[pair.b] = simpleEntities[pair.b];
          }
        }

        activePromises.push(
          this.workerPoolManager.submitTask(
            {
              entities: workerEntities,
              pairs: assignedPairs,
              pairMode: 'object-object',
            },
            this.priority,
          ),
        );
      }
    }
    return activePromises;
  }

  // Awaits and processes results from all workers
  private async handleWorkerResults(activePromises: Promise<CollisionPair[]>[]) {
    try {
      const results = await Promise.all(activePromises);

      const allCollisions = results.flat();
      const uniqueCollisions = this.filterUniqueCollisions(allCollisions);

      if (uniqueCollisions.size > 0) {
        // The resolution process is iterative
        for (let i = 0; i < this.positionalCorrectTimes; i++) {
          let hasCollisions = false;
          for (const pair of uniqueCollisions) {
            const [idA, idB] = [pair.a, pair.b]; // Accessing a and b from the object
            const entityA = this.world.getEntityById(idA);
            const entityB = this.world.getEntityById(idB);

            if (
              entityA &&
              entityB &&
              entityA.active &&
              entityB.active &&
              !entityA.toRemove &&
              !entityB.toRemove
            ) {
              let result: CollisionResult;
              // On the first iteration, we will use the pre-calculated result from the worker
              if (i === 0) {
                result = { normal: pair.normal, penetration: pair.penetration };
              } else {
                // On subsequent iterations, recalculate collision as positions have changed
                result = this.checkObjectObjectCollision(entityA, entityB);
              }

              if (result && result.penetration > 0) {
                this.resolveObjectObjectCollision(entityA, entityB, result);
                hasCollisions = true;
              } else {
                // If no collision is detected in this pass, remove it from the set
                uniqueCollisions.delete(pair);
              }
            } else {
              // If entities are no longer valid, remove the pair
              uniqueCollisions.delete(pair);
            }
          }
          // If no collisions were resolved in a pass, we can stop early
          if (!hasCollisions) break;
        }
      }
    } catch (error) {
      console.error('Error in collision worker:', error);
    }
  }

  // Check exact collision between two entities
  private checkObjectObjectCollision(
    entityA: Entity,
    entityB: Entity,
  ): { normal: [number, number]; penetration: number } | null {
    const transformA = entityA.getComponent<TransformComponent>(TransformComponent.componentName);
    const transformB = entityB.getComponent<TransformComponent>(TransformComponent.componentName);
    const shapeA = entityA.getComponent<ShapeComponent>(ShapeComponent.componentName);
    const shapeB = entityB.getComponent<ShapeComponent>(ShapeComponent.componentName);

    if (!transformA || !transformB || !shapeA || !shapeB) return null;

    const posA = transformA.getPosition();
    const posB = transformB.getPosition();
    const sizeA = shapeA.getSize();
    const sizeB = shapeB.getSize();
    const typeA = shapeA.getType();
    const typeB = shapeB.getType();

    return getCollisionNormalAndPenetration(posA, sizeA, typeA, posB, sizeB, typeB);
  }

  // Filters out duplicate collision pairs
  private filterUniqueCollisions(allCollisions: CollisionPair[]): Set<CollisionPair> {
    const uniquePairs = new Set<CollisionPair>();
    for (const pair of allCollisions) {
      // Assuming CollisionPair objects are referentially unique or can be stringified for Set uniqueness
      // For now, we will add the object directly if it has a consistent structure.
      // If simple string keys were used previously, ensure they are still compatible.
      uniquePairs.add(pair);
    }
    return uniquePairs;
  }

  /**
   * Resolve collision for two dynamic objects (balls) with iterative positional correction.
   * Moves both objects out of overlap along the Minimum Translation Vector (MTV) and reflects/dampens their velocities.
   *
   * @param entityA - The first entity involved in the collision.
   * @param entityB - The second entity involved in the collision.
   * @param result - The CollisionResult containing overlap and collision area information.
   */
  private resolveObjectObjectCollision(
    entityA: Entity,
    entityB: Entity,
    result: { normal: [number, number]; penetration: number },
  ) {
    const transformA = entityA.getComponent<TransformComponent>(TransformComponent.componentName);
    const transformB = entityB.getComponent<TransformComponent>(TransformComponent.componentName);
    const physicsA = entityA.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
    const physicsB = entityB.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
    const shapeA = entityA.getComponent<ShapeComponent>(ShapeComponent.componentName);
    const shapeB = entityB.getComponent<ShapeComponent>(ShapeComponent.componentName);

    if (!transformA || !transformB || !physicsA || !physicsB || !shapeA || !shapeB) return;

    // Wake up sleeping entities upon collision
    physicsA.wakeUp();
    physicsB.wakeUp();

    const POSITIONAL_CORRECTION_BIAS = 0.8;
    const SLOP = 0.01;

    const currentPosA = transformA.getPosition();
    const currentPosB = transformB.getPosition();
    const { normal, penetration } = result;

    if (penetration <= SLOP) return;

    // Apply positional correction
    const correctionAmount = (penetration - SLOP) * POSITIONAL_CORRECTION_BIAS;
    const pushX = (normal[0] * correctionAmount) / 2;
    const pushY = (normal[1] * correctionAmount) / 2;

    transformA.setPosition([currentPosA[0] + pushX, currentPosA[1] + pushY]);
    transformB.setPosition([currentPosB[0] - pushX, currentPosB[1] - pushY]);

    // Velocity reflection
    const velA = physicsA.getVelocity();
    const velB = physicsB.getVelocity();
    const relVelX = velB[0] - velA[0];
    const relVelY = velB[1] - velA[1];
    const velAlongNormal = relVelX * normal[0] + relVelY * normal[1];

    if (velAlongNormal > 0) {
      const restitution = 0.5;
      const impulse = (-(1 + restitution) * velAlongNormal) / 2;
      const impulseX = impulse * normal[0];
      const impulseY = impulse * normal[1];
      physicsA.setVelocity([velA[0] - impulseX, velA[1] - impulseY]);
      physicsB.setVelocity([velB[0] + impulseX, velB[1] + impulseY]);
    }

    // Clamp positions to viewport
    this.clampToViewport(entityA);
    this.clampToViewport(entityB);
  }

  // Clamps an entity's position to stay within the viewport boundaries
  private clampToViewport(entity: Entity) {
    const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
    const shape = entity.getComponent<ShapeComponent>(ShapeComponent.componentName);
    if (!transform || !shape) return;

    const viewport = this.getRenderSystem().getViewport();
    const size = shape.getSize();
    let [x, y] = transform.getPosition();

    if (x - size[0] / 2 < viewport[0]) {
      x = viewport[0] + size[0] / 2;
    }
    if (x + size[0] / 2 > viewport[0] + viewport[2]) {
      x = viewport[0] + viewport[2] - size[0] / 2;
    }
    if (y - size[1] / 2 < viewport[1]) {
      y = viewport[1] + size[1] / 2;
    }
    if (y + size[1] / 2 > viewport[1] + viewport[3]) {
      y = viewport[1] + viewport[3] - size[1] / 2;
    }
    transform.setPosition([x, y]);
  }
}
