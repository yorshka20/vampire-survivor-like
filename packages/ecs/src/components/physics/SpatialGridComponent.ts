import { Component } from '@ecs/core/ecs/Component';
import { EntityType } from '@ecs/core/ecs/types';
import { Point, RectArea } from '@ecs/types/types';

/**
 * Grid cell with pre-classified entity storage for better performance.
 * Each entity type is stored in its own Set so queries never filter at runtime.
 *
 * There is intentionally no "all entities" Set: every spatial query type maps to
 * one or more of the classified sets, so a combined set would only ever add a
 * third write per insert with no reader. `count` tracks how many ids live across
 * all classified sets, which is all we need to know when a cell becomes empty.
 */
export interface GridCell {
  enemies: Set<string>;
  projectiles: Set<string>;
  pickups: Set<string>;
  players: Set<string>;
  areaEffects: Set<string>;
  objects: Set<string>;
  obstacles: Set<string>;
  // Number of ids stored across all classified sets above. Used to detect when a
  // cell is empty so it can be released back to the pool.
  count: number;
  // Integer cell coordinates, set when the cell is placed in the grid. Lets
  // consumers walk neighbours arithmetically instead of re-parsing the "x,y" key.
  cellX: number;
  cellY: number;
  // Transient per-frame scratch for consumers that assign cells a dense index
  // (e.g. ParallelCollisionSystem's shared-memory cell directory). Not maintained
  // by the grid itself; a consumer that uses it must (re)set it every frame.
  cellIndex: number;
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
export type SpatialQueryType =
  | 'collision'
  | 'damage'
  | 'collision-distant'
  | 'pickup'
  | 'obstacle'
  | 'object';

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
  public cellSize: number;
  /** internal raw data bucket. should not be used directly by others. */
  private grid: Map<string, GridCell> = new Map();

  // Cache system with local invalidation support
  private readonly caches: Map<SpatialQueryType, Map<string, CacheEntry>> = new Map();
  private readonly cacheConfigs: Map<SpatialQueryType, CacheConfig> = new Map();
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

