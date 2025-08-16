import { PhysicsComponent, ShapeComponent, TransformComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';
import { RenderSystem } from '@ecs/systems';
import { Point, Size, Vec2 } from '@ecs/utils/types';

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
  constructor(private friction: number = 1) {
    super('BorderSystem', SystemPriorities.BORDER, 'logic');
    this.friction = friction;
  }

  private getRenderSystem(): RenderSystem {
    return RenderSystem.getInstance();
  }

  /**
   * Main update loop: checks object-obstacle collisions and applies elastic response.
   * @param deltaTime
   */
  update(deltaTime: number): void {
    // Ensure spatial grid is available
    if (!this.gridComponent) return;

    // Get all 'object' entities
    const objects = this.getWorld().getEntitiesByType('object');
    for (const entity of objects) {
      const physics = entity.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      const shape = entity.getComponent<ShapeComponent>(ShapeComponent.componentName);
      if (!physics || !transform || !shape) continue;

      const position = transform.getPosition();
      const size = shape.getSize();
      const shapeType = shape.getType ? shape.getType() : 'rect';
      // Use the larger of width/height as search radius (covers the whole object)
      const radius = Math.max(size[0], size[1]) / 2;

      // Query only nearby obstacles using spatial grid
      const nearbyObstacleIds = this.gridComponent.getNearbyEntities(position, radius, 'obstacle');
      for (const obstacleId of nearbyObstacleIds) {
        const obstacleEntity = this.getWorld().getEntityById(obstacleId);
        if (!obstacleEntity) continue;

        const obstacleTransform = obstacleEntity.getComponent<TransformComponent>(
          TransformComponent.componentName,
        );
        const obstacleShape = obstacleEntity.getComponent<ShapeComponent>(
          ShapeComponent.componentName,
        );
        if (!obstacleTransform || !obstacleShape) continue;

        const obstaclePos = obstacleTransform.getPosition();
        const obstacleSize = obstacleShape.getSize();
        const obstacleType = obstacleShape.getType ? obstacleShape.getType() : 'rect';

        // Use new collision normal and penetration calculation
        const collision = this.getCollisionNormalAndPenetration(
          position,
          size,
          shapeType,
          obstaclePos,
          obstacleSize,
          obstacleType,
        );
        if (collision) {
          const { normal, penetration } = collision;
          const velocity = physics.getVelocity();
          // Project velocity onto normal
          const dot = velocity[0] * normal[0] + velocity[1] * normal[1];
          // Reflect only the normal component (perfect elastic collision)
          const reflected: Vec2 = [
            velocity[0] - 2 * dot * normal[0],
            velocity[1] - 2 * dot * normal[1],
          ];

          physics.setVelocity(reflected); // No friction for perfect elastic collision
          // Push object out of obstacle by penetration depth along normal
          transform.setPosition([
            position[0] + normal[0] * penetration,
            position[1] + normal[1] * penetration,
          ]);

          // Ensure entity's AABB is fully inside the viewport after collision
          // This prevents any part of the entity from exceeding the visible area
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
    }
  }

  /**
   * Compute collision normal and penetration depth for separation and velocity reflection.
   * For AABB, returns the axis of minimum penetration and penetration depth.
   * @returns { normal: [nx, ny], penetration: number } or null if not colliding
   */
  private getCollisionNormalAndPenetration(
    posA: Point,
    sizeA: Size,
    typeA: string,
    posB: Point,
    sizeB: Size,
    typeB: string,
  ): { normal: [number, number]; penetration: number } | null {
    // For now, only AABB
    const dx = posA[0] - posB[0];
    const dy = posA[1] - posB[1];
    const px = (sizeA[0] + sizeB[0]) / 2 - Math.abs(dx);
    const py = (sizeA[1] + sizeB[1]) / 2 - Math.abs(dy);
    if (px < 0 || py < 0) return null; // no overlap
    // Find axis of minimum penetration and return normal and penetration depth
    if (px < py) {
      return { normal: [dx < 0 ? -1 : 1, 0], penetration: px };
    } else {
      return { normal: [0, dy < 0 ? -1 : 1], penetration: py };
    }
  }
}
