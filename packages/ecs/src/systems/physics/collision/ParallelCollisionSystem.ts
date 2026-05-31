import { PhysicsComponent, ShapeComponent, TransformComponent } from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { WorkerPoolManager } from '@ecs/core/worker';
import {
  ENTITY_STRIDE,
  E_POS_X,
  E_POS_Y,
  E_SIZE_X,
  E_SIZE_Y,
  E_TYPE,
  PAIR_STRIDE,
  P_INDEX_A,
  P_INDEX_B,
  RESULT_STRIDE,
  R_INDEX_A,
  R_INDEX_B,
  R_NORMAL_X,
  R_NORMAL_Y,
  R_PENETRATION,
  shapeTypeToCode,
} from './collisionSabLayout';
import { CollisionPair, CollisionResult, getCollisionNormalAndPenetration } from './collisionUtils';

/**
 * Per-frame dispatch context returned by startCollisionDetection: the worker
 * completion promises plus where each worker's results live in the shared buffer.
 */
interface CollisionDispatch {
  promises: Promise<unknown>[];
  /** Per worker: the pair index at which it began writing results into resultView. */
  resultStarts: number[];
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

  private pairSab: SharedArrayBuffer;
  private pairView: Int32Array;
  private resultSab: SharedArrayBuffer;
  private resultView: Float64Array;
  private pairCapacity = 0; // in pairs (sizes both pairSab and resultSab)

  private countSab: SharedArrayBuffer;
  private countView: Int32Array;

  // Reused per-frame scratch (avoids per-frame allocation of the index maps).
  private idToIndex: Map<string, number> = new Map();
  private indexToEntityId: string[] = [];
  private checkedPairs: Set<number> = new Set();

  // The shared buffers are reused across frames, so only one collision batch may
  // touch them at a time. The game loop fires logic sub-steps without awaiting
  // (see GameLoop.updateLogic), so without this guard a new frame could overwrite
  // the buffers while the previous frame's workers are still reading them.
  private collisionInFlight = false;

