import {
  ColliderComponent,
  PhysicsComponent,
  ShapeComponent,
  TransformComponent,
} from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { RenderSystem } from '@ecs/systems';
import { RectArea } from '@ecs/utils/types';

// Type definition for a pair of colliding entity IDs
type CollisionPair = [string, string];

// Simplified entity data structure for sending to workers
interface SimpleEntity {
  id: string;
  numericId: number;
  isAsleep: boolean;
  position: [number, number];
  collisionArea: [number, number, number, number];
  size: [number, number];
}

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
  private workers: Worker[] = [];
  private activePromises: Promise<CollisionPair[]>[] = [];
  private defaultCollisionArea: RectArea = [0, 0, 0, 0];

  constructor(
    private positionalCorrectTimes: number = 10,
    workerCount: number = 0,
  ) {
    super('ParallelCollisionSystem', SystemPriorities.COLLISION, 'logic');

    // Default to navigator.hardwareConcurrency if workerCount is not specified
    const numWorkers = workerCount > 0 ? workerCount : navigator.hardwareConcurrency || 2;

    for (let i = 0; i < numWorkers; i++) {
      // Vite specific syntax for creating a worker
      const worker = new Worker(new URL('./collision.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.workers.push(worker);
    }
  }

  private getRenderSystem(): RenderSystem {
    return RenderSystem.getInstance();
  }

  // Teardown workers when the system is removed
  onRemove(): void {
    this.workers.forEach((worker) => worker.terminate());
  }

  // Main update loop
  async update(deltaTime: number): Promise<void> {
    // Wait for any pending worker promises from the previous frame to complete
    if (this.activePromises.length > 0) {
      await this.handleWorkerResults();
    }

    if (!this.gridComponent) return;

    const grid = this.gridComponent.grid;
    if (!grid || grid.size === 0) return;

    // Start the collision detection process for the current frame
    this.startCollisionDetection(grid);
  }

  // Distributes collision detection tasks to the workers
  private startCollisionDetection(grid: Map<string, { objects: Set<string> }>) {
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
          };
          objectEntities.push(entity);
        }
      }
    }

    const cellKeys = Array.from(grid.keys());
    if (cellKeys.length === 0 || objectEntities.length < 2) return;

    // Divide the grid cells among the workers
    const cellsPerWorker = Math.ceil(cellKeys.length / this.workers.length);
    this.activePromises = this.workers.map((worker, index) => {
      const start = index * cellsPerWorker;
      const end = start + cellsPerWorker;
      const assignedCellKeys = cellKeys.slice(start, end);

      return new Promise<CollisionPair[]>((resolve, reject) => {
        // Handle worker responses
        const onMessage = (event: MessageEvent<CollisionPair[]>) => {
          resolve(event.data);
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
        };
        const onError = (error: ErrorEvent) => {
          reject(error);
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
        };

        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);

        // Send data to the worker
        worker.postMessage({
          entities: simpleEntities,
          cellKeys: assignedCellKeys,
          grid: grid,
        });
      });
    });
  }

  // Awaits and processes results from all workers
  private async handleWorkerResults() {
    try {
      const results = await Promise.all(this.activePromises);
      this.activePromises = []; // Clear promises for the next frame

      const allCollisions = results.flat();
      const uniqueCollisions = this.filterUniqueCollisions(allCollisions);

      if (uniqueCollisions.size > 0) {
        // The resolution process is iterative
        for (let i = 0; i < this.positionalCorrectTimes; i++) {
          let hasCollisions = false;
          for (const pairKey of uniqueCollisions) {
            const [idA, idB] = this.decodePairKey(pairKey);
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
                uniqueCollisions.delete(pairKey);
              }
            }
          }
          // If no collisions were resolved in a pass, we can stop early
          if (!hasCollisions) break;
        }
      }
    } catch (error) {
      console.error('Error in collision worker:', error);
      this.activePromises = [];
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
  private filterUniqueCollisions(allCollisions: CollisionPair[]): Set<string> {
    const uniquePairs = new Set<string>();
    for (const [idA, idB] of allCollisions) {
      uniquePairs.add(this.getPairKey(idA, idB));
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
