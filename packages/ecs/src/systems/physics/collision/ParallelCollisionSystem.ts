import { PhysicsComponent, ShapeComponent, TransformComponent } from '@ecs/components';
import type { GridCell } from '@ecs/components/physics/SpatialGridComponent';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { WorkerPoolManager } from '@ecs/core/worker';
import { FORWARD_NEIGHBORS } from './broadPhase';
import {
  CD_FWD0,
  CD_MEMBER_COUNT,
  CD_MEMBER_START,
  CELL_DIR_STRIDE,
  CELL_FWD_COUNT,
  ENTITY_STRIDE,
  E_POS_X,
  E_POS_Y,
  E_SIZE_X,
  E_SIZE_Y,
  E_TYPE,
  RESULT_STRIDE,
  R_INDEX_A,
  R_INDEX_B,
  R_NORMAL_X,
  R_NORMAL_Y,
  R_PENETRATION,
  shapeCodeToType,
  shapeTypeToCode,
} from './collisionSabLayout';
import {
  CollisionPair,
  CollisionResult,
  getCollisionNormalAndPenetration,
  getCollisionNormalAndPenetrationScalar,
} from './collisionUtils';

/**
 * Per-frame dispatch context returned by startCollisionDetection: the worker
 * completion promises plus where each worker's results live in the shared buffer.
 */
interface CollisionDispatch {
  promises: Promise<unknown>[];
  /** Per worker: the pair index at which it began writing results into resultView. */
  resultStarts: number[];
  /** Active entity count this frame — the modulus for the collision-dedup key. */
  entityCount: number;
}

interface ClusterInfo {
  bodies: Set<string>; // Store entity IDs
  totalEnergy: number;
  isSleeping: boolean;
  sleepTimer: number;
}
/**
 * @class ParallelCollisionSystem
 * @description A collision system that uses Web Workers to parallelize collision detection.
 *
 * This system orchestrates the following process each frame:
 * 1. Gathers the state of all collidable entities.
 * 2. Divides the spatial grid cells among a pool of Web Workers.
 * 3. Sends the entity data and assigned cells to each worker.
 * 4. Awaits collision results (pairs of colliding entity IDs) from all workers.
 * 5. Aggregates the results and resolves each unique collision on the main thread.
 *
 * This approach offloads the O(n^2) detection phase to background threads,
 * freeing up the main thread to focus on rendering and other logic. The resolution
 * phase remains on the main thread to ensure deterministic state changes and avoid race conditions.
 */
export class ParallelCollisionSystem extends System {
  private workerPoolManager: WorkerPoolManager;
  private clusters: Map<string, ClusterInfo> = new Map();
  private entityToClusterMap: Map<string, string> = new Map();
  private readonly SLEEP_ENERGY_THRESHOLD = 0.05;
  private readonly SLEEP_DELAY = 1000; // 1 second

  // --- SharedArrayBuffer-backed broad-phase payload ---
  // These buffers are reused (and only grown) across frames so the per-frame
  // allocation of the worker payload drops to ~0, eliminating the structuredClone
  // object tree that previously drove worker-side Major GC.
  private entitySab: SharedArrayBuffer;
  private entityView: Float64Array;
  private entityCapacity = 0; // in entities

  // Cell directory: the grid description the workers enumerate from.
  private memberSab: SharedArrayBuffer; // flat per-cell member entity indices
  private memberView: Int32Array;
  private memberCapacity = 0; // in member slots
  private cellDirSab: SharedArrayBuffer; // per-cell [memberStart, memberCount, fwd0..3]
  private cellDirView: Int32Array;
  private cellDirCapacity = 0; // in cells

  private resultSab: SharedArrayBuffer;
  private resultView: Float64Array;
  private resultCapacity = 0; // in result slots (one per detected collision)

  private countSab: SharedArrayBuffer;
  private countView: Int32Array;

