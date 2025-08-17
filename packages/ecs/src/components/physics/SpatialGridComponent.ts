import { Component } from '@ecs/core/ecs/Component';
import { EntityType } from '@ecs/core/ecs/types';
import { Point, Viewport } from '@ecs/utils/types';

/**
 * Grid cell with pre-classified entity storage for better performance
 * Each entity type is stored separately to avoid runtime filtering
 */
interface GridCell {
  // Legacy storage for backward compatibility
  entities: Set<string>;
  entityTypes: Map<string, EntityType>;

  // Pre-classified storage for better performance
  enemies: Set<string>;
  projectiles: Set<string>;
  pickups: Set<string>;
  players: Set<string>;
  areaEffects: Set<string>;
  objects: Set<string>;
  obstacles: Set<string>;
}

/**
 * Cache types for different spatial queries
 *
 * queryType does not equal to the entity type.
 * - collision: only collect collidable entities
 * - damage: only collect entities that can deal damage
 * - collision-distant: only collect collidable entities that are further away
 * - pickup: only collect entities that are pickable
 * - obstacle: only collect entities that are obstacles
 */
export type SpatialQueryType = 'collision' | 'damage' | 'collision-distant' | 'pickup' | 'obstacle';

interface CacheEntry {
  entities: string[]; // Changed from Set<string> to string[] for better performance
  timestamp: number;
}

// Cache configuration for different query types
interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  radiusMultiplier: number; // Multiplier for search radius
  updateFrequency: number; // How often to update cache (in frames)
}

export class SpatialGridComponent extends Component {
  static componentName = 'SpatialGrid';
  public grid: Map<string, GridCell> = new Map();
  public cellSize: number;

  private maxCellY: number = 10000;
  private maxCellX: number = 10000;

  // Cache system with local invalidation support
  private readonly caches: Map<SpatialQueryType, Map<string, CacheEntry>> = new Map();
  private readonly cacheConfigs: Map<SpatialQueryType, CacheConfig> = new Map();
  private lastCacheUpdate: number = 0;
  private frameCount: number = 0;
  private lastCacheCleanupFrame: number = 0;
  private static readonly CACHE_CLEANUP_INTERVAL = 60;

  constructor(cellSize: number) {
    super(SpatialGridComponent.componentName);
    this.cellSize = cellSize;

    // Initialize caches and their configurations
    this.initializeCaches();
  }

  private initializeCaches(): void {
    // Initialize collision cache (frequent updates, small radius)
    this.caches.set('collision', new Map());
    this.cacheConfigs.set('collision', {
      ttl: 50, // 50ms TTL
      radiusMultiplier: 1.0, // Normal radius
      updateFrequency: 1, // Update every frame
    });

    // Initialize damage cache (less frequent updates, medium radius)
    this.caches.set('damage', new Map());
    this.cacheConfigs.set('damage', {
      ttl: 100, // 100ms TTL
      radiusMultiplier: 1.5, // Larger radius for damage detection
      updateFrequency: 2, // Update every 2 frames
    });

    // Initialize collision-distant cache (least frequent updates, largest radius)
    this.caches.set('collision-distant', new Map());
    this.cacheConfigs.set('collision-distant', {
      ttl: 200, // 200ms TTL
      radiusMultiplier: 2.0, // Largest radius for collision-distant detection
      updateFrequency: 4, // Update every 4 frames
    });

    // Initialize pickup cache (least frequent updates, largest radius)
    this.caches.set('pickup', new Map());
    this.cacheConfigs.set('pickup', {
      ttl: 700, // 700ms TTL
      radiusMultiplier: 1.0, // Largest radius for pickup detection
      updateFrequency: 5, // Update every 5 frames
    });

    this.caches.set('obstacle', new Map());
    this.cacheConfigs.set('obstacle', {
      ttl: 50, // 50ms TTL, same as collision cache for real-time accuracy
      radiusMultiplier: 1.0, // Normal radius
      updateFrequency: 1, // Update every frame for obstacle queries
    });
  }

  /**
   * Returns the cell key for a given x, y position.
   * If either coordinate is negative (outside viewport), returns an empty string.
   */
  private getCellKey(x: number, y: number): string {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    // Only return key if cell is inside viewport (cellX, cellY >= 0)
    if (cellX < 0 || cellY < 0 || cellX > this.maxCellX || cellY > this.maxCellY) return '';
    return `${cellX},${cellY}`;
  }

