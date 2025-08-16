import { ShapeComponent, SpatialGridComponent, TransformComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { RenderSystem } from '../rendering/RenderSystem';

export class SpatialGridSystem extends System {
  private spatialGridEntity: Entity | null = null;
  private lastUpdateTime: number = 0;
  private readonly UPDATE_INTERVAL = 16; // Update every 16ms (roughly 60fps)

  private resizeUpdated: boolean = false;

  private spatialComponent: SpatialGridComponent | null = null;

  constructor() {
    super('SpatialGridSystem', SystemPriorities.SPATIAL_GRID, 'logic');
  }

  getSpatialGridComponent(): SpatialGridComponent {
    if (!this.spatialComponent) {
      throw new Error('SpatialGridComponent not found');
    }
    return this.spatialComponent;
  }

  init(): void {
    // Create spatial grid entity
    this.spatialGridEntity = new Entity('spatial-grid', 'other');
    this.spatialComponent = new SpatialGridComponent(100);
    this.spatialGridEntity.addComponent(this.spatialComponent);
    this.world.addEntity(this.spatialGridEntity);

    // Handle window resize
    window.addEventListener('resize', () => {
      this.spatialComponent?.clear();
      this.resizeUpdated = false;
    });
  }

  update(deltaTime: number): void {
    if (!this.spatialGridEntity || !this.spatialComponent) return;

    // Update frame counter for cache management
    this.spatialComponent.updateFrame();

    // Clear grid and update entities
    this.spatialComponent.clear();

    // Update all entities in the grid
    const entities = this.world.getEntitiesWithComponents([TransformComponent]);
    for (const entity of entities) {
      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      const position = transform.getPosition();
      let size: [number, number] | undefined;
      if (entity.hasComponent(ShapeComponent.componentName)) {
        const shape = entity.getComponent<ShapeComponent>(ShapeComponent.componentName);
        size = shape.getSize();
      }
      this.spatialComponent.insert(entity.id, position, entity.type, size);
    }

    if (!this.resizeUpdated) {
      const renderSystem = this.world.getSystem<RenderSystem>(
        RenderSystem.name,
        SystemPriorities.RENDER,
      );
      if (renderSystem) {
        this.spatialComponent.updateMaxCell(renderSystem.getViewport());
        this.resizeUpdated = true;
      }
    }
  }

  destroy(): void {
    if (this.spatialGridEntity) {
      this.world.removeEntity(this.spatialGridEntity);
      this.spatialGridEntity = null;
    }
  }
}
