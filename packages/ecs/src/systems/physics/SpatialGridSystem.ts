import { MovementComponent } from '@ecs/components/physics/MovementComponent';
import {
  SpatialGridComponent,
  SpatialQueryType,
} from '@ecs/components/physics/SpatialGridComponent';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';

export class SpatialGridSystem extends System {
  private spatialGridEntity: Entity | null = null;
  private lastUpdateTime: number = 0;
  private readonly UPDATE_INTERVAL = 16; // Update every 16ms (roughly 60fps)

  constructor() {
    super('SpatialGridSystem', SystemPriorities.SPATIAL_GRID, 'logic');
  }

  init(): void {
    // Create spatial grid entity
    this.spatialGridEntity = new Entity('spatial-grid', 'other');
    this.spatialGridEntity.addComponent(
      new SpatialGridComponent(100, { width: window.innerWidth, height: window.innerHeight }),
    );
    this.world.addEntity(this.spatialGridEntity);

    // Handle window resize
    window.addEventListener('resize', () => {
      if (this.spatialGridEntity) {
        const gridComponent = this.spatialGridEntity.getComponent<SpatialGridComponent>(
          SpatialGridComponent.componentName,
        );
        if (gridComponent) {
          gridComponent.clear();
        }
      }
    });
  }

  update(deltaTime: number): void {
    if (!this.spatialGridEntity) return;

    const currentTime = performance.now();
    if (currentTime - this.lastUpdateTime < this.UPDATE_INTERVAL) {
      return; // Skip update if not enough time has passed
    }

    const gridComponent = this.spatialGridEntity.getComponent<SpatialGridComponent>(
      SpatialGridComponent.componentName,
    );
    if (!gridComponent) return;

    // Update frame counter for cache management
    gridComponent.updateFrame();

    // Clear grid and update entities
    gridComponent.clear();

    // Update all entities in the grid
    const entities = this.world.getEntitiesWithComponents([MovementComponent]);
    for (const entity of entities) {
      const movement = entity.getComponent<MovementComponent>(MovementComponent.componentName);
      const position = movement.getPosition();
      gridComponent.insert(entity.id, position, entity.type);
    }

    this.lastUpdateTime = currentTime;
  }

  // Helper method to get nearby entities with specific query type
  getNearbyEntities(
    position: [number, number],
    radius: number,
    queryType: SpatialQueryType = 'collision',
  ): string[] {
    if (!this.spatialGridEntity) return [];

    const gridComponent = this.spatialGridEntity.getComponent<SpatialGridComponent>(
      SpatialGridComponent.componentName,
    );
    if (!gridComponent) return [];

    return gridComponent.getNearbyEntities(position, radius, queryType);
  }

  destroy(): void {
    if (this.spatialGridEntity) {
      this.world.removeEntity(this.spatialGridEntity);
      this.spatialGridEntity = null;
    }
  }
}
