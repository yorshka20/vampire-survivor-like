import { MovementComponent, VelocityComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';

export class VelocitySystem extends System {
  constructor() {
    super('VelocitySystem', SystemPriorities.VELOCITY, 'render');
  }

  update(deltaTime: number): void {
    const entities = this.world.getEntitiesWithComponents([VelocityComponent, MovementComponent]);

    for (const entity of entities) {
      const velocity = entity.getComponent<VelocityComponent>(VelocityComponent.componentName);
      const movement = entity.getComponent<MovementComponent>(MovementComponent.componentName);

      // Update velocity based on acceleration and friction
      velocity.update(deltaTime);

      // Apply velocity to position
      const position = movement.getPosition();
      movement.setPosition([
        position[0] + velocity.velocity.x * deltaTime * 1000, // Use a larger multiplier for better responsiveness
        position[1] + velocity.velocity.y * deltaTime * 1000,
      ]);
    }
  }
}
