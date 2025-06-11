import { ChaseComponent, MovementComponent, VelocityComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';

export class ChaseSystem extends System {
  constructor() {
    super('ChaseSystem', SystemPriorities.CHASE, 'logic');
  }

  update(deltaTime: number): void {
    const chasers = this.world.getEntitiesWithComponents([
      ChaseComponent,
      MovementComponent,
      VelocityComponent,
    ]);

    // Convert deltaTime to seconds for smoother acceleration
    const dt = deltaTime / 1000;

    for (const chaser of chasers) {
      const chase = chaser.getComponent<ChaseComponent>(ChaseComponent.componentName);
      const movement = chaser.getComponent<MovementComponent>(MovementComponent.componentName);
      const velocity = chaser.getComponent<VelocityComponent>(VelocityComponent.componentName);

      const target = this.world.getEntityById(chase.getConfig().targetId);
      if (!target) continue;

      const targetMovement = target.getComponent<MovementComponent>(
        MovementComponent.componentName,
      );
      if (!targetMovement) continue;

      const chaserPos = movement.getPosition();
      const targetPos = targetMovement.getPosition();

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
        const currentVelocity = velocity.getVelocity();
        const targetVelocity = {
          x: normalizedDx * currentSpeed,
          y: normalizedDy * currentSpeed,
        };

        // Smoothly interpolate between current and target velocity
        velocity.setVelocity({
          x: currentVelocity.x + (targetVelocity.x - currentVelocity.x) * 0.3,
          y: currentVelocity.y + (targetVelocity.y - currentVelocity.y) * 0.3,
        });
      } else {
        // Stop completely when speed reaches 0
        velocity.setVelocity({ x: 0, y: 0 });
      }
    }
  }
}
