import { AIComponent, RenderComponent, StateComponent, VelocityComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';

export class StateEffectSystem extends System {
  constructor() {
    super('StateEffectSystem', SystemPriorities.STATE_EFFECT, 'render');
  }

  update(deltaTime: number): void {
    const entities = this.world.getEntitiesWithComponents([
      StateComponent,
      RenderComponent,
      VelocityComponent,
      AIComponent,
    ]);

    for (const entity of entities) {
      const state = entity.getComponent<StateComponent>(StateComponent.componentName);

      // update per frame
      state.update();

      // Handle movement and AI effects
      if (state.getIsDazed()) {
        if (entity.hasComponent(VelocityComponent.componentName)) {
          const velocity = entity.getComponent<VelocityComponent>(VelocityComponent.componentName);
          velocity.setVelocity({ x: 0, y: 0 });
        }
        if (entity.hasComponent(AIComponent.componentName)) {
          const ai = entity.getComponent<AIComponent>(AIComponent.componentName);
          ai.pause();
        }
      } else {
        if (entity.hasComponent(AIComponent.componentName)) {
          const ai = entity.getComponent<AIComponent>(AIComponent.componentName);
          ai.resume();
        }
      }
    }
  }
}
