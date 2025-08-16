import { TransformComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { RenderSystem } from '@ecs/systems';
import { Point, RectArea } from '@ecs/utils/types';

/**
 * RecycleSystem
 *
 * A generic system for recycling (removing) entities based on custom conditions.
 * Only entities with TransformComponent and recyclable=true will be considered.
 *
 * @example
 *   // Remove entities outside viewport:
 *   new RecycleSystem((entity, position, viewport) => !isInRect(position, viewport))
 */
export class RecycleSystem extends System {
  private entitiesToRemove: Set<string> = new Set();

  /**
   * recycle condition: return true to recycle entity
   * (entity, position, viewport) => boolean
   */
  private predicate: (entity: Entity, position: Point, viewport: RectArea) => boolean;

  constructor(predicate: (entity: Entity, position: Point, viewport: RectArea) => boolean) {
    super('RecycleSystem', SystemPriorities.RECYCLE ?? 5, 'logic');
    this.predicate = predicate;
  }

  private getRenderSystem(): RenderSystem {
    return RenderSystem.getInstance();
  }

  update(deltaTime: number): void {
    this.removeEntities();

    // get viewport (depends on RenderSystem)
    const viewport = this.getRenderSystem().getViewport();

    // iterate all entities with TransformComponent
    const entities = this.world.getEntitiesByCondition((entity) => {
      if (entity.toRemove) return false;
      if (!entity.hasComponent(TransformComponent.componentName)) return false;
      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      return transform.recyclable;
    });
    for (const entity of entities) {
      const position = entity
        .getComponent<TransformComponent>(TransformComponent.componentName)
        .getPosition();
      if (this.predicate(entity, position, viewport)) {
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
        console.log('remove entity', entity.id);
        this.world.removeEntity(entity);
      }
    }

    this.entitiesToRemove.clear();
  }
}

/**
 * check if a point is in a rectangle
 * @param p [x, y]
 * @param rect [x, y, w, h]
 */
export function isInRect(p: Point, rect: RectArea): boolean {
  return (
    p[0] >= rect[0] && p[0] <= rect[0] + rect[2] && p[1] >= rect[1] && p[1] <= rect[1] + rect[3]
  );
}
