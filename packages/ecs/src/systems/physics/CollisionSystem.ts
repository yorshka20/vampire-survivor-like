import {
  ColliderComponent,
  PhysicsComponent,
  SpatialQueryType,
  TransformComponent,
} from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { Point, RectArea } from '@ecs/utils/types';
import { CollisionMatrix } from './CollisionMatrix';

interface CollisionResult {
  entity1: Entity;
  entity2: Entity;
  overlapX: number;
  overlapY: number;
  collisionArea1: RectArea;
  collisionArea2: RectArea;
}

// Collision detection tiers
enum CollisionTier {
  CRITICAL = 'critical', // Close range, check every frame
  NORMAL = 'normal', // Medium range, check every 2 frames
  DISTANT = 'distant', // Far range, check every 4 frames
}

export class CollisionSystem extends System {
  private checkedPairs: Set<number> = new Set();
  private damageCollisionResults: CollisionResult[] = [];
  private frameCount: number = 0;
  private collisionMatrix: CollisionMatrix;

  // Reusable arrays to reduce GC pressure
  private readonly tempPosition: Float64Array = new Float64Array(2);
  private readonly tempCollisionArea1: RectArea = [0, 0, 0, 0];
  private readonly tempCollisionArea2: RectArea = [0, 0, 0, 0];
  private readonly tempPairKey: Uint32Array = new Uint32Array(2);
  private tempNearbyEntities: string[] = [];

  // Distance thresholds for different collision tiers
  private readonly TIER_DISTANCES = {
    [CollisionTier.CRITICAL]: 100, // 100 units
    [CollisionTier.NORMAL]: 300, // 300 units
    [CollisionTier.DISTANT]: 500, // 500 units
  };

  constructor() {
    super('CollisionSystem', SystemPriorities.COLLISION, 'logic');
    this.collisionMatrix = new CollisionMatrix();
  }

  update(deltaTime: number): void {
    this.frameCount++;
    this.checkedPairs.clear();
    this.damageCollisionResults.length = 0;

    // Get all entities with colliders
    const entities = this.world.getEntitiesWithComponents([ColliderComponent]);
    const player = this.getPlayer();
    if (!player) return;

    const playerPos = player
      .getComponent<TransformComponent>(TransformComponent.componentName)
      .getPosition();

    // Process entities based on their distance from player
    for (const entity of entities) {
      const position = entity
        .getComponent<TransformComponent>(TransformComponent.componentName)
        .getPosition();

      // Calculate distance from player using reusable array
      this.tempPosition[0] = position[0] - playerPos[0];
      this.tempPosition[1] = position[1] - playerPos[1];
      const distance = Math.sqrt(
        this.tempPosition[0] * this.tempPosition[0] + this.tempPosition[1] * this.tempPosition[1],
      );

      // Determine collision tier
      const tier = this.getCollisionTier(distance);

      // Check if we should process this entity based on its tier
      if (this.shouldProcessTier(tier)) {
        this.processEntityCollisions(entity, tier);
      }
    }
  }

  private getCollisionTier(distance: number): CollisionTier {
    if (distance <= this.TIER_DISTANCES[CollisionTier.CRITICAL]) {
      return CollisionTier.CRITICAL;
    } else if (distance <= this.TIER_DISTANCES[CollisionTier.NORMAL]) {
      return CollisionTier.NORMAL;
    } else {
      return CollisionTier.DISTANT;
    }
  }

  private shouldProcessTier(tier: CollisionTier): boolean {
    switch (tier) {
      case CollisionTier.CRITICAL:
        return true; // Process every frame
      case CollisionTier.NORMAL:
        return this.frameCount % 2 === 0; // Process every 2 frames
      case CollisionTier.DISTANT:
        return this.frameCount % 4 === 0; // Process every 4 frames
      default:
        return false;
    }
  }