  // Reused per-frame scratch (avoids per-frame allocation of the index maps).
  private idToIndex: Map<string, number> = new Map();
  private indexToEntityId: string[] = [];
  private checkedPairs: Set<number> = new Set();
  // Reused per-cell-index arrays: the cell behind each dense cellIndex, and that
  // cell's estimated candidate-pair count (used to size + balance worker ranges).
  private cellList: GridCell[] = [];
  private candidate: number[] = [];
  // Reused per-cell index buffers for the single-thread broad-phase sweep.
  private scratchCellIdx: number[] = [];
  private scratchNeighborIdx: number[] = [];
  // Reused adjacency list + traversal stack for connected-component clustering,
  // so identifyClusters is O(V + E) instead of re-scanning every pair per node.
  private clusterAdjacency: Map<string, string[]> = new Map();
  private clusterStack: string[] = [];

  // The shared buffers are reused across frames, so only one collision batch may
  // touch them at a time. The game loop fires logic sub-steps without awaiting
  // (see GameLoop.updateLogic), so without this guard a new frame could overwrite
  // the buffers while the previous frame's workers are still reading them.
  private collisionInFlight = false;

  /**
   * @param positionalCorrectTimes resolution iterations per frame.
   * @param useWorkers when true, the broad + narrow phase runs across the worker
   *   pool; when false (default) it runs inline on the main thread. For this
   *   workload single-thread wins: the per-pair narrow phase is microseconds, so
   *   the postMessage round-trip + per-frame serialization dominate — offloading
   *   it costs more than it saves. The worker path is kept for that comparison.
   */
  constructor(
    private positionalCorrectTimes: number = 6,
    private useWorkers: boolean = false,
  ) {
    super('ParallelCollisionSystem', SystemPriorities.COLLISION, 'logic');

    this.workerPoolManager = WorkerPoolManager.getInstance();

    // countSab has a fixed slot per worker; allocate once.
    const workerCount = Math.max(1, this.workerPoolManager.getWorkerCount());
    this.countSab = new SharedArrayBuffer(workerCount * Int32Array.BYTES_PER_ELEMENT);
    this.countView = new Int32Array(this.countSab);

    // Seed shared buffers; they grow on demand in ensure*Capacity().
    this.entitySab = new SharedArrayBuffer(0);
    this.entityView = new Float64Array(this.entitySab);
    this.memberSab = new SharedArrayBuffer(0);
    this.memberView = new Int32Array(this.memberSab);
    this.cellDirSab = new SharedArrayBuffer(0);
    this.cellDirView = new Int32Array(this.cellDirSab);
    this.resultSab = new SharedArrayBuffer(0);
    this.resultView = new Float64Array(this.resultSab);
    this.ensureEntityCapacity(1024);
    this.ensureMemberCapacity(1024);
    this.ensureCellDirCapacity(512);
    this.ensureResultCapacity(4096);
  }

  /** Grow the entity column buffer to hold at least `count` entities (never shrinks). */
  private ensureEntityCapacity(count: number): void {
    if (count <= this.entityCapacity) return;
    let cap = this.entityCapacity || 1024;
    while (cap < count) cap *= 2;
    this.entityCapacity = cap;
    this.entitySab = new SharedArrayBuffer(cap * ENTITY_STRIDE * Float64Array.BYTES_PER_ELEMENT);
    this.entityView = new Float64Array(this.entitySab);
  }

  /** Grow the flat member buffer to hold at least `count` member slots (never shrinks). */
  private ensureMemberCapacity(count: number): void {
    if (count <= this.memberCapacity) return;
    let cap = this.memberCapacity || 1024;
    while (cap < count) cap *= 2;
    this.memberCapacity = cap;
    this.memberSab = new SharedArrayBuffer(cap * Int32Array.BYTES_PER_ELEMENT);
    this.memberView = new Int32Array(this.memberSab);
  }

  /** Grow the cell-directory buffer to hold at least `count` cells (never shrinks). */
  private ensureCellDirCapacity(count: number): void {
    if (count <= this.cellDirCapacity) return;
    let cap = this.cellDirCapacity || 512;
    while (cap < count) cap *= 2;
    this.cellDirCapacity = cap;
    this.cellDirSab = new SharedArrayBuffer(cap * CELL_DIR_STRIDE * Int32Array.BYTES_PER_ELEMENT);
    this.cellDirView = new Int32Array(this.cellDirSab);
  }