  private getCellBounds(cellKey: string): { x: number; y: number; width: number; height: number } {
    const [cellX, cellY] = cellKey.split(',').map(Number);
    return {
      x: cellX * this.cellSize,
      y: cellY * this.cellSize,
      width: this.cellSize,
      height: this.cellSize,
    };
  }

  /**
   * Create a new grid cell with pre-classified entity storage
   */
  private createGridCell(): GridCell {
    return {
      entities: new Set(),
      entityTypes: new Map(),
      enemies: new Set(),
      projectiles: new Set(),
      pickups: new Set(),
      players: new Set(),
      areaEffects: new Set(),
      objects: new Set(),
      obstacles: new Set(),
    };
  }

  /**
   * Get the appropriate entity set based on entity type
   */
  private getEntitySetByType(cell: GridCell, entityType: EntityType): Set<string> {
    switch (entityType) {
      case 'enemy':
        return cell.enemies;
      case 'projectile':
        return cell.projectiles;
      case 'pickup':
        return cell.pickups;
      case 'player':
        return cell.players;
      case 'areaEffect':
        return cell.areaEffects;
      case 'object':
        return cell.objects;
      case 'obstacle':
        return cell.obstacles;
      default:
        return cell.entities; // Fallback to legacy storage
    }
  }

  /**
   * Invalidate cache for a specific cell and its neighbors (3x3 grid)
   * This is the key optimization: only invalidate affected cells instead of all caches
   */
  private invalidateCacheForCell(cellX: number, cellY: number): void {
    // Invalidate the target cell and its 8 neighbors (3x3 grid)
    for (let x = cellX - 1; x <= cellX + 1; x++) {
      for (let y = cellY - 1; y <= cellY + 1; y++) {
        const neighborKey = `${x},${y}`;
        this.caches.forEach((cache) => {
          cache.delete(neighborKey);
        });
      }
    }
  }

  /**
   * Get all cell coordinates covered by an entity at position with optional size
   * If size is not provided, returns the single cell coordinate for the position
   * Only returns cell coordinates with non-negative values (inside viewport)
   */
  private getCoveredCellCoords(position: Point, size?: [number, number]): [number, number][] {
    if (!size) {
      // Single cell
      const cellX = Math.floor(position[0] / this.cellSize);
      const cellY = Math.floor(position[1] / this.cellSize);
      if (cellX < 0 || cellY < 0 || cellX > this.maxCellX || cellY > this.maxCellY) return [];
      return [[cellX, cellY]];
    }
    // Multi-cell: compute AABB
    const minX = position[0] - size[0] / 2;
    const maxX = position[0] + size[0] / 2;
    const minY = position[1] - size[1] / 2;
    const maxY = position[1] + size[1] / 2;
    const cellMinX = Math.floor(minX / this.cellSize);
    const cellMaxX = Math.floor(maxX / this.cellSize);
    const cellMinY = Math.floor(minY / this.cellSize);
    const cellMaxY = Math.floor(maxY / this.cellSize);
    const coords: [number, number][] = [];
    for (let x = cellMinX; x <= cellMaxX; x++) {
      for (let y = cellMinY; y <= cellMaxY; y++) {
        if (x >= 0 && y >= 0 && x <= this.maxCellX && y <= this.maxCellY) {
          coords.push([x, y]);
        }
      }
    }
    return coords;
  }

  updateMaxCell(viewport: Viewport) {
    this.maxCellY = Math.floor((viewport[3] - viewport[1]) / this.cellSize);
    this.maxCellX = Math.floor((viewport[2] - viewport[0]) / this.cellSize);
  }

  /**
   * Insert entity into grid with pre-classified storage
   * Registers to all cells covered by its AABB if size is provided
   */
  insert(entityId: string, position: Point, entityType: EntityType, size?: [number, number]): void {
    const cellCoords = this.getCoveredCellCoords(position, size);
    for (const [cellX, cellY] of cellCoords) {
      const cellKey = `${cellX},${cellY}`;
      if (!this.grid.has(cellKey)) {
        this.grid.set(cellKey, this.createGridCell());
      }
      const cell = this.grid.get(cellKey)!;
      // Add to legacy storage for backward compatibility
      cell.entities.add(entityId);
      cell.entityTypes.set(entityId, entityType);
      // Add to pre-classified storage
      const entitySet = this.getEntitySetByType(cell, entityType);
      entitySet.add(entityId);
      // Local cache invalidation
      this.invalidateCacheForCell(cellX, cellY);
    }
  }

