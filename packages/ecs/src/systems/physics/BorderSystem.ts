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
import { Vec2, Viewport } from '@ecs/types/types';
import { CollisionPair } from './collision/collisionUtils';

/**
 * BorderSystem handles elastic collision (with friction) between 'object' entities and nearby 'obstacle' entities.
 *
 * - Uses SpatialGridComponent to efficiently query only nearby obstacles for each object.
 * - No longer maintains a global obstacle cache; obstacle management is handled by the spatial grid.
 * - On collision, reflects velocity along collision normal and applies friction.
 *
 * This approach greatly improves performance in large maps or with many obstacles, as only spatially relevant obstacles are checked.
 */
export class BorderSystem extends System {
  private workerPoolManager: WorkerPoolManager;

  // Optional hard play-area bounds [x, y, width, height]. When set, every object
  // is clamped back inside each frame regardless of obstacle collision. This is a
  // guaranteed containment net: obstacle (wall) collision alone leaks — a fast
  // object can tunnel through a wall in one step, or the spatial grid may never
  // pair it with a wall, and once outside nothing pushes it back.
  private bounds: Viewport | null = null;

  private borderCells: string[] = [];

  constructor(private friction: number = 1) {
    super('BorderSystem', SystemPriorities.BORDER, 'logic');
    this.friction = friction;

    this.workerPoolManager = WorkerPoolManager.getInstance();
  }

  /**
   * Set the hard containment bounds (the play area). Pass null to disable
   * clamping and rely solely on obstacle collision.
   */
  setBounds(bounds: Viewport | null): void {
    this.bounds = bounds;
    this.updateBorderCells();
  }

  private updateBorderCells() {
    const cellSize = this.world.spatialCellSize;
    const cells: string[] = [];
    const [x, y, w, h] = this.bounds ?? [0, 0, 0, 0];
    for (let i = x; i <= x + w; i = i + cellSize) {
      for (let j = y; j <= y + h; j = j + cellSize) {
        cells.push(`${Math.floor(i / cellSize)},${Math.floor(j / cellSize)}`);
      }
    }
    this.borderCells = cells;
  }

  /**
   * Main update loop: checks object-obstacle collisions by traversing spatial grid cells.
   * For each cell, checks all object-obstacle pairs within the cell and its 8 neighbors.
   * Uses a Set to avoid duplicate pair checks (since entities may span multiple cells).
   *
   * This approach improves performance for large maps or many entities by leveraging spatial locality.
   * @param deltaTime
   */
  async update(deltaTime: number): Promise<void> {
    // Elastic bounce off obstacle (wall) entities via the spatial grid.
    if (this.borderCells.length) {
      const activePromises = this.startCollisionDetection(this.borderCells);
      if (activePromises.length > 0) {
        await this.handleWorkerResults(activePromises);
      }
    }

    // Guaranteed containment: clamp any object that escaped the play area back in.
    this.clampObjectsToBounds();
  }

  /**
   * Push every object back inside the play-area bounds. Runs after physics has
   * moved entities this frame (BORDER > PHYSICS/TRANSFORM in priority), so it sees
   * final positions. Unlike obstacle collision this cannot be tunnelled through:
   * an object past the edge is snapped to it and its outward velocity reflected.
   */
  private clampObjectsToBounds(): void {
    const bounds = this.bounds;
    if (!bounds) return;

    const minX = bounds[0];
    const minY = bounds[1];
    const maxX = bounds[0] + bounds[2];
    const maxY = bounds[1] + bounds[3];

    const objects = this.world.getEntitiesByCondition(
      (entity) => entity.active && !entity.toRemove && entity.isType('object'),
    );

    for (const entity of objects) {
      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      const physics = entity.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
      const shape = entity.getComponent<ShapeComponent>(ShapeComponent.componentName);
      if (!transform || !physics || !shape) continue;

      const pos = transform.getPosition();
      const size = shape.getSize();
      const rx = size[0] / 2;
      const ry = size[1] / 2;

      const vel = physics.getVelocity();
      let x = pos[0];
      let y = pos[1];
      let vx = vel[0];
      let vy = vel[1];
      let hit = false;

      if (x - rx < minX) {
        x = minX + rx;
        if (vx < 0) {
          vx = -vx * this.friction;
        }
        hit = true;
      } else if (x + rx > maxX) {
        x = maxX - rx;
        if (vx > 0) {
          vx = -vx * this.friction;
        }
        hit = true;
      }

      if (y - ry < minY) {
        y = minY + ry;
        if (vy < 0) {
          vy = -vy * this.friction;
        }
        hit = true;
      } else if (y + ry > maxY) {
        y = maxY - ry;
        if (vy > 0) {
          vy = -vy * this.friction;
        }
        hit = true;
      }

      if (hit) {
        transform.setPosition([x, y]);
        physics.setVelocity([vx, vy]);
        physics.wakeUp();
      }
    }
  }