  private processEntityCollisions(entity: Entity, tier: CollisionTier): void {
    if (!this.gridComponent) return;

    const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
    const collider = entity.getComponent<ColliderComponent>(ColliderComponent.componentName);
    if (!transform || !collider) return;

    const position = transform.getPosition();
    // Convert position to Float64Array for internal calculations
    this.tempPosition[0] = position[0];
    this.tempPosition[1] = position[1];

    // Get collision area using original component method
    const collisionArea = collider.getCollisionArea(position, this.tempCollisionArea1);

    // Calculate search radius using existing collision area
    const baseRadius = Math.max(collisionArea[2], collisionArea[3]) * 2;
    const searchRadius = this.getTierSearchRadius(baseRadius, tier);

    // Get nearby entities using spatial grid with tier-specific cache
    this.tempNearbyEntities.length = 0;
    this.tempNearbyEntities = this.gridComponent.getNearbyEntities(
      position,
      searchRadius,
      this.getCacheTypeForTier(tier),
    );

    for (const nearbyId of this.tempNearbyEntities) {
      const nearbyEntity = this.world.getEntityById(nearbyId);
      if (!nearbyEntity) continue;

      // Skip if nearby entity doesn't have a collider
      if (!nearbyEntity.hasComponent(ColliderComponent.componentName)) continue;

      // Skip if either entity is marked for removal
      if (entity.toRemove || nearbyEntity.toRemove) continue;

      // Use numeric pair key for faster Set operations
      const pairKey = this.getNumericPairKey(entity.numericId, nearbyEntity.numericId);
      if (this.checkedPairs.has(pairKey)) continue;

      // Use collision matrix with type property directly
      if (
        !this.collisionMatrix.shouldCollide(
          CollisionMatrix.entityTypeMap[entity.type]!,
          CollisionMatrix.entityTypeMap[nearbyEntity.type]!,
        )
      ) {
        continue;
      }

      // Perform collision check
      const collisionResult = this.checkCollision(entity, nearbyEntity);
      if (collisionResult) {
        this.handleCollision(entity, nearbyEntity, collisionResult);
        // skip case where both entities are non-damageable
        if (
          entity.isType('projectile') ||
          nearbyEntity.isType('projectile') ||
          entity.isType('areaEffect') ||
          nearbyEntity.isType('areaEffect')
        ) {
          this.damageCollisionResults.push(collisionResult);
        }
      }

      this.checkedPairs.add(pairKey);
    }
  }

  private getTierSearchRadius(baseRadius: number, tier: CollisionTier): number {
    // Adjust search radius based on tier
    switch (tier) {
      case CollisionTier.CRITICAL:
        return baseRadius; // Use exact radius for critical tier
      case CollisionTier.NORMAL:
        return baseRadius * 1.2; // Slightly larger radius for normal tier
      case CollisionTier.DISTANT:
        return baseRadius * 1.5; // Larger radius for distant tier
      default:
        return baseRadius;
    }
  }

  private getCacheTypeForTier(tier: CollisionTier): SpatialQueryType {
    // Map collision tiers to cache types
    switch (tier) {
      case CollisionTier.CRITICAL:
        return 'collision'; // Use collision cache for critical tier
      case CollisionTier.NORMAL:
        return 'collision'; // Use collision cache for normal tier
      case CollisionTier.DISTANT:
        return 'collision-distant'; // Use collision-distant cache for distant tier
      default:
        return 'collision';
    }
  }