  /** Grow the result buffer to hold at least `count` collisions (never shrinks). */
  private ensureResultCapacity(count: number): void {
    if (count <= this.resultCapacity) return;
    let cap = this.resultCapacity || 4096;
    while (cap < count) cap *= 2;
    this.resultCapacity = cap;
    this.resultSab = new SharedArrayBuffer(cap * RESULT_STRIDE * Float64Array.BYTES_PER_ELEMENT);
    this.resultView = new Float64Array(this.resultSab);
  }

  // Main update loop
  async update(deltaTime: number): Promise<void> {
    if (!this.gridComponent) return;

    const grid = this.gridComponent.grid;
    if (!grid || grid.size === 0) return;

    this.updateClusters(deltaTime);

    if (!this.useWorkers) {
      // Single-thread: detect + resolve inline, no postMessage round-trip.
      this.resolveCollisions(this.detectCollisionsInline(grid));
      return;
    }

    // Worker path. Bail if a previous sub-step's workers are still reading the
    // shared buffers; re-entering would overwrite them mid-flight (collisionInFlight).
    if (this.collisionInFlight) return;

    const dispatch = this.startCollisionDetection(grid);
    if (!dispatch) return;

    this.collisionInFlight = true;
    try {
      await this.handleWorkerResults(dispatch);
    } finally {
      this.collisionInFlight = false;
    }
  }

  /**
   * Pack the frame's active object entities into the entity columns and build the
   * id <-> dense index maps. Returns the active entity count. Shared by the
   * single-thread and worker paths (both read the columns by index).
   */
  private writeEntityColumns(): number {
    const allEntities = this.world.getEntitiesByCondition(
      (entity) => entity.active && !entity.toRemove && entity.isType('object'),
    );

    this.ensureEntityCapacity(allEntities.length);
    this.idToIndex.clear();
    const ev = this.entityView;
    let entityCount = 0;

    for (const entity of allEntities) {
      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      const physics = entity.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
      const shape = entity.getComponent<ShapeComponent>(ShapeComponent.componentName);

      if (!transform || !physics || !shape) continue;
      if (physics.isAsleep()) continue; // Skip sleeping entities in broadphase

      const position = transform.getPosition();
      const size = shape.getSize();
      const base = entityCount * ENTITY_STRIDE;
      ev[base + E_POS_X] = position[0];
      ev[base + E_POS_Y] = position[1];
      ev[base + E_SIZE_X] = size[0];
      ev[base + E_SIZE_Y] = size[1];
      ev[base + E_TYPE] = shapeTypeToCode(shape.getType());

      this.idToIndex.set(entity.id, entityCount);
      this.indexToEntityId[entityCount] = entity.id;
      entityCount++;
    }

    return entityCount;
  }

  /**
   * Single-thread broad + narrow phase: the same forward-neighbour cell sweep the
   * workers run, but executed inline reading the entity columns, collecting
   * collisions into a plain array. No SAB, no postMessage. Duplicates from
   * multi-cell entities are collapsed by an integer key here (collisions are
   * sparse), so the sweep itself does no dedup.
   */
  private detectCollisionsInline(grid: Map<string, GridCell>): CollisionPair[] {
    const entityCount = this.writeEntityColumns();
    const collisions: CollisionPair[] = [];
    if (entityCount < 2) return collisions;

    const ev = this.entityView;
    const cellIdx = this.scratchCellIdx;
    const nbrIdx = this.scratchNeighborIdx;
    const neighbors = FORWARD_NEIGHBORS;
    const seen = this.checkedPairs;
    seen.clear();

    for (const cell of grid.values()) {
      if (cell.objects.size < 1) continue;
      const m = this.resolveCellObjectIndices(cell.objects, cellIdx);
      if (m === 0) continue;

      // Within-cell pairs (i < j).
      for (let i = 0; i < m; i++) {
        const indexA = cellIdx[i];
        for (let j = i + 1; j < m; j++) {
          this.testInlinePair(ev, indexA, cellIdx[j], entityCount, seen, collisions);
        }
      }

      // Cell x forward-neighbour pairs.
      for (let k = 0; k < neighbors.length; k++) {
        const offset = neighbors[k];
        const neighbor = grid.get(`${cell.cellX + offset[0]},${cell.cellY + offset[1]}`);
        if (!neighbor || neighbor.objects.size < 1) continue;

        const n = this.resolveCellObjectIndices(neighbor.objects, nbrIdx);
        for (let i = 0; i < m; i++) {
          const indexA = cellIdx[i];
          for (let j = 0; j < n; j++) {
            const indexB = nbrIdx[j];
            if (indexA === indexB) continue; // same entity spanning both cells
            this.testInlinePair(ev, indexA, indexB, entityCount, seen, collisions);
          }
        }
      }
    }

    return collisions;
  }