  /**
   * Remove entity from grid
   * Removes from all cells covered by its AABB if size is provided
   */
  remove(
    entityId: string,
    position: Point,
    entityType?: EntityType,
    size?: [number, number],
  ): void {
    const cellCoords = this.getCoveredCellCoords(position, size);
    for (const [cellX, cellY] of cellCoords) {
      const cellKey = `${cellX},${cellY}`;
      const cell = this.grid.get(cellKey);
      if (cell) {
        // Remove from legacy storage
        cell.entities.delete(entityId);
        const et = entityType || cell.entityTypes.get(entityId);
        cell.entityTypes.delete(entityId);
        // Remove from pre-classified storage
        if (et) {
          const entitySet = this.getEntitySetByType(cell, et);
          entitySet.delete(entityId);
        }
        if (cell.entities.size === 0) {
          this.grid.delete(cellKey);
        }
        // Local cache invalidation
        this.invalidateCacheForCell(cellX, cellY);
      }
    }
  }

  /**
   * Optimized position update method - only updates grid when crossing cell boundaries
   * For 'obstacle', remove from old AABB cells, insert to new AABB cells
   */
  updatePosition(
    entityId: string,
    oldPosition: Point,
    newPosition: Point,
    entityType: EntityType,
    oldSize?: [number, number],
    newSize?: [number, number],
  ): void {
    const oldCellKey = this.getCellKey(oldPosition[0], oldPosition[1]);
    const newCellKey = this.getCellKey(newPosition[0], newPosition[1]);
    // only update grid if entity crossed cell boundary
    if (oldCellKey !== newCellKey) {
      // Remove from old cell
      this.remove(entityId, oldPosition, entityType, oldSize);
      // Insert into new cell
      this.insert(entityId, newPosition, entityType, newSize);
    }
    // If same cell, no grid update needed - this is the performance gain
  }

  getNearbyEntities(
    position: Point,
    radius: number,
    queryType: SpatialQueryType = 'collision',
  ): string[] {
    if (
      this.frameCount - this.lastCacheCleanupFrame >
      SpatialGridComponent.CACHE_CLEANUP_INTERVAL
    ) {
      this.cleanExpiredCacheEntries();
      this.lastCacheCleanupFrame = this.frameCount;
    }

    const currentTime = Date.now();
    const cache = this.caches.get(queryType)!;
    const config = this.cacheConfigs.get(queryType)!;
    const cellKey = this.getCellKey(position[0], position[1]);

    // Check if cache needs update based on frame count
    if (this.frameCount % config.updateFrequency === 0) {
      // Check if cache is expired
      const cachedEntry = cache.get(cellKey);
      if (!cachedEntry || currentTime - cachedEntry.timestamp > config.ttl) {
        // Calculate with adjusted radius based on query type
        const adjustedRadius = radius * config.radiusMultiplier;
        const result = this.calculateNearbyEntities(position, adjustedRadius, queryType);

        // Update cache with string array instead of Set
        if (result.length > 0) {
          cache.set(cellKey, {
            entities: result, // Direct array assignment, no Array.from() needed
            timestamp: currentTime,
          });
        }

        return result;
      }

      return cachedEntry.entities; // Direct return, no Array.from() needed
    }

    // If not time to update, return cached result if available
    const cachedEntry = cache.get(cellKey);
    if (cachedEntry && cachedEntry.entities.length > 0) {
      return cachedEntry.entities; // Direct return, no Array.from() needed
    }

    // If no cache available, calculate and cache
    const adjustedRadius = radius * config.radiusMultiplier;
    const result = this.calculateNearbyEntities(position, adjustedRadius, queryType);
    if (result.length > 0) {
      cache.set(cellKey, {
        entities: result, // Direct array assignment
        timestamp: currentTime,
      });
    }

    return result;
  }

