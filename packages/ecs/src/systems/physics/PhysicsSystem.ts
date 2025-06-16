import { PhysicsComponent, SpiralMovementComponent, TransformComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';

export class PhysicsSystem extends System {
  constructor() {
    super('PhysicsSystem', SystemPriorities.PHYSICS, 'logic');
  }

  update(deltaTime: number): void {
    const entities = this.world.getEntitiesWithComponents([PhysicsComponent, TransformComponent]);

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
    const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
    const velocity = entity.getComponent<PhysicsComponent>(PhysicsComponent.componentName);

    // Update spiral center to follow the player if needed
    const player = this.world.getEntitiesByType('player')[0];
    if (player && spiralMovement.getFollowPlayer()) {
      const playerTransform = player.getComponent<TransformComponent>(
        TransformComponent.componentName,
      );
      if (playerTransform) {
        const playerPos = playerTransform.getPosition();
        spiralMovement.updateCenter(playerPos[0], playerPos[1]);
      }
    }

    // Update spiral movement (this updates the angle and radius)
    spiralMovement.update(deltaTime);

    // Set the position directly to the spiral position
    const spiralPos = spiralMovement.getPosition();
    transform.setPosition([spiralPos[0], spiralPos[1]]);

    // Set the velocity for collision and other systems that need it
    const spiralVelocity = spiralMovement.getVelocity();
    velocity.setVelocity([spiralVelocity[0], spiralVelocity[1]]);
  }

  private updateLinearVelocity(entity: Entity, deltaTime: number): void {
    const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
    const physics = entity.getComponent<PhysicsComponent>(PhysicsComponent.componentName);

    physics.update(deltaTime);

    const position = transform.getPosition();
    let newX = position[0] + physics.getVelocity()[0] * (deltaTime * 1000);
    let newY = position[1] + physics.getVelocity()[1] * (deltaTime * 1000);
    transform.setPosition([newX, newY]);
  }
}