  /** Narrow-phase one candidate pair, pushing a deduped collision if they overlap. */
  private testInlinePair(
    ev: Float64Array,
    ia: number,
    ib: number,
    entityCount: number,
    seen: Set<number>,
    out: CollisionPair[],
  ): void {
    const aBase = ia * ENTITY_STRIDE;
    const bBase = ib * ENTITY_STRIDE;
    const collision = getCollisionNormalAndPenetrationScalar(
      ev[aBase + E_POS_X],
      ev[aBase + E_POS_Y],
      ev[aBase + E_SIZE_X],
      ev[aBase + E_SIZE_Y],
      shapeCodeToType(ev[aBase + E_TYPE]),
      ev[bBase + E_POS_X],
      ev[bBase + E_POS_Y],
      ev[bBase + E_SIZE_X],
      ev[bBase + E_SIZE_Y],
      shapeCodeToType(ev[bBase + E_TYPE]),
    );
    if (!collision) return;

    const key = ia < ib ? ia * entityCount + ib : ib * entityCount + ia;
    if (seen.has(key)) return;
    seen.add(key);

    out.push({
      a: this.indexToEntityId[ia],
      b: this.indexToEntityId[ib],
      type: 'object-object',
      normal: collision.normal,
      penetration: collision.penetration,
    });
  }

  /**
   * Resolve a cell's object ids to this frame's dense entity indices, into the
   * reused `out` buffer. Ids not in the active set (asleep / skipped) are dropped.
   */
  private resolveCellObjectIndices(objects: Set<string>, out: number[]): number {
    let n = 0;
    for (const id of objects) {
      const idx = this.idToIndex.get(id);
      if (idx !== undefined) {
        out[n++] = idx;
      }
    }
    out.length = n;
    return n;
  }

  /**
   * Writes the current frame's entities and the grid's cell directory into shared
   * memory, then dispatches contiguous cell ranges to the worker pool — the broad
   * phase (candidate enumeration) runs inside the workers.
   *
   * Returns null when there is nothing to do, otherwise the worker completion
   * promises plus each worker's result-region start slot.
   */
  private startCollisionDetection(grid: Map<string, GridCell>): CollisionDispatch | null {
    // 1. Write entity columns into shared memory and build id -> dense index maps.
    const entityCount = this.writeEntityColumns();
    if (entityCount < 2) return null;

    // 2. Describe the grid for the workers: a flat member buffer + a per-cell
    //    directory (member slice + forward-neighbour cell indices). This is the
    //    only broad-phase work the main thread does now — O(N + cells), not
    //    O(pairs); the actual pair enumeration happens inside the workers.
    const cellCount = this.buildCellDirectory(grid);
    if (cellCount === 0) return null;

    // 3. Estimate each cell's candidate-pair count (cheap arithmetic from member
    //    counts). The total sizes the result buffer; the running sum both starts
    //    each worker's disjoint result region and balances the cell ranges.
    const totalCandidates = this.computeCandidateCounts(cellCount);
    if (totalCandidates === 0) return null;
    this.ensureResultCapacity(totalCandidates);
    this.countView.fill(0); // reset per-worker collision counts before dispatch

    // 4. Partition cells into contiguous ranges of ~equal candidate count, one
    //    per worker. Worker w's result region starts at the prefix sum of
    //    candidate counts before its first cell, so the regions never overlap.
    const candidate = this.candidate;
    const workerCount = this.workerPoolManager.getWorkerCount();
    const target = totalCandidates / workerCount;

    const promises: Promise<unknown>[] = [];
    const resultStarts: number[] = [];
    let workerIndex = 0;
    let rangeStartCell = 0;
    let rangeStartSlot = 0; // prefix sum of candidate counts before rangeStartCell
    let rangeCount = 0; // candidate count accumulated in the current range
    let cumulative = 0;

    for (let c = 0; c < cellCount; c++) {
      rangeCount += candidate[c];
      cumulative += candidate[c];

      const isLast = c === cellCount - 1;
      const reachedTarget = cumulative >= target * (workerIndex + 1);
      if (!isLast && !(reachedTarget && workerIndex < workerCount - 1)) {
        continue;
      }

      const endCell = c + 1;
      if (rangeCount > 0) {
        resultStarts.push(rangeStartSlot);
        promises.push(
          this.workerPoolManager.submitTask(
            'collisionSab',
            {
              entityBuffer: this.entitySab,
              memberBuffer: this.memberSab,
              cellDirBuffer: this.cellDirSab,
              resultBuffer: this.resultSab,
              countBuffer: this.countSab,
              workerIndex,
              startCell: rangeStartCell,
              endCell,
              resultSlotStart: rangeStartSlot,
              resultSlotCapacity: rangeCount,
            },
            this.priority,
          ),
        );
        workerIndex++;
      }

      rangeStartCell = endCell;
      rangeStartSlot += rangeCount;
      rangeCount = 0;
    }

    if (promises.length === 0) return null;
    return { promises, resultStarts, entityCount };
  }

