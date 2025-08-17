import {
  ColliderComponent,
  PhysicsComponent,
  ShapeComponent,
  TransformComponent,
} from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { CollisionPair, SimpleEntity, WorkerPoolManager } from '@ecs/core/worker';
import { RenderSystem } from '@ecs/systems';
import { RectArea } from '@ecs/utils/types';

// Type definition for a pair of colliding entity IDs
// Simplified entity data structure for sending to workers

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
  private defaultCollisionArea: RectArea = [0, 0, 0, 0];
  private workerPoolManager: WorkerPoolManager;

  constructor(private positionalCorrectTimes: number = 10) {
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
    const allEntities = this.world.entities;
    const simpleEntities: Record<string, SimpleEntity> = {};
    const objectEntities: Entity[] = [];

    // Prepare a simplified dataset for the workers
    for (const entity of allEntities) {
      if (entity.isType('object') && entity.active && !entity.toRemove) {
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
            type: entity.type,
          };
          objectEntities.push(entity);
        }
      }
    }

    const cellKeys = Array.from(grid.keys());
    if (cellKeys.length === 0 || objectEntities.length < 2) return [];

    // Divide the grid cells among the workers
    const workerCount = this.workerPoolManager.getWorkerCount();
    const cellsPerWorker = Math.ceil(cellKeys.length / workerCount);
    const activePromises: Promise<CollisionPair[]>[] = [];
    for (let i = 0; i < workerCount; i++) {
      const start = i * cellsPerWorker;
      const end = start + cellsPerWorker;
      const assignedCellKeys = cellKeys.slice(start, end);

      if (assignedCellKeys.length > 0) {
        activePromises.push(
          this.workerPoolManager.submitTask(
            {
              entities: simpleEntities,
              cellKeys: assignedCellKeys,
              grid: grid,
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
              const result = this.checkExactCollision(entityA, entityB);
              if (result) {
                this.resolveObjectObjectCollision(entityA, entityB, result);
                hasCollisions = true;
              } else {
                // If no collision is detected in this pass, remove it from the set
                uniqueCollisions.delete(pair);
              }
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

  // Check exact collision between two entities (AABB)
  private checkExactCollision(
    entity1: Entity,
    entity2: Entity,
  ): { overlapX: number; overlapY: number } | null {
    const transform1 = entity1.getComponent<TransformComponent>(TransformComponent.componentName);
    const transform2 = entity2.getComponent<TransformComponent>(TransformComponent.componentName);
    const collider1 = entity1.getComponent<ColliderComponent>(ColliderComponent.componentName);
    const collider2 = entity2.getComponent<ColliderComponent>(ColliderComponent.componentName);

    if (!transform1 || !transform2 || !collider1 || !collider2) return null;

    const area1 = collider1.getCollisionArea(transform1.getPosition(), this.defaultCollisionArea);
    const area2 = collider2.getCollisionArea(transform2.getPosition(), this.defaultCollisionArea);

    const isColliding =
      area1[0] < area2[0] + area2[2] &&
      area1[0] + area1[2] > area2[0] &&
      area1[1] < area2[1] + area2[3] &&
      area1[1] + area1[3] > area2[1];

    if (!isColliding) return null;

    return {
      overlapX: Math.min(area1[0] + area1[2], area2[0] + area2[2]) - Math.max(area1[0], area2[0]),
      overlapY: Math.min(area1[1] + area1[3], area2[1] + area2[3]) - Math.max(area1[1], area2[1]),
    };
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

  // Creates a consistent key for a pair of IDs
  private getPairKey(idA: string, idB: string): string {
    return idA < idB ? `${idA},${idB}` : `${idB},${idA}`;
  }

  // Decodes a pair key back into two IDs
  private decodePairKey(key: string): [string, string] {
    return key.split(',') as [string, string];
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
    result: { overlapX: number; overlapY: number },
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

    // Calculate the distance between centers
    const dx = currentPosB[0] - currentPosA[0];
    const dy = currentPosB[1] - currentPosA[1];
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Get radii
    const radiusA = shapeA.getSize()[0] / 2;
    const radiusB = shapeB.getSize()[0] / 2;
    const separationDistance = radiusA + radiusB;
    const overlap = separationDistance - dist;

    if (overlap <= SLOP) return;

    // Normalize the direction vector
    const invDist = dist === 0 ? 0 : 1 / dist;
    const nx = dx * invDist;
    const ny = dy * invDist;

    // Apply positional correction
    const correctionAmount = (overlap - SLOP) * POSITIONAL_CORRECTION_BIAS;
    const pushX = (nx * correctionAmount) / 2;
    const pushY = (ny * correctionAmount) / 2;

    transformA.setPosition([currentPosA[0] - pushX, currentPosA[1] - pushY]);
    transformB.setPosition([currentPosB[0] + pushX, currentPosB[1] + pushY]);

    // Velocity reflection
    const velA = physicsA.getVelocity();
    const velB = physicsB.getVelocity();
    const relVelX = velB[0] - velA[0];
    const relVelY = velB[1] - velA[1];
    const velAlongNormal = relVelX * nx + relVelY * ny;

    if (velAlongNormal < 0) {
      const restitution = 0.5;
      const impulse = (-(1 + restitution) * velAlongNormal) / 2;
      const impulseX = impulse * nx;
      const impulseY = impulse * ny;
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