  private checkCollision(entity1: Entity, entity2: Entity): CollisionResult | null {
    const transform1 = entity1.getComponent<TransformComponent>(TransformComponent.componentName);
    const transform2 = entity2.getComponent<TransformComponent>(TransformComponent.componentName);
    const collider1 = entity1.getComponent<ColliderComponent>(ColliderComponent.componentName);
    const collider2 = entity2.getComponent<ColliderComponent>(ColliderComponent.componentName);

    if (!transform1 || !transform2 || !collider1 || !collider2) return null;

    const pos1 = transform1.getPosition();
    const pos2 = transform2.getPosition();

    // Get collision areas using original component methods
    const area1 = collider1.getCollisionArea(pos1, this.tempCollisionArea1);
    const area2 = collider2.getCollisionArea(pos2, this.tempCollisionArea2);

    // For laser collisions, we need to check if the enemy is within the laser's path
    if (collider1.type === 'laser' || collider2.type === 'laser') {
      return this.checkLaserCollision(entity1, entity2, pos1, pos2, area1, area2);
    }

    // Simple AABB collision check for non-laser collisions
    const isColliding =
      area1[0] < area2[0] + area2[2] &&
      area1[0] + area1[2] > area2[0] &&
      area1[1] < area2[1] + area2[3] &&
      area1[1] + area1[3] > area2[1];

    if (!isColliding) return null;

    // Calculate overlap for collision response
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

  private checkLaserCollision(
    entity1: Entity,
    entity2: Entity,
    pos1: Point,
    pos2: Point,
    area1: RectArea,
    area2: RectArea,
  ): CollisionResult | null {
    const collider1 = entity1.getComponent<ColliderComponent>(ColliderComponent.componentName);
    const collider2 = entity2.getComponent<ColliderComponent>(ColliderComponent.componentName);
    const laserCollider = collider1.type === 'laser' ? collider1 : collider2;
    const enemyCollider = collider1.type === 'laser' ? collider2 : collider1;
    const laserPos = collider1.type === 'laser' ? pos1 : pos2;
    const enemyPos = collider1.type === 'laser' ? pos2 : pos1;

    const laser = laserCollider.getCollider().laser;
    if (!laser) {
      return null;
    }

    // Calculate laser direction vector
    const dx = laser.aim[0] - laserPos[0];
    const dy = laser.aim[1] - laserPos[1];
    const length = Math.sqrt(dx * dx + dy * dy);
    const dirX = dx / length;
    const dirY = dy / length;

    // Calculate vector from laser start to enemy
    const px = enemyPos[0] - laserPos[0];
    const py = enemyPos[1] - laserPos[1];

    // Calculate projection of enemy position onto laser direction
    const proj = px * dirX + py * dirY;

    // If projection is negative, enemy is behind laser start
    if (proj < 0) {
      return null;
    }

    // Calculate closest point on laser line to enemy
    const closestX = laserPos[0] + dirX * proj;
    const closestY = laserPos[1] + dirY * proj;

    // Calculate distance from enemy to closest point on laser
    const dx2 = enemyPos[0] - closestX;
    const dy2 = enemyPos[1] - closestY;
    const distance = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    // Get enemy size
    const enemySize = enemyCollider.size;
    const enemyRadius = Math.max(enemySize[0], enemySize[1]) / 2;

    // Check if enemy is within laser width
    if (distance <= laser.laserWidth / 2 + enemyRadius) {
      return {
        entity1,
        entity2,
        overlapX: laser.laserWidth,
        overlapY: enemyRadius,
        collisionArea1: area1,
        collisionArea2: area2,
      };
    }

    return null;
  }

  private handleCollision(
    entity: Entity,
    nearbyEntity: Entity,
    collisionResult: CollisionResult,
  ): void {
    // Skip collision response for projectiles and area effects
    if (
      entity.isType('projectile') ||
      nearbyEntity.isType('projectile') ||
      entity.isType('areaEffect') ||
      nearbyEntity.isType('areaEffect')
    ) {
      return;
    }

    // Get movement components
    const transform1 = entity.getComponent<TransformComponent>(TransformComponent.componentName);
    const transform2 = nearbyEntity.getComponent<TransformComponent>(
      TransformComponent.componentName,
    );
    if (!transform1 || !transform2) return;

    // Get positions
    const pos1 = transform1.getPosition();
    const pos2 = transform2.getPosition();

    // Convert to TypedArray for internal calculations
    this.tempPosition[0] = pos2[0] - pos1[0];
    this.tempPosition[1] = pos2[1] - pos1[1];

    const distance = Math.sqrt(
      this.tempPosition[0] * this.tempPosition[0] + this.tempPosition[1] * this.tempPosition[1],
    );

    if (distance === 0) return;

    // Normalize direction using TypedArray
    const nx = this.tempPosition[0] / distance;
    const ny = this.tempPosition[1] / distance;

    // Calculate overlap
    const overlap = Math.min(collisionResult.overlapX, collisionResult.overlapY);

    // Handle collision response based on entity types
    if (entity.isType('player')) {
      // Player pushes enemy
      if (nearbyEntity.isType('enemy')) {
        const pushForce = 5; // Adjust this value to control push strength
        transform2.setPosition([pos2[0] + nx * pushForce, pos2[1] + ny * pushForce]);
      }
    } else if (nearbyEntity.isType('player')) {
      // Enemy cannot push player
      const pushForce = 5;
      transform1.setPosition([pos1[0] - nx * pushForce, pos1[1] - ny * pushForce]);
    } else {
      // Enemy-Enemy collision: prevent overlap and exchange momentum
      this.handleEnemyCollision(entity, nearbyEntity, collisionResult, nx, ny, overlap);
    }
  }

  private handleEnemyCollision(
    entity1: Entity,
    entity2: Entity,
    collisionResult: CollisionResult,
    nx: number,
    ny: number,
    overlap: number,
  ): void {
    const transform1 = entity1.getComponent<TransformComponent>(TransformComponent.componentName);
    const transform2 = entity2.getComponent<TransformComponent>(TransformComponent.componentName);
    if (!transform1 || !transform2) return;

    const pos1 = transform1.getPosition();
    const pos2 = transform2.getPosition();

    // Get velocity components
    const velocity1 = entity1.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
    const velocity2 = entity2.getComponent<PhysicsComponent>(PhysicsComponent.componentName);
    if (!velocity1 || !velocity2) return;

    // Get current velocities
    const vel1 = velocity1.getVelocity();
    const vel2 = velocity2.getVelocity();

    // Calculate relative velocity
    const relativeVelocityX = vel2[0] - vel1[0];
    const relativeVelocityY = vel2[1] - vel1[1];

    // Calculate relative velocity in terms of the normal direction
    const velocityAlongNormal = relativeVelocityX * nx + relativeVelocityY * ny;

    // Do not resolve if velocities are separating
    if (velocityAlongNormal > 0) {
      return;
    }

    // Calculate restitution (bounciness)
    const restitution = 0.2; // Adjust this value to control bounciness

    // Calculate impulse scalar
    const impulseScalar = -(1 + restitution) * velocityAlongNormal;

    // Apply impulse
    const impulseX = impulseScalar * nx;
    const impulseY = impulseScalar * ny;

    // Update velocities
    const newVel1X = vel1[0] - impulseX;
    const newVel1Y = vel1[1] - impulseY;
    const newVel2X = vel2[0] + impulseX;
    const newVel2Y = vel2[1] + impulseY;

    // Apply velocity changes
    velocity1.setVelocity([newVel1X, newVel1Y]);
    velocity2.setVelocity([newVel2X, newVel2Y]);

    // Still prevent overlap
    const pushForce = overlap / 2;
    transform1.setPosition([pos1[0] - nx * pushForce, pos1[1] - ny * pushForce]);
    transform2.setPosition([pos2[0] + nx * pushForce, pos2[1] + ny * pushForce]);

    // Apply damping to reduce oscillation
    const damping = 0.8; // Adjust this value to control damping
    velocity1.setVelocity([newVel1X * damping, newVel1Y * damping]);
    velocity2.setVelocity([newVel2X * damping, newVel2Y * damping]);
  }

  getCollisionResults(): CollisionResult[] {
    return this.damageCollisionResults;
  }

  destroy(): void {
    this.checkedPairs.clear();
    this.damageCollisionResults.length = 0;
  }

  /**
   * Generate a numeric key for a pair of entities using their numericId
   * This is much faster than string operations and Set lookups
   */
  private getNumericPairKey(id1: number, id2: number): number {
    // Use tempPairKey to store the IDs
    this.tempPairKey[0] = id1;
    this.tempPairKey[1] = id2;

    // Ensure order independence by sorting
    if (this.tempPairKey[0] > this.tempPairKey[1]) {
      const temp = this.tempPairKey[0];
      this.tempPairKey[0] = this.tempPairKey[1];
      this.tempPairKey[1] = temp;
    }

    // Combine the IDs into a single number using bit shifting
    return (this.tempPairKey[0] << 20) | this.tempPairKey[1];
  }
}
