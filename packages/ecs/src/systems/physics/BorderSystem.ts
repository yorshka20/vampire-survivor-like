import { PhysicsComponent, RenderComponent, TransformComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';
import { Point, Size, Viewport } from '@ecs/utils/types';

export class BorderSystem extends System {
  private viewport: Viewport;

  constructor(viewport: Viewport) {
    super('BorderSystem', SystemPriorities.BORDER, 'logic');
    this.viewport = viewport;
  }

  update(deltaTime: number): void {
    const entities = this.getWorld().getEntitiesByType('object');
    for (const entity of entities) {
      const physics = entity.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      const render = entity.getComponent<RenderComponent>(RenderComponent.componentName);
      if (!physics || !transform || !render) continue;

      const position = transform.getPosition();
      const size = render.getSize();

      // Compute half extents assuming shapes are drawn centered at transform position
      const halfW = size[0] / 2;
      const halfH = size[1] / 2;

      // Viewport is [x, y, width, height]
      const minX = this.viewport[0] + halfW;
      const minY = this.viewport[1] + halfH;
      const maxX = this.viewport[0] + this.viewport[2] - halfW;
      const maxY = this.viewport[1] + this.viewport[3] - halfH;

      let [px, py] = position;
      let [vx, vy] = physics.getVelocity();
      let collidedX = false;
      let collidedY = false;

      // Check horizontal bounds
      if (px < minX) {
        px = minX;
        collidedX = true;
      } else if (px > maxX) {
        px = maxX;
        collidedX = true;
      }

      // Check vertical bounds
      if (py < minY) {
        py = minY;
        collidedY = true;
      } else if (py > maxY) {
        py = maxY;
        collidedY = true;
      }

      if (collidedX || collidedY) {
        // Reflect velocity on the axis of collision (perfectly elastic)
        if (collidedX) vx = -vx;
        if (collidedY) vy = -vy;
        physics.setVelocity([vx, vy]);
        transform.setPosition([px, py]);
      }
    }
  }

  // Deprecated: previous check did not account for [x,y,width,height] and center-based rendering
  private isInViewport(position: Point, size: Size): boolean {
    return (
      position[0] > this.viewport[0] &&
      position[0] < this.viewport[2] &&
      position[1] > this.viewport[1] &&
      position[1] < this.viewport[3] &&
      position[0] + size[0] > this.viewport[0] &&
      position[0] < this.viewport[2] &&
      position[1] + size[1] > this.viewport[1] &&
      position[1] < this.viewport[3]
    );
  }
}
