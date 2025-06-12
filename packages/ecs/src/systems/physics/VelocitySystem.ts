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

    // Update spiral movement
    spiralMovement.update(deltaTime);

    // get the center point (player position)
    const center = spiralMovement.getCenter();
    const position = movement.getPosition();

    // calculate the vector from the center to the trajectory
    const dx = position[0] - center.x;
    const dy = position[1] - center.y;

    // calculate the direction perpendicular to the vector (rotate 90 degrees)
    const perpendicularX = -dy;
    const perpendicularY = dx;

    // normalize the direction vector
    const length = Math.sqrt(perpendicularX * perpendicularX + perpendicularY * perpendicularY);
    const normalizedX = perpendicularX / length;
    const normalizedY = perpendicularY / length;

    // set velocity
    const speed = spiralMovement.getSpeed();
    velocity.setVelocity({
      x: normalizedX * speed,
      y: normalizedY * speed,
    });

    // Update position based on velocity
    const newX = position[0] + velocity.getVelocity().x * (deltaTime * 1000);
    const newY = position[1] + velocity.getVelocity().y * (deltaTime * 1000);
    movement.setPosition([newX, newY]);

    // Update spiral center to follow the player
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
