import { MovementComponent, SpiralMovementComponent, VelocityComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';

export class VelocitySystem extends System {
  constructor() {
    super('VelocitySystem', SystemPriorities.VELOCITY, 'logic');
  }

  update(deltaTime: number): void {
    const entities = this.world.getEntitiesWithComponents([MovementComponent, VelocityComponent]);

    for (const entity of entities) {
      // If entity has spiral movement, update velocity based on spiral angle
      if (entity.hasComponent(SpiralMovementComponent.componentName)) {
        this.updateSpiralVelocity(entity, deltaTime);
      } else {
        // For non-spiral entities, use normal velocity-based movement
        this.updateLinearVelocity(entity, deltaTime);
      }
    }
  }

  private updateSpiralVelocity(entity: Entity, deltaTime: number): void {
    const spiralMovement = entity.getComponent<SpiralMovementComponent>(
      SpiralMovementComponent.componentName,
    );
    const movement = entity.getComponent<MovementComponent>(MovementComponent.componentName);
    const velocity = entity.getComponent<VelocityComponent>(VelocityComponent.componentName);

    // Update spiral center to follow the player if needed
    const player = this.world.getEntitiesByType('player')[0];
    if (player && spiralMovement.getFollowPlayer()) {
      const playerMovement = player.getComponent<MovementComponent>(
        MovementComponent.componentName,
      );
      if (playerMovement) {
        const playerPos = playerMovement.getPosition();
        spiralMovement.updateCenter(playerPos[0], playerPos[1]);
      }
    }

    // Update spiral movement (this updates the angle and radius)
    spiralMovement.update(deltaTime);

    // Set the position directly to the spiral position
    const spiralPos = spiralMovement.getPosition();
    movement.setPosition([spiralPos.x, spiralPos.y]);

    // Set the velocity for collision and other systems that need it
    const spiralVelocity = spiralMovement.getVelocity();
    velocity.setVelocity({
      x: spiralVelocity.x,
      y: spiralVelocity.y,
    });
  }

  private updateLinearVelocity(entity: Entity, deltaTime: number): void {
    const movement = entity.getComponent<MovementComponent>(MovementComponent.componentName);
    const velocity = entity.getComponent<VelocityComponent>(VelocityComponent.componentName);

    velocity.update(deltaTime);

    const position = movement.getPosition();
    let newX = position[0] + velocity.getVelocity().x * (deltaTime * 1000);
    let newY = position[1] + velocity.getVelocity().y * (deltaTime * 1000);
    movement.setPosition([newX, newY]);
  }
}
