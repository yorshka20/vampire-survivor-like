import { MovementComponent, SpiralMovementComponent, VelocityComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';

export class VelocitySystem extends System {
  constructor() {
    super('VelocitySystem', SystemPriorities.VELOCITY, 'logic');
  }

  update(deltaTime: number): void {
    const entities = this.world.getEntitiesWithComponents([MovementComponent, VelocityComponent]);

    for (const entity of entities) {
      const movement = entity.getComponent<MovementComponent>(MovementComponent.componentName);
      const velocity = entity.getComponent<VelocityComponent>(VelocityComponent.componentName);

      if (!movement || !velocity) continue;

      // Update velocity based on acceleration and friction
      velocity.update(deltaTime);

      // Get current position
      const position = movement.getPosition();

      // Calculate new position based on velocity
      let newX = position[0] + velocity.getVelocity().x * (deltaTime * 1000);
      let newY = position[1] + velocity.getVelocity().y * (deltaTime * 1000);

      // If entity has spiral movement, apply spiral offset
      if (entity.hasComponent(SpiralMovementComponent.componentName)) {
        const spiralMovement = entity.getComponent<SpiralMovementComponent>(
          SpiralMovementComponent.componentName,
        );
        // Update spiral movement
        spiralMovement.update(deltaTime);

        // Get spiral offset
        const offset = spiralMovement.getOffset();

        // Add spiral offset to the velocity-based position
        newX += offset.x;
        newY += offset.y;
      }

      // Update position
      movement.setPosition([newX, newY]);
    }
  }
}