    this.caches.set('object', new Map());
    this.cacheConfigs.set('object', {
      ttl: 50, // 50ms TTL
      radiusMultiplier: 1.0, // Normal radius
      updateFrequency: 1, // Update every frame
    });
  }

  /**
   * Returns the cell key for a given x, y position.
   * Negative coordinates are valid — the grid is an unbounded spatial hash.
   */
  private getCellKey(x: number, y: number): string {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return `${cellX},${cellY}`;
  }

  getCellByKey(key: string) {
    return this.grid.get(key);
  }

  getCellBounds(cellKey: string): { x: number; y: number; width: number; height: number } {
    const [cellX, cellY] = cellKey.split(',').map(Number);
    return {
      x: cellX * this.cellSize,
      y: cellY * this.cellSize,
      width: this.cellSize,
      height: this.cellSize,
    };
  }

  /**
   * only for full iteration. not used for cache read.
   * @returns
   */
  getAllGrids() {
    return this.grid;
  }

  /**
   * Create a new grid cell with pre-classified entity storage
   */
  private createGridCell(): GridCell {
    return {
      enemies: new Set(),
      projectiles: new Set(),
      pickups: new Set(),
      players: new Set(),
      areaEffects: new Set(),
      objects: new Set(),
      obstacles: new Set(),
      count: 0,
      cellX: 0,
      cellY: 0,
      cellIndex: -1,
    };
  }

  /**
   * Every entity type the grid stores. Keep in sync with getEntitySetByType — it
   * is the set of types a rect query can return. Used to query "all entities in a
   * region" without the caller having to spell out the type list.
   */
  static readonly INDEXED_TYPES: readonly EntityType[] = [
    'enemy',
    'projectile',
    'pickup',
    'player',
    'areaEffect',
    'object',
    'obstacle',
  ];

  /**
   * Whether an entity type is indexed by the spatial grid.
   *
   * Only types that some query type can return are stored. Types like 'spawner'
   * or 'other' are never looked up by position, so indexing them would just cost
   * inserts/removes for ids no query ever reads.
   */
  isIndexedType(entityType: EntityType): boolean {
    return this.getEntitySetByType(this.probeCell, entityType) !== null;
  }

  // Shared throwaway cell used only by isIndexedType() to reuse the switch below
  // without allocating. Its sets are never mutated.
  private readonly probeCell: GridCell = this.createGridCell();

  /**
   * Get the appropriate entity set for a type, or null if the type is not indexed.
   */
  private getEntitySetByType(cell: GridCell, entityType: EntityType): Set<string> | null {
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
        return null; // non-spatial types (spawner/other) are not indexed
    }
  }

  // --- Cell pooling -------------------------------------------------------
  // A full rebuild clears the whole grid every frame. Recreating a GridCell
  // (8 Sets) per occupied cell each frame produced large GC churn, so cells are
  // recycled through this pool instead of being allocated and thrown away.
  private readonly cellPool: GridCell[] = [];

  private acquireCell(): GridCell {
    const cell = this.cellPool.pop();
    return cell ?? this.createGridCell();
  }

  private releaseCell(cell: GridCell): void {
    cell.enemies.clear();
    cell.projectiles.clear();
    cell.pickups.clear();
    cell.players.clear();
    cell.areaEffects.clear();
    cell.objects.clear();
    cell.obstacles.clear();
    cell.count = 0;
    this.cellPool.push(cell);
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
   * Get all cell coordinates covered by an entity at position with optional size.
   * Returns all cells the entity's AABB intersects, with no viewport-based filtering —
   * the grid is an unbounded spatial hash and supports negative coordinates.
   */
  private getCoveredCellCoords(position: Point, size?: [number, number]): [number, number][] {
    if (!size) {
      const cellX = Math.floor(position[0] / this.cellSize);
      const cellY = Math.floor(position[1] / this.cellSize);
      return [[cellX, cellY]];
    }
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
        coords.push([x, y]);
      }
    }
    return coords;
  }

  /**
   * Insert entity into grid with pre-classified storage.
   * Registers to all cells covered by its AABB if size is provided.
   *
   * @param invalidate When true (incremental updates), the affected cells' cache
   *   entries are dropped. During a full rebuild the caller has already cleared
   *   every cache via clear(), so per-cell invalidation would be ~54 wasted
   *   Map.delete calls per entity — pass false to skip it.
   */
  insert(
    entityId: string,
    position: Point,
    entityType: EntityType,
    size?: [number, number],
    invalidate: boolean = true,
  ): void {
    // Skip types no query ever reads (spawner/other) — they cost writes for nothing.
    if (!this.isIndexedType(entityType)) return;

    const cellCoords = this.getCoveredCellCoords(position, size);
    for (const [cellX, cellY] of cellCoords) {
      const cellKey = `${cellX},${cellY}`;
      let cell = this.grid.get(cellKey);
      if (!cell) {
        cell = this.acquireCell();
        cell.cellX = cellX;
        cell.cellY = cellY;
        this.grid.set(cellKey, cell);
      }
      const entitySet = this.getEntitySetByType(cell, entityType)!;
      if (!entitySet.has(entityId)) {
        entitySet.add(entityId);
        cell.count++;
      }
      if (invalidate) {
        this.invalidateCacheForCell(cellX, cellY);
      }
    }
  }

  /**
   * Remove entity from grid.
   * Removes from all cells covered by its AABB if size is provided.
   *
   * entityType is required: it must match the type the entity was inserted with so
   * the right classified set is targeted (an entity always lives in exactly one set
   * per cell).
   */
  remove(entityId: string, position: Point, entityType: EntityType, size?: [number, number]): void {
    if (!this.isIndexedType(entityType)) return;

    const cellCoords = this.getCoveredCellCoords(position, size);
    for (const [cellX, cellY] of cellCoords) {
      const cellKey = `${cellX},${cellY}`;
      const cell = this.grid.get(cellKey);
      if (!cell) continue;

      const deleted = this.getEntitySetByType(cell, entityType)!.delete(entityId);
      if (deleted) {
        cell.count--;
        if (cell.count === 0) {
          this.grid.delete(cellKey);
          this.releaseCell(cell);
        }
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
   * Get entities by query type using pre-classified storage.
   *
   * Within a single cell an id lives in exactly one classified set (an entity has
   * one type), so concatenating the sets never produces duplicates here — no
   * per-cell dedup is needed. Cross-cell duplicates (a large AABB spanning cells)
   * are deduped once by the caller in calculateNearbyEntities().
   */
  private getEntitiesByQueryType(cell: GridCell, queryType: SpatialQueryType): string[] {
    switch (queryType) {
      case 'collision-distant':
      case 'collision':
        // return all collidable types
        return [
          ...cell.enemies,
          ...cell.players,
          ...cell.projectiles,
          ...cell.areaEffects,
          ...cell.objects,
          ...cell.obstacles,
        ];
      case 'damage':
        return [...cell.enemies, ...cell.projectiles, ...cell.areaEffects];
      case 'pickup':
        return [...cell.pickups];
      case 'obstacle':
        return [...cell.obstacles];
      case 'object':
        return [...cell.objects];
      default:
        return [];
    }
  }

  private updateCaches(): void {
    // Clear all caches
    this.caches.forEach((cache) => cache.clear());
  }

  private invalidateCaches(): void {
    this.updateCaches();
  }

  // Call this method every frame to update frame counter
  updateFrame(): void {
    this.frameCount++;
  }

  clear(): void {
    // Recycle occupied cells back into the pool instead of dropping them, so the
    // next rebuild reuses their Sets rather than allocating fresh ones.
    for (const cell of this.grid.values()) {
      this.releaseCell(cell);
    }
    this.grid.clear();
    this.invalidateCaches();
  }

  reset(): void {
    super.reset();
    this.grid.clear();
    this.cellPool.length = 0;
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

  /**
   * Visit each entity of the given types whose cell overlaps a world-space rect,
   * exactly once. This is the spatial primitive for viewport culling: the cost is
   * bounded by the cells the rect covers (i.e. the viewport), never the world —
   * so it stays cheap no matter how many entities exist off-screen.
   *
   * We walk by cell COORDINATE (not over all populated cells) precisely so the
   * cost tracks the viewport rather than world occupancy. `visit` is called with
   * each id once; entities spanning several covered cells are deduped. Not
   * re-entrant (a shared dedup set is not used — `visit` may allocate but must not
   * start another rect query).
   */
  // Reused across rect queries so a per-frame viewport cull allocates no Set.
  // Safe because queries are synchronous and non-re-entrant (see forEachEntityInRect).
  private readonly rectQuerySeen = new Set<string>();

  forEachEntityInRect(
    rect: RectArea,
    types: readonly EntityType[],
    visit: (entityId: string) => void,
  ): void {
    const cs = this.cellSize;
    const cellMinX = Math.floor(rect[0] / cs);
    const cellMaxX = Math.floor((rect[0] + rect[2]) / cs);
    const cellMinY = Math.floor(rect[1] / cs);
    const cellMaxY = Math.floor((rect[1] + rect[3]) / cs);

    const seen = this.rectQuerySeen;
    seen.clear();
    for (let cx = cellMinX; cx <= cellMaxX; cx++) {
      for (let cy = cellMinY; cy <= cellMaxY; cy++) {
        this.visitCellEntities(`${cx},${cy}`, types, seen, visit);
      }
    }
  }

  /** Visit the not-yet-seen entities of `types` in one cell. */
  private visitCellEntities(
    cellKey: string,
    types: readonly EntityType[],
    seen: Set<string>,
    visit: (entityId: string) => void,
  ): void {
    const cell = this.grid.get(cellKey);
    if (!cell) {
      return;
    }
    for (const type of types) {
      const set = this.getEntitySetByType(cell, type);
      if (!set) {
        continue;
      }
      for (const id of set) {
        if (!seen.has(id)) {
          seen.add(id);
          visit(id);
        }
      }
    }
  }

  // Get all entities in a specific cell
  getEntitiesInCell(cellKey: string, queryType: SpatialQueryType = 'collision'): string[] {
    const cell = this.grid.get(cellKey);
    if (!cell) return [];

    // Use pre-classified storage for better performance
    return this.getEntitiesByQueryType(cell, queryType);
  }
}