  /**
   * Build this frame's shared cell directory:
   *  - assign every grid cell with >= 1 active member a dense `cellIndex`,
   *  - append its members (active entity indices) to the flat member buffer,
   *  - record each cell's member slice and its 4 forward-neighbour cell indices.
   *
   * Returns the cell count. The forward-neighbour resolution is the only string
   * work, and it is O(cells), not O(pairs).
   */
  private buildCellDirectory(grid: Map<string, GridCell>): number {
    // Upper bound on member slots: every (entity, cell) membership, asleep included.
    let memberUpper = 0;
    for (const cell of grid.values()) {
      memberUpper += cell.objects.size;
    }
    this.ensureMemberCapacity(memberUpper);
    this.ensureCellDirCapacity(grid.size);

    const mv = this.memberView;
    const dv = this.cellDirView;
    const idToIndex = this.idToIndex;
    const cellList = this.cellList;

    // Pass 1: assign cellIndex + append active members. Cells with no active
    // member get cellIndex -1, so neighbour lookups in pass 2 treat them as absent.
    let cellCount = 0;
    let memberPos = 0;
    for (const cell of grid.values()) {
      const startPos = memberPos;
      for (const id of cell.objects) {
        const idx = idToIndex.get(id);
        if (idx !== undefined) {
          mv[memberPos++] = idx;
        }
      }

      const count = memberPos - startPos;
      if (count === 0) {
        cell.cellIndex = -1;
        continue;
      }

      cell.cellIndex = cellCount;
      cellList[cellCount] = cell;
      const dBase = cellCount * CELL_DIR_STRIDE;
      dv[dBase + CD_MEMBER_START] = startPos;
      dv[dBase + CD_MEMBER_COUNT] = count;
      cellCount++;
    }

    // Pass 2: resolve each cell's forward neighbours to their cellIndex (or -1).
    for (let c = 0; c < cellCount; c++) {
      const cell = cellList[c];
      const dBase = c * CELL_DIR_STRIDE;
      for (let k = 0; k < CELL_FWD_COUNT; k++) {
        const offset = FORWARD_NEIGHBORS[k];
        const neighbor = grid.get(`${cell.cellX + offset[0]},${cell.cellY + offset[1]}`);
        dv[dBase + CD_FWD0 + k] = neighbor ? neighbor.cellIndex : -1;
      }
    }

    return cellCount;
  }

