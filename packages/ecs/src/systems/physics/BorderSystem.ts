import { PhysicsComponent, ShapeComponent, TransformComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';
import { Point, Size } from '@ecs/utils/types';

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

        if (
          this.checkCollision(position, size, shapeType, obstaclePos, obstacleSize, obstacleType)
        ) {
          // Compute collision normal and reflect velocity
          const velocity = physics.getVelocity();
          const normal = this.getCollisionNormal(
            position,
            size,
            shapeType,
            obstaclePos,
            obstacleSize,
            obstacleType,
          );
          if (normal) {
            // Reflect velocity along normal, apply friction
            const dot = velocity[0] * normal[0] + velocity[1] * normal[1];
            const reflected = [
              velocity[0] - 2 * dot * normal[0],
              velocity[1] - 2 * dot * normal[1],
            ];
            physics.setVelocity([reflected[0] * this.friction, reflected[1] * this.friction]);
            // Push object out of obstacle along normal (simple separation)
            transform.setPosition([position[0] + normal[0], position[1] + normal[1]]);
          }
        }
      }
    }
  }

  /**
   * Basic AABB collision for rectangles, circle-rect, or circle-circle (expand as needed).
   * @returns true if collision detected
   */
  private checkCollision(
    posA: Point,
    sizeA: Size,
    typeA: string,
    posB: Point,
    sizeB: Size,
    typeB: string,
  ): boolean {
    // For now, treat all as AABB (rect-rect)
    // TODO: Add circle-rect and circle-circle support if needed
    const minA = [posA[0] - sizeA[0] / 2, posA[1] - sizeA[1] / 2];
    const maxA = [posA[0] + sizeA[0] / 2, posA[1] + sizeA[1] / 2];
    const minB = [posB[0] - sizeB[0] / 2, posB[1] - sizeB[1] / 2];
    const maxB = [posB[0] + sizeB[0] / 2, posB[1] + sizeB[1] / 2];
    return minA[0] < maxB[0] && maxA[0] > minB[0] && minA[1] < maxB[1] && maxA[1] > minB[1];
  }

  /**
   * Compute collision normal for separation and velocity reflection.
   * For AABB, returns the axis of minimum penetration.
   * @returns [nx, ny] or null if not colliding
   */
  private getCollisionNormal(
    posA: Point,
    sizeA: Size,
    typeA: string,
    posB: Point,
    sizeB: Size,
    typeB: string,
  ): [number, number] | null {
    // For now, only AABB
    const dx = posA[0] - posB[0];
    const dy = posA[1] - posB[1];
    const px = (sizeA[0] + sizeB[0]) / 2 - Math.abs(dx);
    const py = (sizeA[1] + sizeB[1]) / 2 - Math.abs(dy);
    if (px < 0 || py < 0) return null; // no overlap
    // Find axis of minimum penetration
    if (px < py) {
      return [dx < 0 ? -1 : 1, 0];
    } else {
      return [0, dy < 0 ? -1 : 1];
    }
  }
}
