import { ChaseComponent, PhysicsComponent, TransformComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';

export class ChaseSystem extends System {
  constructor() {
    super('ChaseSystem', SystemPriorities.CHASE, 'logic');
  }

  update(deltaTime: number): void {
    const chasers = this.world.getEntitiesWithComponents([
      ChaseComponent,
      TransformComponent,
      PhysicsComponent,
    ]);

    // Convert deltaTime to seconds for smoother acceleration
    const dt = deltaTime;

    for (const chaser of chasers) {
      const chase = chaser.getComponent<ChaseComponent>(ChaseComponent.componentName);
      const transform = chaser.getComponent<TransformComponent>(TransformComponent.componentName);
      const physics = chaser.getComponent<PhysicsComponent>(PhysicsComponent.componentName);

      const target = this.world.getEntityById(chase.getConfig().targetId);
      if (!target) continue;

      const targetPos = target
        .getComponent<TransformComponent>(TransformComponent.componentName)
        .getPosition();
      const chaserPos = transform.getPosition();

      // Calculate direction to target
      const dx = targetPos[0] - chaserPos[0];
      const dy = targetPos[1] - chaserPos[1];
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Update speed based on distance
      chase.updateSpeed(dt, distance);

      // Calculate new velocity
      const currentSpeed = chase.getCurrentSpeed();
      if (currentSpeed > 0) {
        const normalizedDx = dx / distance;
        const normalizedDy = dy / distance;

        // Apply velocity with some smoothing
        const currentVelocity = physics.getVelocity();
        const targetVelocity = [normalizedDx * currentSpeed, normalizedDy * currentSpeed];

        // Smoothly interpolate between current and target velocity
        physics.setVelocity([
          currentVelocity[0] + (targetVelocity[0] - currentVelocity[0]) * 0.3,
          currentVelocity[1] + (targetVelocity[1] - currentVelocity[1]) * 0.3,
        ]);
      } else {
        // Stop completely when speed reaches 0
        physics.setVelocity([0, 0]);
      }
    }
  }
}