  // Distributes collision detection tasks to the workers
  private startCollisionDetection(grid: string[]): Promise<CollisionPair[]>[] {
    const simpleEntities: Record<string, SimpleEntity> = {};
    const objectEntities: Entity[] = [];
    const obstacleEntities: Entity[] = [];

    const objectIds = new Set<string>();
    const obstacleIds = new Set<string>();

    // Collect unique object and obstacle IDs from the grid
    for (const key of grid) {
      const cell = this.gridComponent?.getCellByKey(key);
      if (cell?.objects) {
        for (const id of cell.objects) {
          objectIds.add(id);
        }
      }
      if (cell?.obstacles) {
        for (const id of cell.obstacles) {
          obstacleIds.add(id);
        }
      }
    }

    const allEntityIds = [...objectIds, ...obstacleIds];

    // Prepare a simplified dataset for the workers
    for (const entityId of allEntityIds) {
      const entity = this.world.getEntityById(entityId);
      if (entity && entity.active && !entity.toRemove) {
        const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
        const shape = entity.getComponent<ShapeComponent>(ShapeComponent.componentName);

        if (!transform || !shape) continue;

        let simpleEntity: SimpleEntity | null = null;
        const position = transform.getPosition();
        const size = shape.getSize();

        if (entity.isType('object')) {
          const collider = entity.getComponent<ColliderComponent>(ColliderComponent.componentName);
          const physics = entity.getComponent<PhysicsComponent>(PhysicsComponent.componentName);

          if (collider && physics) {
            simpleEntity = {
              id: entity.id,
              numericId: entity.numericId,
              isAsleep: physics.isAsleep(),
              position: position,
              collisionArea: collider.getCollisionArea(position, [0, 0, 0, 0]),
              size: size,
              type: shape.getType(),
              entityType: 'object',
            };
            objectEntities.push(entity);
          }
        } else if (entity.isType('obstacle')) {
          simpleEntity = {
            id: entity.id,
            numericId: entity.numericId,
            isAsleep: true, // Obstacles don't move, so they are effectively asleep
            position: position,
            // For obstacles without a collider, we can derive a collision area from their shape
            collisionArea: [position[0] - size[0] / 2, position[1] - size[1] / 2, size[0], size[1]],
            size: size,
            type: shape.getType(),
            entityType: 'obstacle',
          };
          obstacleEntities.push(entity);
        }

        if (simpleEntity) {
          simpleEntities[entity.id] = simpleEntity;
        }
      }
    }

    // Generate all unique object-obstacle pairs
    const pairs: { a: string; b: string }[] = [];
    const checkedPairs = new Set<string>();

    for (const cellKey of grid) {
      const cell = this.gridComponent?.getCellByKey(cellKey);
      if (!cell || !cell.objects || !cell.obstacles) continue;

      const neighborKeys: string[] = [];
      const [cellX, cellY] = cellKey.split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          neighborKeys.push(`${cellX + dx},${cellY + dy}`);
        }
      }

      const nearbyObstacles = new Set<string>();
      for (const key of neighborKeys) {
        const neighborCell = this.gridComponent?.getCellByKey(key);
        if (neighborCell && neighborCell.obstacles) {
          for (const obsId of neighborCell.obstacles) {
            nearbyObstacles.add(obsId);
          }
        }
      }

      for (const objId of cell.objects) {
        for (const obsId of nearbyObstacles) {
          const pairKey = objId < obsId ? `${objId},${obsId}` : `${obsId},${objId}`;
          if (!checkedPairs.has(pairKey)) {
            pairs.push({ a: objId, b: obsId });
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
        // Collect only the entities needed for this worker's pairs
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
            'collision',
            {
              entities: workerEntities,
              pairs: assignedPairs,
              pairMode: 'object-obstacle' as const,
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
      for (const collision of allCollisions) {
        // Filter out invalid collisions (e.g., if entity was removed during worker processing)
        if (collision.normal === undefined || collision.penetration === undefined) continue;

        const { a: objectId, b: obstacleId, normal, penetration } = collision;
        const objectEntity = this.getWorld().getEntityById(objectId);

        if (!objectEntity || !objectEntity.active || objectEntity.toRemove) {
          continue;
        }

        const physics = objectEntity.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
        const transform = objectEntity.getComponent<TransformComponent>(
          TransformComponent.componentName,
        );
        const shape = objectEntity.getComponent<ShapeComponent>(ShapeComponent.componentName);

        if (!physics || !transform || !shape) continue;

        const velocity = physics.getVelocity();
        const position = transform.getPosition();

        // Project velocity onto normal
        const dot = velocity[0] * normal[0] + velocity[1] * normal[1];
        // Reflect only the normal component (with friction)
        const reflected: Vec2 = [
          (velocity[0] - 2 * dot * normal[0]) * this.friction,
          (velocity[1] - 2 * dot * normal[1]) * this.friction,
        ];
        physics.setVelocity(reflected);

        // Push object out of obstacle by penetration depth along normal
        transform.setPosition([
          position[0] + normal[0] * penetration,
          position[1] + normal[1] * penetration,
        ]);
      }
    } catch (error) {
      console.error('Error in collision worker for BorderSystem:', error);
    }
  }
}
