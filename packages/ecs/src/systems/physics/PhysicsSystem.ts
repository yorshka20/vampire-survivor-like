import { PhysicsComponent, SpiralMovementComponent, TransformComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { RenderSystem } from '../rendering/RenderSystem';

export class PhysicsSystem extends System {
  constructor() {
    super('PhysicsSystem', SystemPriorities.PHYSICS, 'logic');
  }

  update(deltaTime: number): void {
    const entities = this.world.getEntitiesWithComponents([PhysicsComponent, TransformComponent]);

    for (const entity of entities) {
      // Update sleep state before any movement
      this.updateSleepState(entity, deltaTime);

      // If entity has spiral movement, update velocity based on spiral angle
      if (entity.hasComponent(SpiralMovementComponent.componentName)) {
        this.updateSpiralVelocity(entity, deltaTime);
      } else {
        // For non-spiral entities, use normal velocity-based movement
        this.updateLinearVelocity(entity, deltaTime);
      }
    }
  }

  /**
   * Update the sleep state of an entity based on its velocity.
   * If an entity's velocity is below a threshold for a certain amount of time, it will be put to sleep.
   *
   * @param entity The entity to update.
   * @param deltaTime The time since the last frame in seconds.
   */
  private updateSleepState(entity: Entity, deltaTime: number): void {
    const physics = entity.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
    if (!physics) return;

    // Entities that don't move (e.g., static obstacles) can be put to sleep immediately
    // and don't need velocity checks. For now, we assume all entities can move.
    const [vx, vy] = physics.getVelocity();
    const speed = Math.sqrt(vx * vx + vy * vy);

    if (speed < physics.SLEEP_VELOCITY_THRESHOLD) {
      // Increment sleep timer if velocity is low
      physics.sleepTimer += deltaTime * 1000; // deltaTime is in seconds, timer is in ms
      if (physics.sleepTimer >= physics.SLEEP_TIME_THRESHOLD) {
        physics.isSleeping = true;
      }
    } else {
      // If velocity is above threshold, wake up the entity
      physics.wakeUp();
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

    // Skip position integration if the entity is sleeping
    if (physics.isAsleep()) {
      return;
    }

    // Allow PhysicsComponent internal timers to update (expects seconds)
    physics.update(deltaTime);

    // Integrate position using velocity in units/second and delta time in seconds
    const position = transform.getPosition();
    const [vx, vy] = physics.getVelocity();
    let newX = position[0] + vx * deltaTime;
    let newY = position[1] + vy * deltaTime;

    // --- Clamp position to viewport (prevent entity from being pushed out of screen) ---
    const renderSystem = RenderSystem.getInstance();
    if (renderSystem) {
      const viewport = renderSystem.getViewport(); // [x, y, w, h]
      let w = 0,
        h = 0;
      const shape = entity.getComponent<any>('Shape');
      if (shape && shape.getSize) {
        [w, h] = shape.getSize();
      }
      // Clamp so that the entire AABB stays within the viewport
      if (newX - w / 2 < viewport[0]) newX = viewport[0] + w / 2;
      if (newX + w / 2 > viewport[0] + viewport[2]) newX = viewport[0] + viewport[2] - w / 2;
      if (newY - h / 2 < viewport[1]) newY = viewport[1] + h / 2;
      if (newY + h / 2 > viewport[1] + viewport[3]) newY = viewport[1] + viewport[3] - h / 2;
    }
    // ----------------------------------------------------------------------------------

    transform.setPosition([newX, newY]);
  }
}
