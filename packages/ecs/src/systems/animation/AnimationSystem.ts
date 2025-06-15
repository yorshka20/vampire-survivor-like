import { AnimationComponent } from '@ecs/components/rendering/AnimationComponent';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';

export class AnimationSystem extends System {
  constructor() {
    super('AnimationSystem', SystemPriorities.ANIMATION);
  }

  update(deltaTime: number): void {
    const entities = this.world.getEntitiesWithComponents([AnimationComponent]);

    for (const entity of entities) {
      const animation = entity.getComponent<AnimationComponent>(AnimationComponent.componentName);
      if (animation) {
        animation.update(deltaTime);
      }
    }
  }
}
