import { ShapeComponent, SpatialGridComponent, TransformComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { RenderSystem } from '../rendering/RenderSystem';

/**
 * @class SpatialGridSystem
 * @description Manages the spatial grid for efficient entity lookups.
 * This system updates the spatial grid at a fixed interval to optimize performance.
 */
export class SpatialGridSystem extends System {
  private spatialGridEntity: Entity | null = null;
  private lastUpdateTime: number = 0;
  /**
   * The interval at which the spatial grid is updated.
   * @private
   * @readonly
   * @type {number}
   * @default 100
   */
  private readonly UPDATE_INTERVAL = 100; // Update every 100ms (roughly 10fps)

  private resizeUpdated: boolean = false;

  private spatialComponent: SpatialGridComponent | null = null;

  constructor() {
    super('SpatialGridSystem', SystemPriorities.SPATIAL_GRID, 'logic');
  }

  /**
   * Retrieves the SpatialGridComponent.
   * @returns {SpatialGridComponent} The SpatialGridComponent instance.
   * @throws {Error} If the SpatialGridComponent is not found.
   */
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

  /**
   * Updates the spatial grid system.
   * This method is called on each frame, but the grid is updated only when the time since the last update exceeds UPDATE_INTERVAL.
   * @param {number} deltaTime - The time elapsed since the last frame.
   */
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