  constructor(private positionalCorrectTimes: number = 6) {
    super('ParallelCollisionSystem', SystemPriorities.COLLISION, 'logic');

    this.workerPoolManager = WorkerPoolManager.getInstance();

    // countSab has a fixed slot per worker; allocate once.
    const workerCount = Math.max(1, this.workerPoolManager.getWorkerCount());
    this.countSab = new SharedArrayBuffer(workerCount * Int32Array.BYTES_PER_ELEMENT);
    this.countView = new Int32Array(this.countSab);

    // Seed entity/pair buffers; they grow on demand in ensure*Capacity().
    this.entitySab = new SharedArrayBuffer(0);
    this.entityView = new Float64Array(this.entitySab);
    this.pairSab = new SharedArrayBuffer(0);
    this.pairView = new Int32Array(this.pairSab);
    this.resultSab = new SharedArrayBuffer(0);
    this.resultView = new Float64Array(this.resultSab);
    this.ensureEntityCapacity(1024);
    this.ensurePairCapacity(4096);
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

  /** Grow the pair + result buffers to hold at least `count` pairs (never shrinks). */
  private ensurePairCapacity(count: number): void {
    if (count <= this.pairCapacity) return;
    let cap = this.pairCapacity || 4096;
    while (cap < count) cap *= 2;
    this.pairCapacity = cap;
    this.pairSab = new SharedArrayBuffer(cap * PAIR_STRIDE * Int32Array.BYTES_PER_ELEMENT);
    this.pairView = new Int32Array(this.pairSab);
    // Each pair yields at most one collision, so the result buffer is sized per pair.
    this.resultSab = new SharedArrayBuffer(cap * RESULT_STRIDE * Float64Array.BYTES_PER_ELEMENT);
    this.resultView = new Float64Array(this.resultSab);
  }

  // Main update loop
  async update(deltaTime: number): Promise<void> {
    if (!this.gridComponent) return;

    const grid = this.gridComponent.grid;
    if (!grid || grid.size === 0) return;

    this.updateClusters(deltaTime);

    // Bail if a previous sub-step's workers are still reading the shared buffers;
    // re-entering here would overwrite them mid-flight (see collisionInFlight).
    if (this.collisionInFlight) return;

    // Start the collision detection process for the current frame
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
   * Writes the current frame's entities and candidate pairs into shared memory
   * and dispatches disjoint pair ranges to the worker pool.
   *
   * Returns null when there is nothing to do, otherwise the worker completion
   * promises plus each worker's result-region start offset.
   */
  private startCollisionDetection(grid: Map<string, { objects: Set<string> }>): CollisionDispatch | null {
    // !NOTICE: be sure to make object entity contain all necessary components.
    const allEntities = this.world.getEntitiesByCondition(
      (entity) => entity.active && !entity.toRemove && entity.isType('object'),
    );

    // 1. Write entity columns into shared memory and build id -> dense index maps.
    this.ensureEntityCapacity(allEntities.length);
    this.idToIndex.clear();
    const ev = this.entityView;
    let entityCount = 0;
    for (const entity of allEntities) {
      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      const physics = entity.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
      const shape = entity.getComponent<ShapeComponent>(ShapeComponent.componentName);

      if (transform && physics && shape) {
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
    }

    if (entityCount < 2) return null;

    // 2. Generate unique object-object pairs from the grid, writing entity
    //    indices straight into the pair buffer. De-dup uses an index-based key
    //    (indexA * entityCount + indexB), unique within this frame.
    this.checkedPairs.clear();
    let pairCount = 0;

    for (const cellKey of grid.keys()) {
      const cell = grid.get(cellKey);
      if (!cell || !cell.objects || cell.objects.size < 1) continue;

      const neighborKeys: string[] = [];
      const [cellX, cellY] = cellKey.split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          neighborKeys.push(`${cellX + dx},${cellY + dy}`);
        }
      }

      const potentialPartners = new Set<string>(cell.objects);
      for (const key of neighborKeys) {
        const neighborCell = grid.get(key);
        if (neighborCell && neighborCell.objects) {
          for (const partnerId of neighborCell.objects) {
            potentialPartners.add(partnerId);
          }
        }
      }

      const cellObjects = Array.from(cell.objects);
      const partnerObjects = Array.from(potentialPartners);

      for (let i = 0; i < cellObjects.length; i++) {
        const indexA = this.idToIndex.get(cellObjects[i]);
        if (indexA === undefined) continue;
        for (let j = 0; j < partnerObjects.length; j++) {
          const indexB = this.idToIndex.get(partnerObjects[j]);
          if (indexB === undefined || indexA === indexB) continue;

          const pairKey =
            indexA < indexB
              ? indexA * entityCount + indexB
              : indexB * entityCount + indexA;
          if (this.checkedPairs.has(pairKey)) continue;
          this.checkedPairs.add(pairKey);

          this.ensurePairCapacity(pairCount + 1);
          const pairBase = pairCount * PAIR_STRIDE;
          this.pairView[pairBase + P_INDEX_A] = indexA;
          this.pairView[pairBase + P_INDEX_B] = indexB;
          pairCount++;
        }
      }
    }

    if (pairCount === 0) return null;

    // 3. Distribute disjoint pair ranges among workers. The entity / pair / result
    //    buffers are shared by reference, so postMessage only carries scalars.
    const workerCount = this.workerPoolManager.getWorkerCount();
    const pairsPerWorker = Math.ceil(pairCount / workerCount);
    this.countView.fill(0); // reset per-worker collision counts before dispatch

    const promises: Promise<unknown>[] = [];
    const resultStarts: number[] = [];

    for (let i = 0; i < workerCount; i++) {
      const start = i * pairsPerWorker;
      if (start >= pairCount) break;
      const end = Math.min(start + pairsPerWorker, pairCount);

      resultStarts.push(start);
      promises.push(
        this.workerPoolManager.submitTask(
          'collisionSab',
          {
            entityBuffer: this.entitySab,
            pairBuffer: this.pairSab,
            resultBuffer: this.resultSab,
            countBuffer: this.countSab,
            workerIndex: i,
            startPair: start,
            endPair: end,
          },
          this.priority,
        ),
      );
    }

    return { promises, resultStarts };
  }

  // Awaits workers, reads collisions out of shared memory, and resolves them
  private async handleWorkerResults(dispatch: CollisionDispatch) {
    try {
      await Promise.all(dispatch.promises);

      // Read detected collisions back out of the shared result buffer. Each
      // worker wrote `count` entries starting at its pair-range offset.
      const rv = this.resultView;
      const allCollisions: CollisionPair[] = [];
      for (let i = 0; i < dispatch.resultStarts.length; i++) {
        const count = Atomics.load(this.countView, i);
        let off = dispatch.resultStarts[i] * RESULT_STRIDE;
        for (let k = 0; k < count; k++) {
          const idA = this.indexToEntityId[rv[off + R_INDEX_A]];
          const idB = this.indexToEntityId[rv[off + R_INDEX_B]];
          allCollisions.push({
            a: idA,
            b: idB,
            type: 'object-object',
            normal: [rv[off + R_NORMAL_X], rv[off + R_NORMAL_Y]],
            penetration: rv[off + R_PENETRATION],
          });
          off += RESULT_STRIDE;
        }
      }

      const uniqueCollisions = this.filterUniqueCollisions(allCollisions);
      this.identifyClusters(uniqueCollisions);

      if (uniqueCollisions.size > 0) {
        // The resolution process is iterative
        for (let i = 0; i < this.positionalCorrectTimes; i++) {
          let hasCollisions = false;
          for (const pair of uniqueCollisions) {
            const [idA, idB] = [pair.a, pair.b]; // Accessing a and b from the object
            const entityA = this.world.getEntityById(idA);
            const entityB = this.world.getEntityById(idB);

            if (
              entityA &&
              entityB &&
              entityA.active &&
              entityB.active &&
              !entityA.toRemove &&
              !entityB.toRemove
            ) {
              const physicsA = entityA.getComponent<PhysicsComponent>(
                PhysicsComponent.componentName,
              );
              const physicsB = entityB.getComponent<PhysicsComponent>(
                PhysicsComponent.componentName,
              );
              if (physicsA?.isAsleep() && physicsB?.isAsleep()) {
                continue;
              }
              if (physicsA?.isAsleep() || physicsB?.isAsleep()) {
                this.wakeUpClusterForEntity(physicsA.isAsleep() ? entityA.id : entityB.id);
              }
              let result: CollisionResult;
              // On the first iteration, we will use the pre-calculated result from the worker
              if (i === 0) {
                result = { normal: pair.normal, penetration: pair.penetration };
              } else {
                // On subsequent iterations, recalculate collision as positions have changed
                result = this.checkObjectObjectCollision(entityA, entityB);
              }

              if (result && result.penetration > 0) {
                this.resolveObjectObjectCollision(entityA, entityB, result);
                hasCollisions = true;
              } else {
                // If no collision is detected in this pass, remove it from the set
                uniqueCollisions.delete(pair);
              }
            } else {
              // If entities are no longer valid, remove the pair
              uniqueCollisions.delete(pair);
            }
          }
          // If no collisions were resolved in a pass, we can stop early
          if (!hasCollisions) break;
        }
      }
    } catch (error) {
      console.error('Error in collision worker:', error);
    }
  }

  private identifyClusters(collisions: Set<CollisionPair>): void {
    // Reset cluster mapping for this frame
    this.entityToClusterMap.clear();
    const visited = new Set<string>();

    const allCollidingEntities = new Set<string>();
    for (const pair of collisions) {
      allCollidingEntities.add(pair.a);
      allCollidingEntities.add(pair.b);
    }

    for (const entityId of allCollidingEntities) {
      if (!visited.has(entityId)) {
        const newCluster: Set<string> = new Set();
        const queue: string[] = [entityId];
        visited.add(entityId);

        while (queue.length > 0) {
          const currentId = queue.shift()!;
          newCluster.add(currentId);

          // Find all entities colliding with the current one
          for (const pair of collisions) {
            let neighborId: string | null = null;
            if (pair.a === currentId) neighborId = pair.b;
            if (pair.b === currentId) neighborId = pair.a;

            if (neighborId && !visited.has(neighborId)) {
              visited.add(neighborId);
              queue.push(neighborId);
            }
          }
        }

        const clusterId = `cluster_${entityId}`;
        this.clusters.set(clusterId, {
          bodies: newCluster,
          totalEnergy: 0,
          isSleeping: false,
          sleepTimer: 0,
        });
        newCluster.forEach((id) => this.entityToClusterMap.set(id, clusterId));
      }
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
