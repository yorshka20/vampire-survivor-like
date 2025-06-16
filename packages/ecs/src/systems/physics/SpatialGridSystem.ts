import { SpatialGridComponent, TransformComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';

export class SpatialGridSystem extends System {
  private spatialGridEntity: Entity | null = null;
  private lastUpdateTime: number = 0;
  private readonly UPDATE_INTERVAL = 16; // Update every 16ms (roughly 60fps)

  private spatialComponent: SpatialGridComponent | null = null;

  constructor() {
    super('SpatialGridSystem', SystemPriorities.SPATIAL_GRID, 'logic');
  }

  init(): void {
    // Create spatial grid entity
    this.spatialGridEntity = new Entity('spatial-grid', 'other');
    this.spatialComponent = new SpatialGridComponent(100, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    this.spatialGridEntity.addComponent(this.spatialComponent);
    this.world.addEntity(this.spatialGridEntity);

    // Handle window resize
    window.addEventListener('resize', () => {
      this.spatialComponent?.clear();
    });
  }

  update(deltaTime: number): void {
    if (!this.spatialGridEntity || !this.spatialComponent) return;

    // const currentTime = performance.now();
    // if (currentTime - this.lastUpdateTime < this.UPDATE_INTERVAL) {
    //   return; // Skip update if not enough time has passed
    // }

    // Update frame counter for cache management
    this.spatialComponent.updateFrame();

    // Clear grid and update entities
    this.spatialComponent.clear();

    // Update all entities in the grid
    const entities = this.world.getEntitiesWithComponents([TransformComponent]);
    for (const entity of entities) {
      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      const position = transform.getPosition();
      this.spatialComponent.insert(entity.id, position, entity.type);
    }

    // this.lastUpdateTime = currentTime;
  }

  destroy(): void {
    if (this.spatialGridEntity) {
      this.world.removeEntity(this.spatialGridEntity);
      this.spatialGridEntity = null;
    }
  }
}