  /**
   * Per-cell candidate-pair count estimate: within-cell C(m, 2) plus, for each
   * forward neighbour, m x (neighbour member count). Fills `this.candidate` and
   * returns the total — an upper bound on collisions used to size the result
   * buffer and balance worker ranges. Pure arithmetic; no enumeration.
   */
  private computeCandidateCounts(cellCount: number): number {
    const dv = this.cellDirView;
    const candidate = this.candidate;
    let total = 0;

    for (let c = 0; c < cellCount; c++) {
      const dBase = c * CELL_DIR_STRIDE;
      const m = dv[dBase + CD_MEMBER_COUNT];
      let count = (m * (m - 1)) / 2; // within-cell pairs

      for (let k = 0; k < CELL_FWD_COUNT; k++) {
        const nc = dv[dBase + CD_FWD0 + k];
        if (nc >= 0) {
          count += m * dv[nc * CELL_DIR_STRIDE + CD_MEMBER_COUNT];
        }
      }

      candidate[c] = count;
      total += count;
    }

    return total;
  }

  // Awaits workers, reads collisions out of shared memory, and resolves them
  private async handleWorkerResults(dispatch: CollisionDispatch) {
    try {
      await Promise.all(dispatch.promises);

      // Read detected collisions back out of the shared result buffer. Each
      // worker wrote `count` entries starting at its pair-range offset.
      //
      // Dedup here, on the collisions (sparse), rather than on every candidate
      // pair in the broad phase: a multi-cell entity can have the same pair
      // emitted by more than one worker, so collapse them by an integer key.
      const rv = this.resultView;
      const entityCount = dispatch.entityCount;
      const seen = this.checkedPairs;
      seen.clear();
      const allCollisions: CollisionPair[] = [];
      for (let i = 0; i < dispatch.resultStarts.length; i++) {
        const count = Atomics.load(this.countView, i);
        const start = dispatch.resultStarts[i];
        for (let k = 0; k < count; k++) {
          const base = (start + k) * RESULT_STRIDE;
          const ia = rv[base + R_INDEX_A];
          const ib = rv[base + R_INDEX_B];
          const key = ia < ib ? ia * entityCount + ib : ib * entityCount + ia;
          if (seen.has(key)) continue;
          seen.add(key);
          allCollisions.push({
            a: this.indexToEntityId[ia],
            b: this.indexToEntityId[ib],
            type: 'object-object',
            normal: [rv[base + R_NORMAL_X], rv[base + R_NORMAL_Y]],
            penetration: rv[base + R_PENETRATION],
          });
        }
      }

      this.resolveCollisions(allCollisions);
    } catch (error) {
      console.error('Error in collision worker:', error);
    }
  }

  /**
   * Cluster the colliding entities (for the sleep system) and iteratively resolve
   * the collisions on the main thread — the single writer of physics state, which
   * keeps replay deterministic. Shared by the single-thread and worker paths.
   */
  private resolveCollisions(allCollisions: CollisionPair[]): void {
    const uniqueCollisions = this.filterUniqueCollisions(allCollisions);
    this.identifyClusters(uniqueCollisions);
    if (uniqueCollisions.size === 0) return;

    // The resolution process is iterative.
    for (let i = 0; i < this.positionalCorrectTimes; i++) {
      let hasCollisions = false;
      for (const pair of uniqueCollisions) {
        const entityA = this.world.getEntityById(pair.a);
        const entityB = this.world.getEntityById(pair.b);

        if (
          !entityA ||
          !entityB ||
          !entityA.active ||
          !entityB.active ||
          entityA.toRemove ||
          entityB.toRemove
        ) {
          // Entities are no longer valid, drop the pair.
          uniqueCollisions.delete(pair);
          continue;
        }

        const physicsA = entityA.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
        const physicsB = entityB.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
        if (physicsA?.isAsleep() && physicsB?.isAsleep()) {
          continue;
        }
        if (physicsA?.isAsleep() || physicsB?.isAsleep()) {
          this.wakeUpClusterForEntity(physicsA.isAsleep() ? entityA.id : entityB.id);
        }

        // First pass uses the pre-computed result; later passes recompute as positions move.
        const result: CollisionResult =
          i === 0
            ? { normal: pair.normal, penetration: pair.penetration }
            : this.checkObjectObjectCollision(entityA, entityB);

        if (result && result.penetration > 0) {
          this.resolveObjectObjectCollision(entityA, entityB, result);
          hasCollisions = true;
        } else {
          // No collision in this pass, remove it from the set.
          uniqueCollisions.delete(pair);
        }
      }

      // If nothing was resolved in a pass, stop early.
      if (!hasCollisions) break;
    }
  }

