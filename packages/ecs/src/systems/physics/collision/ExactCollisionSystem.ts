import {
  ColliderComponent,
  PhysicsComponent,
  ShapeComponent,
  TransformComponent,
} from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { RectArea } from '@ecs/utils/types';
import { RenderSystem } from '../../rendering/RenderSystem';

/**
 * Collision result for two entities
 */
interface CollisionResult {
  entity1: Entity;
  entity2: Entity;
  overlapX: number;
  overlapY: number;
  collisionArea1: RectArea;
  collisionArea2: RectArea;
}

/**
 * ExactCollisionSystem is a simplified collision system for the simulator.
 * It checks all pairs of entities with colliders every frame (O(n^2)),
 * and handles obstacle-object (ball) collision response precisely.
 */
export class ExactCollisionSystem extends System {
  private defaultCollisionArea: RectArea = [0, 0, 0, 0];

  constructor(private positionalCorrectTimes: number = 10) {
    super('ExactCollisionSystem', SystemPriorities.COLLISION, 'logic');
  }

  private getRenderSystem(): RenderSystem {
    return RenderSystem.getInstance();
  }

  /**
   * Generate a numeric key for a pair of entities using their numericId
   * This is much faster than string operations and Set lookups
   * Ensures order independence (A,B == B,A)
   */
  private getNumericPairKey(id1: number, id2: number): number {
    const a = Math.min(id1, id2);
    const b = Math.max(id1, id2);
    return (a << 20) | b;
  }