  private calculateNearbyEntities(
    position: Point,
    radius: number,
    queryType: SpatialQueryType,
  ): string[] {
    const result: string[] = [];

    const cellX = Math.floor(position[0] / this.cellSize);
    const cellY = Math.floor(position[1] / this.cellSize);
    const cellRadius = Math.ceil(radius / this.cellSize);

    for (let x = cellX - cellRadius; x <= cellX + cellRadius; x++) {
      for (let y = cellY - cellRadius; y <= cellY + cellRadius; y++) {
        const cellKey = `${x},${y}`;
        const cell = this.grid.get(cellKey);
        if (!cell) {
          continue;
        }

        // Use pre-classified storage for better performance
        result.push(...this.getEntitiesByQueryType(cell, queryType));
      }
    }

    return Array.from(new Set(result));
  }

  /**
   * Get entities by query type using pre-classified storage
   * This replaces filterEntityByQueryType for better performance
   */
  private getEntitiesByQueryType(cell: GridCell, queryType: SpatialQueryType): string[] {
    switch (queryType) {
      case 'collision-distant':
      case 'collision':
        // return all collidable types
        return Array.from(
          new Set([
            ...cell.enemies,
            ...cell.players,
            ...cell.projectiles,
            ...cell.areaEffects,
            ...cell.objects,
            ...cell.obstacles,
          ]),
        );
      case 'damage':
        return Array.from(new Set([...cell.enemies, ...cell.projectiles, ...cell.areaEffects]));
      case 'pickup':
        return [...cell.pickups];
      case 'obstacle':
        return [...cell.obstacles];
      default:
        return [];
    }
  }

  private updateCaches(): void {
    // Clear all caches
    this.caches.forEach((cache) => cache.clear());
  }

  private invalidateCaches(): void {
    // Mark caches as needing update
    this.lastCacheUpdate = 0;
    this.updateCaches();
  }

  // Call this method every frame to update frame counter
  updateFrame(): void {
    this.frameCount++;
  }

  clear(): void {
    this.grid.clear();
    this.invalidateCaches();
  }

  reset(): void {
    super.reset();
    this.grid.clear();
    this.cellSize = 0;
    this.invalidateCaches();
    this.frameCount = 0;
  }

  // clear expired cache entries
  private cleanExpiredCacheEntries() {
    const now = Date.now();
    this.caches.forEach((cache, queryType) => {
      const config = this.cacheConfigs.get(queryType as SpatialQueryType)!;
      for (const [cellKey, entry] of cache.entries()) {
        if (now - entry.timestamp > config.ttl * 4) {
          cache.delete(cellKey);
        }
      }
    });
  }

  // Get all cells that a line passes through
  getCellsInLine(start: Point, end: Point, width: number): string[] {
    const result = new Set<string>();

    // Always include the start cell
    const startCellKey = this.getCellKey(start[0], start[1]);
    result.add(startCellKey);

    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.sqrt(dx * dx + dy * dy);
    const dirX = dx / length;
    const dirY = dy / length;

    // Calculate perpendicular vector for width
    const perpX = -dirY;
    const perpY = dirX;

    // Calculate the four corners of the line's bounding box
    const halfWidth = width / 2;
    const corners: Point[] = [
      [start[0] + perpX * halfWidth, start[1] + perpY * halfWidth],
      [start[0] - perpX * halfWidth, start[1] - perpY * halfWidth],
      [end[0] + perpX * halfWidth, end[1] + perpY * halfWidth],
      [end[0] - perpX * halfWidth, end[1] - perpY * halfWidth],
    ];

    // Get all cells that the corners are in
    for (const corner of corners) {
      const cellKey = this.getCellKey(corner[0], corner[1]);
      result.add(cellKey);
    }

    // Get cells along the line with smaller steps
    const steps = Math.ceil(length / (this.cellSize / 4)); // Use smaller steps for better accuracy
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = start[0] + dx * t;
      const y = start[1] + dy * t;

      // Add cells along the width of the line
      const widthSteps = Math.ceil(width / (this.cellSize / 4));
      for (let w = -widthSteps; w <= widthSteps; w++) {
        const wx = x + perpX * ((w * this.cellSize) / 4);
        const wy = y + perpY * ((w * this.cellSize) / 4);
        const cellKey = this.getCellKey(wx, wy);
        result.add(cellKey);
      }
    }

    return Array.from(result);
  }

  // Get all entities in a specific cell
  getEntitiesInCell(cellKey: string, queryType: SpatialQueryType = 'collision'): string[] {
    const cell = this.grid.get(cellKey);
    if (!cell) return [];

    // Use pre-classified storage for better performance
    return this.getEntitiesByQueryType(cell, queryType);
  }
}
