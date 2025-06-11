import { AIComponent, MovementComponent, VelocityComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';

export class AISystem extends System {
  invokeTimeGap = 1000;

  constructor() {
    super('AISystem', SystemPriorities.AI, 'logic');
  }

  update(deltaTime: number): void {
    const aiEntities = this.world.getEntitiesWithComponents([AIComponent, MovementComponent]);

    for (const entity of aiEntities) {
      const ai = entity.getComponent<AIComponent>(AIComponent.componentName);
      const movement = entity.getComponent<MovementComponent>(MovementComponent.componentName);

      if (ai.behavior === 'chase' && ai.targetEntityId) {
        // Find target entity
        const targetEntity = this.world.getEntityById(ai.targetEntityId);
        if (!targetEntity) {
          continue;
        }

        const targetMovement = targetEntity.getComponent<MovementComponent>(
          MovementComponent.componentName,
        );
        if (!targetMovement) {
          continue;
        }

        const targetPos = targetMovement.getPosition();
        const currentPos = movement.getPosition();

        // Calculate direction to target
        const dx = targetPos[0] - currentPos[0];
        const dy = targetPos[1] - currentPos[1];
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
          // Normalize direction
          const dirX = dx / distance;
          const dirY = dy / distance;

          // Apply movement
          if (entity.hasComponent(VelocityComponent.componentName)) {
            const velocity = entity.getComponent<VelocityComponent>(
              VelocityComponent.componentName,
            );
            // Scale down AI speed
            const aiSpeed = ai.speed * 0.1;
            velocity.setVelocity({
              x: dirX * aiSpeed,
              y: dirY * aiSpeed,
            });
          } else {
            // Direct movement for entities without velocity component
            const aiSpeed = ai.speed * 0.1;
            movement.move(dirX * aiSpeed * deltaTime * 60, dirY * aiSpeed * deltaTime * 60);
          }
        }
      }
    }
  }
}
