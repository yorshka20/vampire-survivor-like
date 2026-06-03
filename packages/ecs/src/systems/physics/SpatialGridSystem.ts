import { ShapeComponent, SpatialGridComponent, TransformComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { EntityType } from '@ecs/core/ecs/types';
import { Point } from '@ecs/types/types';

/**
 * Per-entity record of where it currently lives in the grid.
 *
 * `cellX`/`cellY` is the center cell the entity was last registered in — comparing
 * the live position's cell against it tells us, with no string allocation, whether
 * the entity has crossed a boundary this frame. `pos`/`size` are the exact values
 * used at the last (re)insert, so removal reproduces the same covered cells (the
 * AABB coverage depends on the actual position, not just the center cell).
 */
interface GridRecord {
  entity: Entity;
  type: EntityType;
  cellX: number;
  cellY: number;
  pos: Point;
  size?: [number, number];
}

/**
 * @class SpatialGridSystem
 * @description Maintains the spatial grid incrementally.
 *
 * Instead of clearing and rebuilding the whole grid every frame, the grid is
 * mutated only when something actually changes:
 *  - entity added   -> insert once (via world.onEntityAdded)
 *  - entity removed  -> remove once (via world.onEntityRemoved)
 *  - entity moved   -> updatePosition only when it crosses a cell boundary
 *
 * Each frame, update() walks the tracked entities and re-registers only the ones
 * whose center cell changed. Entities that stayed in their cell (the large
 * majority — at ~125px/s and cellSize 100, an entity moves ~2px/frame) cost just a
 * couple of Math.floor + integer compares and touch neither the grid nor the cache.
 */
export class SpatialGridSystem extends System {
  private spatialGridEntity: Entity | null = null;
  private spatialComponent: SpatialGridComponent | null = null;

  // entityId -> where it currently lives in the grid
  private readonly tracked: Map<string, GridRecord> = new Map();

  // Bound handlers so they can be unsubscribed on destroy.
  private readonly onAdded = (entity: Entity) => this.insertEntity(entity);
  private readonly onRemoved = (entity: Entity) => this.removeEntity(entity);
  private readonly onResize = () => this.reseed();

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
    this.spatialComponent = new SpatialGridComponent(this.world.spatialCellSize);
    this.spatialGridEntity.addComponent(this.spatialComponent);

    // Subscribe to entity lifecycle BEFORE adding any entity (including our own
    // grid entity) so no add/remove is missed.
    this.world.onEntityAdded.subscribe(this.onAdded);
    this.world.onEntityRemoved.subscribe(this.onRemoved);

    this.world.addEntity(this.spatialGridEntity);

    // Seed from entities that already exist (added before we subscribed).
    this.reseed();

    // The grid is an unbounded spatial hash, so a resize does not change cell
    // coordinates. We still reseed to be safe against any external grid clear.
    window.addEventListener('resize', this.onResize);
  }

  updateCellCache(size: number) {
    this.spatialComponent?.reset();
    this.spatialComponent = null;
    this.spatialComponent = new SpatialGridComponent(size);
  }

  /**
   * Incrementally maintain the grid: re-register only entities that crossed a
   * cell boundary since the last frame.
   */
  update(): void {
    if (!this.spatialComponent) return;
    this.spatialComponent.updateFrame();

    const cellSize = this.spatialComponent.cellSize;
    for (const record of this.tracked.values()) {
      const entity = record.entity;
      if (!entity.active || !entity.hasComponent(TransformComponent.componentName)) continue;

      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      const pos = transform.getPosition();
      const cellX = Math.floor(pos[0] / cellSize);
      const cellY = Math.floor(pos[1] / cellSize);

      if (cellX === record.cellX && cellY === record.cellY) continue; // no boundary crossing

      // Crossed a boundary: move it from its old cells to the new ones. Use the
      // stored insertion pos/size so removal targets exactly the cells it was
      // inserted into.
      this.spatialComponent.updatePosition(
        entity.id,
        record.pos,
        pos,
        record.type,
        record.size,
        record.size,
      );

      record.cellX = cellX;
      record.cellY = cellY;
      record.pos = [pos[0], pos[1]]; // copy: getPosition() returns a live reference
    }
  }

  /** Insert a newly added entity and start tracking it. */
  private insertEntity(entity: Entity): void {
    if (!this.spatialComponent) return;
    if (this.tracked.has(entity.id)) return;
    if (!entity.hasComponent(TransformComponent.componentName)) return;
    if (!this.spatialComponent.isIndexedType(entity.type)) return;

    const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
    const pos = transform.getPosition();
    let size: [number, number] | undefined;
    if (entity.hasComponent(ShapeComponent.componentName)) {
      const shape = entity.getComponent<ShapeComponent>(ShapeComponent.componentName);
      const s = shape.getSize();
      size = [s[0], s[1]];
    }

    this.spatialComponent.insert(entity.id, pos, entity.type, size);

    const cellSize = this.spatialComponent.cellSize;
    this.tracked.set(entity.id, {
      entity,
      type: entity.type,
      cellX: Math.floor(pos[0] / cellSize),
      cellY: Math.floor(pos[1] / cellSize),
      pos: [pos[0], pos[1]],
      size,
    });
  }

  /**
   * Remove a destroyed entity from the grid.
   *
   * onEntityRemoved fires after the entity's components have been detached, so we
   * rely on the stored record (pos/size/type) rather than reading the component.
   */
  private removeEntity(entity: Entity): void {
    if (!this.spatialComponent) return;
    const record = this.tracked.get(entity.id);
    if (!record) return;

    this.spatialComponent.remove(entity.id, record.pos, record.type, record.size);
    this.tracked.delete(entity.id);
  }

  /**
   * Drop and rebuild the grid + tracking from the current world entities. Cheap
   * and rare (init and resize only) — keeps the incremental state authoritative
   * if anything ever clears the grid out from under us.
   */
  private reseed(): void {
    if (!this.spatialComponent) return;
    this.spatialComponent.clear();
    this.tracked.clear();
    for (const entity of this.world.getEntitiesWithComponents([TransformComponent])) {
      this.insertEntity(entity);
    }
  }

  destroy(): void {
    this.world.onEntityAdded.unsubscribe(this.onAdded);
    this.world.onEntityRemoved.unsubscribe(this.onRemoved);
    window.removeEventListener('resize', this.onResize);
    this.tracked.clear();
    if (this.spatialGridEntity) {
      this.world.removeEntity(this.spatialGridEntity);
      this.spatialGridEntity = null;
    }
  }
}
