import { Component } from '@ecs/core/ecs/Component';
import { EntityType } from '@ecs/core/ecs/types';
import { Point } from '@ecs/utils/types';

interface GridCell {
  entities: Set<string>;
  entityTypes: Map<string, EntityType>; // Add entity type mapping
}

/**
 * Cache types for different spatial queries
 *
 * queryType does not equal to the entity type.
 * - collision: only collect collidable entities
 * - damage: only collect entities that can deal damage
 * - collision-distant: only collect collidable entities that are further away
 * - pickup: only collect entities that are pickable
 */
export type SpatialQueryType = 'collision' | 'damage' | 'collision-distant' | 'pickup';

interface CacheEntry {
  entities: Set<string>;
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
  private grid: Map<string, GridCell> = new Map();
  public cellSize: number;
  private worldSize: { width: number; height: number };

  // Cache system
  private readonly caches: Map<SpatialQueryType, Map<string, CacheEntry>> = new Map();
  private readonly cacheConfigs: Map<SpatialQueryType, CacheConfig> = new Map();
  private lastCacheUpdate: number = 0;
  private frameCount: number = 0;
  private lastCacheCleanupFrame: number = 0;
  private static readonly CACHE_CLEANUP_INTERVAL = 60;

  constructor(cellSize: number, worldSize: { width: number; height: number }) {
    super(SpatialGridComponent.componentName);
    this.cellSize = cellSize;
    this.worldSize = worldSize;

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
  }

  private getCellKey(x: number, y: number): string {
    const cellX = Math.round(x / this.cellSize);
    const cellY = Math.round(y / this.cellSize);
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

  insert(entityId: string, position: Point, entityType: EntityType): void {
    const cellKey = this.getCellKey(position[0], position[1]);
    if (!this.grid.has(cellKey)) {
      this.grid.set(cellKey, { entities: new Set(), entityTypes: new Map() });
    }
    const cell = this.grid.get(cellKey)!;
    cell.entities.add(entityId);
    cell.entityTypes.set(entityId, entityType);

    // Invalidate caches when grid changes
    this.invalidateCaches();
  }

  remove(entityId: string, position: Point): void {
    const cellKey = this.getCellKey(position[0], position[1]);
    const cell = this.grid.get(cellKey);
    if (cell) {
      cell.entities.delete(entityId);
      cell.entityTypes.delete(entityId);
      if (cell.entities.size === 0) {
        this.grid.delete(cellKey);
      }

      // Invalidate caches when grid changes
      this.invalidateCaches();
    }
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

        // Update cache
        if (result.length > 0) {
          cache.set(cellKey, {
            entities: new Set(result),
            timestamp: currentTime,
          });
        }

        return result;
      }

      return Array.from(cachedEntry.entities);
    }

    // If not time to update, return cached result if available
    const cachedEntry = cache.get(cellKey);
    if (cachedEntry && cachedEntry.entities.size > 0) {
      return Array.from(cachedEntry.entities);
    }

    // If no cache available, calculate and cache
    const adjustedRadius = radius * config.radiusMultiplier;
    const result = this.calculateNearbyEntities(position, adjustedRadius, queryType);
    if (result.length > 0) {
      cache.set(cellKey, {
        entities: new Set(result),
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
        cell.entities.forEach((entityId) => {
          result.push(...this.filterEntityByQueryType(cell, entityId, queryType));
        });
      }
    }

    return result;
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
    this.worldSize = { width: 0, height: 0 };
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

    const result: string[] = [];
    cell.entities.forEach((entityId) => {
      result.push(...this.filterEntityByQueryType(cell, entityId, queryType));
    });

    return result;
  }

  private filterEntityByQueryType(
    cell: GridCell,
    entityId: string,
    queryType: SpatialQueryType,
  ): string[] {
    const result: string[] = [];
    switch (queryType) {
      case 'collision-distant':
      case 'collision':
        if (
          cell.entityTypes.get(entityId) === 'enemy' ||
          cell.entityTypes.get(entityId) === 'player' ||
          cell.entityTypes.get(entityId) === 'projectile' ||
          cell.entityTypes.get(entityId) === 'areaEffect'
        ) {
          result.push(entityId);
        }
        break;
      case 'damage':
        if (
          cell.entityTypes.get(entityId) === 'enemy' ||
          cell.entityTypes.get(entityId) === 'projectile' ||
          cell.entityTypes.get(entityId) === 'areaEffect'
        ) {
          result.push(entityId);
        }
        break;
      case 'pickup':
        if (cell.entityTypes.get(entityId) === 'pickup') {
          result.push(entityId);
        }
        break;
    }
    return result;
  }
}
