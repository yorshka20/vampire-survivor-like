import { LifecycleComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';

export class LifecycleSystem extends System {
  private entitiesToRemove: Set<string> = new Set();

  constructor() {
    super('LifecycleSystem', SystemPriorities.LIFECYCLE, 'logic');
  }

  update(deltaTime: number): void {
    // remove entities in next update
    this.removeEntities();

    const entities = this.world.getEntitiesWithComponents([
      { componentName: LifecycleComponent.componentName },
    ]);

    for (const entity of entities) {
      const lifecycle = entity.getComponent<LifecycleComponent>(LifecycleComponent.componentName);
      if (lifecycle.isExpired()) {
        // Instead of removing immediately, mark for removal
        entity.markForRemoval();
        this.entitiesToRemove.add(entity.id);
      }
    }
  }

  private removeEntities(): void {
    if (this.entitiesToRemove.size === 0) return;

    for (const entityId of this.entitiesToRemove) {
      const entity = this.world.getEntityById(entityId);
      if (entity) {
        this.world.removeEntity(entity);
      }
    }

    this.entitiesToRemove.clear();
  }
}