  /**
   * Get the keys of the 3x3 neighborhood (including self) for a given cellKey
   * @param cellKey - string in the form 'x,y'
   * @returns string[] of neighbor cell keys
   */
  private getNeighborCellKeys(cellKey: string): string[] {
    const [cellX, cellY] = cellKey.split(',').map(Number);
    const keys: string[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        keys.push(`${cellX + dx},${cellY + dy}`);
      }
    }
    return keys;
  }

  /**
   * Update method: Performs collision detection and resolution for all objects in each cell and its 8 neighbors.
   *
   * 1. For each cell, iterates through itself and its 8 neighboring cells, and applies pairwise separation to all objects.
   * 2. MAX_PASSES is set to 10, allowing multiple iterations per frame to greatly reduce overlaps.
   * 3. checkedPairs is a global set for each pass to avoid processing the same pair more than once.
   *
   * This approach achieves a good balance between performance and overlap elimination, making it suitable for large-scale object scenarios.
   */
  update(deltaTime: number): void {
    // Only proceed if spatial grid is available
    if (!this.gridComponent) return;

    // Get the grid map from SpatialGridComponent
    const grid = this.gridComponent.grid;
    if (!grid || grid.size === 0) return;

    // For each pass, try to resolve all overlaps
    for (let pass = 0; pass < this.positionalCorrectTimes; pass++) {
      // Set to record checked pairs globally (across all cells)
      const checkedPairs = new Set<number>();

      // traverse all cells
      for (const [cellKey, cell] of grid.entries()) {
        const neighborKeys = this.getNeighborCellKeys(cellKey);
        const uniqueObjects = new Set<string>(); // Use Set to store unique object IDs
        for (const key of neighborKeys) {
          const neighborCell = grid.get(key);
          if (neighborCell && neighborCell.objects && neighborCell.objects.size > 0) {
            // Add all object IDs from the neighbor cell to the Set
            for (const objId of neighborCell.objects) {
              uniqueObjects.add(objId);
            }
          }
        }

        // Convert the Set of unique object IDs to an array for iteration
        const allObjects = Array.from(uniqueObjects);

        if (allObjects.length < 2) continue;

        // all objects clamp to viewport
        for (let i = 0; i < allObjects.length; i++) {
          for (let j = i + 1; j < allObjects.length; j++) {
            const idA = allObjects[i];
            const idB = allObjects[j];
            const entityA = this.world.getEntityById(idA);
            const entityB = this.world.getEntityById(idB);
            if (
              !entityA ||
              !entityB ||
              !entityA.active ||
              !entityB.active ||
              entityA.toRemove ||
              entityB.toRemove
            ) {
              continue;
            }
            if (!entityA.isType('object') || !entityB.isType('object')) {
              continue;
            }

            // Skip collision check if both entities are sleeping
            const physicsA = entityA.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
            const physicsB = entityB.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
            if (physicsA && physicsB && physicsA.isAsleep() && physicsB.isAsleep()) {
              continue;
            }

            // Use numericId to generate a unique, order-independent key
            const pairKey = this.getNumericPairKey(entityA.numericId, entityB.numericId);
            if (checkedPairs.has(pairKey)) {
              continue;
            }
            checkedPairs.add(pairKey);

            // Check collision and resolve if needed
            const result = this.checkCollision(entityA, entityB);
            if (result) {
              this.handleCollision(entityA, entityB, result);
            }
          }
        }
      }
      // After one pass, entities may have been moved, so next pass may resolve new overlaps
      // continue multiple frames: even if one frame does not completely eliminate overlap,
      // subsequent frames will continue to push, eventually converge to no overlap
    }
  }

  /**
   * Simple AABB collision check between two entities
   */
  private checkCollision(entity1: Entity, entity2: Entity): CollisionResult | null {
    const transform1 = entity1.getComponent<TransformComponent>(TransformComponent.componentName);
    const transform2 = entity2.getComponent<TransformComponent>(TransformComponent.componentName);
    const collider1 = entity1.getComponent<ColliderComponent>(ColliderComponent.componentName);
    const collider2 = entity2.getComponent<ColliderComponent>(ColliderComponent.componentName);
    if (!transform1 || !transform2 || !collider1 || !collider2) return null;

    const pos1 = transform1.getPosition();
    const pos2 = transform2.getPosition();
    const area1 = collider1.getCollisionArea(pos1, [0, 0, 0, 0]);
    const area2 = collider2.getCollisionArea(pos2, [0, 0, 0, 0]);

    // Simple AABB overlap check
    const isColliding =
      area1[0] < area2[0] + area2[2] &&
      area1[0] + area1[2] > area2[0] &&
      area1[1] < area2[1] + area2[3] &&
      area1[1] + area1[3] > area2[1];
    if (!isColliding) return null;

    // Calculate overlap
    const overlapX =
      Math.min(area1[0] + area1[2], area2[0] + area2[2]) - Math.max(area1[0], area2[0]);
    const overlapY =
      Math.min(area1[1] + area1[3], area2[1] + area2[3]) - Math.max(area1[1], area2[1]);

    return {
      entity1,
      entity2,
      overlapX,
      overlapY,
      collisionArea1: area1,
      collisionArea2: area2,
    };
  }

  /**
   * Handle collision response for object (ball) entities
   *
   * Note: Obstacle-object collision is now handled by BorderSystem, so this system only processes object-object collisions.
   */
  private handleCollision(entityA: Entity, entityB: Entity, result: CollisionResult): void {
    // Only handle object-object (ball-ball) collision here
    if (entityA.isType('object') && entityB.isType('object')) {
      this.resolveObjectObjectCollision(entityA, entityB, result);
      return;
    }
    // All obstacle-object collision is handled by BorderSystem, do nothing here
  }

  /**
   * Resolve collision for two dynamic objects (balls) with iterative positional correction.
   * Moves both objects out of overlap along the Minimum Translation Vector (MTV) and reflects/dampens their velocities.
   *
   * This method applies a fraction of the separation over several iterations to
   * ensure stability and more complete overlap resolution, especially for multiple contacts.
   * The positional correction ensures that objects do not remain overlapping after a collision.
   *
   * @param entityA - The first entity involved in the collision.
   * @param entityB - The second entity involved in the collision.
   * @param result - The CollisionResult containing overlap and collision area information.
   */
  private resolveObjectObjectCollision(entityA: Entity, entityB: Entity, result: CollisionResult) {
    const transformA = entityA.getComponent<TransformComponent>(TransformComponent.componentName);
    const transformB = entityB.getComponent<TransformComponent>(TransformComponent.componentName);
    const physicsA = entityA.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
    const physicsB = entityB.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
    const colliderA = entityA.getComponent<ColliderComponent>(ColliderComponent.componentName);
    const colliderB = entityB.getComponent<ColliderComponent>(ColliderComponent.componentName);
    if (!transformA || !transformB || !colliderA || !colliderB || !physicsA || !physicsB) return;

    // Wake up sleeping entities upon collision
    if (physicsA.isAsleep()) {
      physicsA.wakeUp();
    }
    if (physicsB.isAsleep()) {
      physicsB.wakeUp();
    }

    const POSITIONAL_CORRECTION_ITERATIONS = 5; // Number of iterations for positional correction
    const POSITIONAL_CORRECTION_BIAS = 0.8; // Fraction of overlap to correct per iteration (0.8 = 80%)
    const SLOP = 0.01; // A small tolerance to prevent jittering (objects don't need to be perfectly separated)

    // Perform iterative positional correction
    for (let i = 0; i < POSITIONAL_CORRECTION_ITERATIONS; i++) {
      // Re-get current positions and collision areas for each iteration
      const currentPosA = transformA.getPosition();
      const currentPosB = transformB.getPosition();
      const currentArea1 = colliderA.getCollisionArea(currentPosA, this.defaultCollisionArea);
      const currentArea2 = colliderB.getCollisionArea(currentPosB, this.defaultCollisionArea);

      // Re-calculate overlap for current positions
      const currentOverlapX =
        Math.min(currentArea1[0] + currentArea1[2], currentArea2[0] + currentArea2[2]) -
        Math.max(currentArea1[0], currentArea2[0]);
      const currentOverlapY =
        Math.min(currentArea1[1] + currentArea1[3], currentArea2[1] + currentArea2[3]) -
        Math.max(currentArea1[1], currentArea2[1]);

      // If no overlap (within SLOP), break early
      if (currentOverlapX <= SLOP && currentOverlapY <= SLOP) {
        console.log(
          `  [resolveObjectObjectCollision] Breaking early: Overlap (${currentOverlapX}) within SLOP (${SLOP}).`,
        );
        break;
      }

      // Calculate the distance between centers
      const dx = currentPosB[0] - currentPosA[0];
      const dy = currentPosB[1] - currentPosA[1];
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Get half extents (radii for circles)
      // Assuming size[0] is radius * 2 for circles, so size[0] / 2 is the radius
      const shapeA = entityA.getComponent<ShapeComponent>(ShapeComponent.componentName);
      const shapeB = entityB.getComponent<ShapeComponent>(ShapeComponent.componentName);
      const radiusA = shapeA.getSize()[0] / 2;
      const radiusB = shapeB.getSize()[0] / 2;

      // Calculate the ideal separation distance
      const separationDistance = radiusA + radiusB;

      // Calculate the actual overlap based on distance and ideal separation
      const overlap = separationDistance - dist;

      // If there's no overlap or overlap is within SLOP, break
      if (overlap <= SLOP) {
        // console.log(
        //   `  [resolveObjectObjectCollision] Breaking early: Overlap (${overlap}) within SLOP (${SLOP}).`,
        // );
        break;
      }

      // Normalize the direction vector (from A to B) to get the collision normal
      // Ensure dist is not zero to avoid division by zero
      const invDist = dist === 0 ? 0 : 1 / dist;
      const nx = dx * invDist;
      const ny = dy * invDist;

      // Apply positional correction along the normal
      // Use bias to correct only a fraction of the overlap, helping with stability
      const correctionAmount = (overlap - SLOP) * POSITIONAL_CORRECTION_BIAS;
      const pushX = (nx * correctionAmount) / 2;
      const pushY = (ny * correctionAmount) / 2;

      // console.log(
      //   `  [resolveObjectObjectCollision] Iteration ${i + 1}: PushX: ${pushX}, PushY: ${pushY}, CurrentPosA: [${currentPosA}], CurrentPosB: [${currentPosB}], Overlap: ${overlap}, Dist: ${dist}, SeparationDist: ${separationDistance}`,
      // );

      // Move both objects out of overlap equally
      transformA.setPosition([currentPosA[0] - pushX, currentPosA[1] - pushY]);
      transformB.setPosition([currentPosB[0] + pushX, currentPosB[1] + pushY]);
    }

    // Velocity reflection and dampening (only if physics components exist)
    if (physicsA && physicsB) {
      const velA = physicsA.getVelocity();
      const velB = physicsB.getVelocity();

      // Recalculate collision normal based on the new positions for velocity resolution
      const posA = transformA.getPosition();
      const posB = transformB.getPosition();
      const dx = posB[0] - posA[0];
      const dy = posB[1] - posA[1];
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dx / dist; // Collision normal for velocity impulse
      const ny = dy / dist;

      // Calculate relative velocity along the normal
      const relVelX = velB[0] - velA[0];
      const relVelY = velB[1] - velA[1];
      const velAlongNormal = relVelX * nx + relVelY * ny;

      // Only resolve if objects are moving towards each other
      if (velAlongNormal < 0) {
        const restitution = 0.5; // bounciness
        const impulse = (-(1 + restitution) * velAlongNormal) / 2;
        const impulseX = impulse * nx;
        const impulseY = impulse * ny;
        physicsA.setVelocity([velA[0] - impulseX, velA[1] - impulseY]);
        physicsB.setVelocity([velB[0] + impulseX, velB[1] + impulseY]);
      }
    }

    // Clamp both positions to be fully inside the viewport after resolution
    // This is the last step to ensure objects don't go out of bounds after resolving overlaps
    const viewport = this.getRenderSystem().getViewport();
    const shapeA = entityA.getComponent<ShapeComponent>(ShapeComponent.componentName);
    const shapeB = entityB.getComponent<ShapeComponent>(ShapeComponent.componentName);
    const sizeA = shapeA.getSize();
    const sizeB = shapeB.getSize();

    let [ax, ay] = transformA.getPosition();
    if (ax - sizeA[0] / 2 < viewport[0]) {
      ax = viewport[0] + sizeA[0] / 2;
    }
    if (ax + sizeA[0] / 2 > viewport[0] + viewport[2]) {
      ax = viewport[0] + viewport[2] - sizeA[0] / 2;
    }
    if (ay - sizeA[1] / 2 < viewport[1]) {
      ay = viewport[1] + sizeA[1] / 2;
    }
    if (ay + sizeA[1] / 2 > viewport[1] + viewport[3]) {
      ay = viewport[1] + viewport[3] - sizeA[1] / 2;
    }

    let [bx, by] = transformB.getPosition();
    if (bx - sizeB[0] / 2 < viewport[0]) {
      bx = viewport[0] + sizeB[0] / 2;
    }
    if (bx + sizeB[0] / 2 > viewport[0] + viewport[2]) {
      bx = viewport[0] + viewport[2] - sizeB[0] / 2;
    }
    if (by - sizeB[1] / 2 < viewport[1]) {
      by = viewport[1] + sizeB[1] / 2;
    }
    if (by + sizeB[1] / 2 > viewport[1] + viewport[3]) {
      by = viewport[1] + viewport[3] - sizeB[1] / 2;
    }

    transformA.setPosition([ax, ay]);
    transformB.setPosition([bx, by]);
  }
}
