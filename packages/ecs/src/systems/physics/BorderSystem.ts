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
import { Vec2 } from '@ecs/utils/types';

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

  constructor(private friction: number = 1) {
    super('BorderSystem', SystemPriorities.BORDER, 'logic');
    this.friction = friction;

    this.workerPoolManager = WorkerPoolManager.getInstance();
  }

  private getRenderSystem(): RenderSystem {
    return RenderSystem.getInstance();
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
    // Ensure spatial grid is available
    if (!this.gridComponent) return;

    // Get the grid map from SpatialGridComponent
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
    grid: Map<string, { objects: Set<string>; obstacles?: Set<string> }>,
  ): Promise<CollisionPair[]>[] {
    const simpleEntities: Record<string, SimpleEntity> = {};
    const objectEntities: Entity[] = [];
    const obstacleEntities: Entity[] = [];

    const objectIds = new Set<string>();
    const obstacleIds = new Set<string>();

    // Collect unique object and obstacle IDs from the grid
    for (const cell of grid.values()) {
      if (cell.objects) {
        for (const id of cell.objects) {
          objectIds.add(id);
        }
      }
      if (cell.obstacles) {
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
          };
          obstacleEntities.push(entity);
        }

        if (simpleEntity) {
          simpleEntities[entity.id] = simpleEntity;
        }
      }
    }

    const cellKeys = Array.from(grid.keys());
    if (cellKeys.length === 0 || objectEntities.length === 0 || obstacleEntities.length === 0)
      return [];

    // Divide the grid cells among the workers
    const workerCount = this.workerPoolManager.getWorkerCount();
    const cellsPerWorker = Math.ceil(cellKeys.length / workerCount);

    // Submit tasks to the WorkerPoolManager
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
              pairMode: 'object-obstacle', // Only check object-obstacle collisions in BorderSystem
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
      // Filter out invalid collisions (e.g., if entity was removed during worker processing)
      const validCollisions = allCollisions.filter(
        (pair) => pair.normal && pair.penetration !== undefined,
      ) as CollisionPair[];

      for (const collision of validCollisions) {
        const { a: objectId, b: obstacleId, normal, penetration } = collision;
        const objectEntity = this.getWorld().getEntityById(objectId);

        if (
          !objectEntity ||
          !objectEntity.active ||
          objectEntity.toRemove ||
          !normal ||
          penetration === undefined
        ) {
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
        // Clamp to viewport
        this.ensureEntityInViewport(shape, transform);
      }
    } catch (error) {
      console.error('Error in collision worker for BorderSystem:', error);
    }
  }

  /**
   * Ensure entity's AABB is fully inside the viewport after collision
   * @param shape - The ShapeComponent of the entity.
   * @param transform - The TransformComponent of the entity.
   */
  private ensureEntityInViewport(shape: ShapeComponent, transform: TransformComponent): void {
    const viewport = this.getRenderSystem().getViewport();
    const [w, h] = shape.getSize();
    let [nx, ny] = transform.getPosition();
    // Clamp so that the entire AABB stays within the viewport
    if (nx - w / 2 < viewport[0]) nx = viewport[0] + w / 2;
    if (nx + w / 2 > viewport[0] + viewport[2]) nx = viewport[0] + viewport[2] - w / 2;
    if (ny - h / 2 < viewport[1]) ny = viewport[1] + h / 2;
    if (ny + h / 2 > viewport[1] + viewport[3]) ny = viewport[1] + viewport[3] - h / 2;
    if (nx !== transform.getPosition()[0] || ny !== transform.getPosition()[1]) {
      transform.setPosition([nx, ny]);
    }
  }
}