  /**
   * Group colliding entities into connected components (clusters) for the sleep
   * system. This is a connected-components pass: O(V + E) via an adjacency list
   * and an explicit stack — the previous version re-scanned the entire collision
   * set for every node (O(V·P)) and dequeued with Array.shift (O(n) each).
   *
   * `this.clusters` is rebuilt every frame; clearing it here also stops the old
   * `cluster_<id>` keys from accumulating frame after frame.
   */
  private identifyClusters(collisions: Set<CollisionPair>): void {
    this.entityToClusterMap.clear();
    this.clusters.clear();

    // Build the adjacency list once: O(E).
    const adj = this.clusterAdjacency;
    adj.clear();
    for (const pair of collisions) {
      const a = adj.get(pair.a);
      if (a) {
        a.push(pair.b);
      } else {
        adj.set(pair.a, [pair.b]);
      }

      const b = adj.get(pair.b);
      if (b) {
        b.push(pair.a);
      } else {
        adj.set(pair.b, [pair.a]);
      }
    }

    const visited = this.entityToClusterMap; // reuse: presence == visited
    const stack = this.clusterStack;

    for (const seed of adj.keys()) {
      if (visited.has(seed)) continue;

      const clusterId = `cluster_${seed}`;
      const bodies = new Set<string>();
      stack.length = 0;
      stack.push(seed);
      visited.set(seed, clusterId);

      while (stack.length > 0) {
        const current = stack.pop()!; // O(1), unlike Array.shift
        bodies.add(current);

        const neighbors = adj.get(current)!;
        for (let i = 0; i < neighbors.length; i++) {
          const nb = neighbors[i];
          if (!visited.has(nb)) {
            visited.set(nb, clusterId);
            stack.push(nb);
          }
        }
      }

      this.clusters.set(clusterId, {
        bodies,
        totalEnergy: 0,
        isSleeping: false,
        sleepTimer: 0,
      });
    }
  }

  private updateClusters(deltaTime: number): void {
    for (const [clusterId, cluster] of this.clusters.entries()) {
      let totalKineticEnergy = 0;
      let allSleeping = true;
      for (const entityId of cluster.bodies) {
        const entity = this.world.getEntityById(entityId);
        if (entity) {
          const physics = entity.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
          if (physics) {
            const vel = physics.getVelocity();
            totalKineticEnergy += 0.5 * (vel[0] ** 2 + vel[1] ** 2);
            if (!physics.isAsleep()) {
              allSleeping = false;
            }
          }
        }
      }
      cluster.totalEnergy = totalKineticEnergy;

      if (cluster.totalEnergy < this.SLEEP_ENERGY_THRESHOLD && !allSleeping) {
        cluster.sleepTimer += deltaTime * 1000; // convert to ms
        if (cluster.sleepTimer > this.SLEEP_DELAY) {
          this.putClusterToSleep(cluster);
        }
      } else {
        cluster.sleepTimer = 0;
        if (cluster.isSleeping) {
          this.wakeUpCluster(cluster);
        }
      }
    }
  }

  private putClusterToSleep(cluster: ClusterInfo): void {
    cluster.isSleeping = true;
    for (const entityId of cluster.bodies) {
      const entity = this.world.getEntityById(entityId);
      if (entity) {
        const physics = entity.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
        if (physics) {
          physics.velocity = [0, 0];
          physics.isSleeping = true;
        }
      }
    }
  }

  private wakeUpCluster(cluster: ClusterInfo): void {
    cluster.isSleeping = false;
    for (const entityId of cluster.bodies) {
      const entity = this.world.getEntityById(entityId);
      if (entity) {
        const physics = entity.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
        if (physics) {
          physics.wakeUp();
        }
      }
    }
  }

  private wakeUpClusterForEntity(entityId: string): void {
    const clusterId = this.entityToClusterMap.get(entityId);
    if (clusterId) {
      const cluster = this.clusters.get(clusterId);
      if (cluster && cluster.isSleeping) {
        this.wakeUpCluster(cluster);
      }
    }
  }

