import { AIComponent, PhysicsComponent, TransformComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';

export class AISystem extends System {
  invokeTimeGap = 1000;

  constructor() {
    super('AISystem', SystemPriorities.AI, 'logic');
  }

  update(deltaTime: number): void {
    const aiEntities = this.world.getEntitiesWithComponents([AIComponent, TransformComponent]);

    for (const entity of aiEntities) {
      const ai = entity.getComponent<AIComponent>(AIComponent.componentName);
      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);

      if (ai.behavior === 'chase' && ai.targetEntityId) {
        // Find target entity
        const targetEntity = this.world.getEntityById(ai.targetEntityId);
        if (!targetEntity) {
          continue;
        }

        const targetPos = targetEntity
          .getComponent<TransformComponent>(TransformComponent.componentName)
          .getPosition();
        const currentPos = transform.getPosition();

        // Calculate direction to target
        const dx = targetPos[0] - currentPos[0];
        const dy = targetPos[1] - currentPos[1];
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
          // Normalize direction
          const dirX = dx / distance;
          const dirY = dy / distance;

          // Apply movement
          if (entity.hasComponent(PhysicsComponent.componentName)) {
            const physics = entity.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
            // Scale down AI speed
            const aiSpeed = ai.speed * 0.1;
            physics.setVelocity([dirX * aiSpeed, dirY * aiSpeed]);
          } else {
            // Direct movement for entities without velocity component
            const aiSpeed = ai.speed * 0.1;
            transform.move(dirX * aiSpeed * deltaTime * 60, dirY * aiSpeed * deltaTime * 60);
          }
        }
      }
    }
  }
}
