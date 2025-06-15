import { Component } from '@ecs/core/ecs/Component';
import { Point } from '@ecs/utils/types';

interface GridCell {
  entities: Set<string>;
  entityTypes: Map<string, string>; // Add entity type mapping
}

// Cache types for different spatial queries
export type SpatialQueryType = 'collision' | 'damage' | 'weapon' | 'pickup';

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
  private cellSize: number;
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

    // Initialize weapon cache (least frequent updates, largest radius)
    this.caches.set('weapon', new Map());
    this.cacheConfigs.set('weapon', {
      ttl: 200, // 200ms TTL
      radiusMultiplier: 2.0, // Largest radius for weapon targeting
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
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
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

  insert(entityId: string, position: Point, entityType: string): void {
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
        cache.set(cellKey, {
          entities: new Set(result),
          timestamp: currentTime,
        });

        return result;
      }

      return Array.from(cachedEntry.entities);
    }

    // If not time to update, return cached result if available
    const cachedEntry = cache.get(cellKey);
    if (cachedEntry) {
      return Array.from(cachedEntry.entities);
    }

    // If no cache available, calculate and cache
    const adjustedRadius = radius * config.radiusMultiplier;
    const result = this.calculateNearbyEntities(position, adjustedRadius, queryType);
    cache.set(cellKey, {
      entities: new Set(result),
      timestamp: currentTime,
    });

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
        if (cell) {
          cell.entities.forEach((entityId) => {
            if (cell.entityTypes.get(entityId) === queryType) {
              result.push(entityId);
            }
          });
        }
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
}
