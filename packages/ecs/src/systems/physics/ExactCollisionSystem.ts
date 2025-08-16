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
import { RenderSystem } from '../rendering/RenderSystem';

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
  private renderSystem: RenderSystem | null = null;

  constructor() {
    super('ExactCollisionSystem', SystemPriorities.COLLISION, 'logic');
  }

  private getRenderSystem(): RenderSystem {
    if (this.renderSystem) return this.renderSystem;
    this.renderSystem = this.world.getSystem<RenderSystem>(
      RenderSystem.name,
      SystemPriorities.RENDER,
    );
    if (!this.renderSystem) {
      throw new Error('RenderSystem not found');
    }
    return this.renderSystem;
  }

  update(deltaTime: number): void {
    // Only proceed if spatial grid is available
    if (!this.gridComponent) return;

    // Get all object entities
    const objects = this.world.getEntitiesByType('object');
    if (!objects || objects.length === 0) return;

    // Set to record checked pairs (to avoid duplicate checks)
    const checkedPairs = new Set<string>();

    for (const entity of objects) {
      const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
      const collider = entity.getComponent<ColliderComponent>(ColliderComponent.componentName);
      if (!transform || !collider) continue;

      const position = transform.getPosition();
      // Use the larger of width/height as search radius (covers the whole object)
      const area = collider.getCollisionArea(position, [0, 0, 0, 0]);
      const radius = Math.max(area[2], area[3]) / 2;

      // Query only nearby objects using spatial grid
      const nearbyIds = this.gridComponent.getNearbyEntities(position, radius, 'collision');
      for (const id of nearbyIds) {
        if (id === entity.id) continue;

        const other = this.world.getEntityById(id);
        if (!other || !other.active || other.toRemove) continue;
        if (!other.isType('object')) continue;

        // Use numericId to generate a unique, order-independent key
        const idA = entity.numericId;
        const idB = other.numericId;
        const pairKey = idA < idB ? `${idA}_${idB}` : `${idB}_${idA}`;
        if (checkedPairs.has(pairKey)) continue;

        checkedPairs.add(pairKey);

        // check collision
        const result = this.checkCollision(entity, other);
        if (result) {
          this.handleCollision(entity, other, result);
        }
      }
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
    // Get transforms
    const transformA = entityA.getComponent<TransformComponent>(TransformComponent.componentName);
    const transformB = entityB.getComponent<TransformComponent>(TransformComponent.componentName);
    if (!transformA || !transformB) return;

    // Get positions
    const posA = transformA.getPosition();
    const posB = transformB.getPosition();

    // Compute collision normal (from A to B)
    const dx = posB[0] - posA[0];
    const dy = posB[1] - posA[1];
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = Math.min(result.overlapX, result.overlapY);

    // Only handle object-object (ball-ball) collision here
    if (entityA.isType('object') && entityB.isType('object')) {
      this.resolveObjectObjectCollision(
        transformA,
        entityA,
        transformB,
        entityB,
        nx,
        ny,
        overlap,
        posA,
        posB,
      );
      return;
    }
    // All obstacle-object collision is handled by BorderSystem, do nothing here
  }

  /**
   * Resolve collision for two dynamic objects (balls)
   * Moves both objects out of overlap and reflects/dampens their velocities
   */
  private resolveObjectObjectCollision(
    transformA: TransformComponent,
    entityA: Entity,
    transformB: TransformComponent,
    entityB: Entity,
    nx: number,
    ny: number,
    overlap: number,
    posA: [number, number],
    posB: [number, number],
  ) {
    // Move both objects out of overlap equally
    const push = overlap / 2;
    let newPosA = [posA[0] - nx * push, posA[1] - ny * push] as [number, number];
    let newPosB = [posB[0] + nx * push, posB[1] + ny * push] as [number, number];
    // Clamp both positions to be fully inside the viewport
    const viewport = this.getRenderSystem().getViewport();
    // Get size from collider (fallback to 0 if not available)
    const shapeA = entityA.getComponent<ShapeComponent>(ShapeComponent.componentName);
    const shapeB = entityB.getComponent<ShapeComponent>(ShapeComponent.componentName);
    const sizeA = shapeA.getSize();
    const sizeB = shapeB.getSize();
    // Clamp A
    let [ax, ay] = newPosA;
    // Clamp A's x and y positions to ensure the object stays fully inside the viewport
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
    // Clamp B's x and y positions to ensure the object stays fully inside the viewport
    let [bx, by] = newPosB;
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
    // Set clamped positions
    transformA.setPosition([ax, ay]);
    transformB.setPosition([bx, by]);

    // Reflect and dampen velocities
    const physicsA = entityA.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
    const physicsB = entityB.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
    if (physicsA && physicsB) {
      const velA = physicsA.getVelocity();
      const velB = physicsB.getVelocity();
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
  }
}