  // Check exact collision between two entities
  private checkObjectObjectCollision(
    entityA: Entity,
    entityB: Entity,
  ): { normal: [number, number]; penetration: number } | null {
    const transformA = entityA.getComponent<TransformComponent>(TransformComponent.componentName);
    const transformB = entityB.getComponent<TransformComponent>(TransformComponent.componentName);
    const shapeA = entityA.getComponent<ShapeComponent>(ShapeComponent.componentName);
    const shapeB = entityB.getComponent<ShapeComponent>(ShapeComponent.componentName);

    if (!transformA || !transformB || !shapeA || !shapeB) return null;

    const posA = transformA.getPosition();
    const posB = transformB.getPosition();
    const sizeA = shapeA.getSize();
    const sizeB = shapeB.getSize();
    const typeA = shapeA.getType();
    const typeB = shapeB.getType();

    return getCollisionNormalAndPenetration(posA, sizeA, typeA, posB, sizeB, typeB);
  }

  // Filters out duplicate collision pairs
  private filterUniqueCollisions(allCollisions: CollisionPair[]): Set<CollisionPair> {
    const uniquePairs = new Set<CollisionPair>();
    for (const pair of allCollisions) {
      // Assuming CollisionPair objects are referentially unique or can be stringified for Set uniqueness
      // For now, we will add the object directly if it has a consistent structure.
      // If simple string keys were used previously, ensure they are still compatible.
      uniquePairs.add(pair);
    }
    return uniquePairs;
  }

  /**
   * Resolve collision for two dynamic objects (balls) with iterative positional correction.
   * Moves both objects out of overlap along the Minimum Translation Vector (MTV) and reflects/dampens their velocities.
   *
   * @param entityA - The first entity involved in the collision.
   * @param entityB - The second entity involved in the collision.
   * @param result - The CollisionResult containing overlap and collision area information.
   */
  private resolveObjectObjectCollision(
    entityA: Entity,
    entityB: Entity,
    result: { normal: [number, number]; penetration: number },
  ) {
    const transformA = entityA.getComponent<TransformComponent>(TransformComponent.componentName);
    const transformB = entityB.getComponent<TransformComponent>(TransformComponent.componentName);
    const physicsA = entityA.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
    const physicsB = entityB.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
    const shapeA = entityA.getComponent<ShapeComponent>(ShapeComponent.componentName);
    const shapeB = entityB.getComponent<ShapeComponent>(ShapeComponent.componentName);

    if (!transformA || !transformB || !physicsA || !physicsB || !shapeA || !shapeB) return;

    // Wake up sleeping entities upon collision
    physicsA.wakeUp();
    physicsB.wakeUp();

    const POSITIONAL_CORRECTION_BIAS = 0.8;
    const SLOP = 0.01;

    const currentPosA = transformA.getPosition();
    const currentPosB = transformB.getPosition();
    const { normal, penetration } = result;

    if (penetration <= SLOP) return;

    // Apply positional correction
    const correctionAmount = (penetration - SLOP) * POSITIONAL_CORRECTION_BIAS;
    const pushX = (normal[0] * correctionAmount) / 2;
    const pushY = (normal[1] * correctionAmount) / 2;

    transformA.setPosition([currentPosA[0] + pushX, currentPosA[1] + pushY]);
    transformB.setPosition([currentPosB[0] - pushX, currentPosB[1] - pushY]);

    // Velocity reflection
    const velA = physicsA.getVelocity();
    const velB = physicsB.getVelocity();
    const relVelX = velB[0] - velA[0];
    const relVelY = velB[1] - velA[1];
    const velAlongNormal = relVelX * normal[0] + relVelY * normal[1];

    if (velAlongNormal > 0) {
      const restitution = 0.5;
      const impulse = (-(1 + restitution) * velAlongNormal) / 2;
      const impulseX = impulse * normal[0];
      const impulseY = impulse * normal[1];
      physicsA.setVelocity([velA[0] - impulseX, velA[1] - impulseY]);
      physicsB.setVelocity([velB[0] + impulseX, velB[1] + impulseY]);
    }
  }
}
