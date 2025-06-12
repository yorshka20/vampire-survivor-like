import { ColliderComponent } from '@ecs/components/physics/ColliderComponent';
import { MovementComponent } from '@ecs/components/physics/MovementComponent';
import { VelocityComponent } from '@ecs/components/physics/VelocityComponent';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { RectArea } from '@ecs/utils/types';
import { CollisionMatrix, EntityType } from './CollisionMatrix';

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

  // Reusable objects to reduce GC pressure
  private readonly tempPosition: [number, number] = [0, 0];
  private readonly tempCollisionArea: RectArea = [0, 0, 0, 0];
  private readonly tempPairKey: [string, string] = ['', ''];
  private readonly tempNearbyEntities: string[] = [];

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
    this.damageCollisionResults = [];

    // Get all entities with colliders
    const entities = this.world.getEntitiesWithComponents([ColliderComponent]);
    const player = this.getPlayer();
    if (!player) return;

    const playerMovement = player.getComponent<MovementComponent>(MovementComponent.componentName);
    const playerPos = playerMovement.getPosition();

    // Process entities based on their distance from player
    for (const entity of entities) {
      const movement = entity.getComponent<MovementComponent>(MovementComponent.componentName);
      const position = movement.getPosition();

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

    const movement = entity.getComponent<MovementComponent>(MovementComponent.componentName);
    const collider = entity.getComponent<ColliderComponent>(ColliderComponent.componentName);
    if (!movement || !collider) return;

    const position = movement.getPosition();
    const collisionArea = collider.getCollisionArea(position, this.tempCollisionArea);

    // Calculate search radius using existing collision area
    const baseRadius = Math.max(collisionArea[2], collisionArea[3]) * 2;
    const searchRadius = this.getTierSearchRadius(baseRadius, tier);

    // Get nearby entities using spatial grid with tier-specific cache
    // Reuse the tempNearbyEntities array
    this.tempNearbyEntities.length = 0;
    this.gridComponent.getNearbyEntities(
      position,
      searchRadius,
      this.getCacheTypeForTier(tier),
      this.tempNearbyEntities,
    );

    for (const nearbyId of this.tempNearbyEntities) {
      const nearbyEntity = this.world.getEntityById(nearbyId);
      if (!nearbyEntity) continue;

      // Skip if nearby entity doesn't have a collider
      if (!nearbyEntity.hasComponent(ColliderComponent.componentName)) continue;

      // Skip if either entity is marked for removal
      if (entity.toRemove || nearbyEntity.toRemove) continue;

      // Use numeric pair key for faster Set operations
      const pairKey = this.getNumericPairKey(entity.id, nearbyId);
      if (this.checkedPairs.has(pairKey)) continue;

      // Use collision matrix with type property directly
      if (
        !this.collisionMatrix.shouldCollide(
          entity.type as EntityType,
          nearbyEntity.type as EntityType,
        )
      ) {
        continue;
      }

      // Perform collision check
      const collisionResult = this.checkCollision(entity, nearbyEntity);
      if (collisionResult) {
        this.handleCollision(entity, nearbyEntity, collisionResult);
        // skip case where both entities are enemies because they will not attack each other
        if (entity.isType('enemy') && nearbyEntity.isType('enemy')) continue;

        this.damageCollisionResults.push(collisionResult);
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

  private getCacheTypeForTier(tier: CollisionTier): 'collision' | 'damage' | 'weapon' {
    // Map collision tiers to cache types
    switch (tier) {
      case CollisionTier.CRITICAL:
        return 'collision'; // Use collision cache for critical tier
      case CollisionTier.NORMAL:
        return 'damage'; // Use damage cache for normal tier
      case CollisionTier.DISTANT:
        return 'weapon'; // Use weapon cache for distant tier
      default:
        return 'collision';
    }
  }

  /**
   * Generate a numeric key for a pair of entities
   * This is much faster than string operations and Set lookups
   */
  private getNumericPairKey(id1: string, id2: string): number {
    // Extract numeric part from entity IDs (assuming format like "entity-123")
    const num1 = parseInt(id1.split('-')[1] || '0', 10);
    const num2 = parseInt(id2.split('-')[1] || '0', 10);

    // Use bit shifting to combine the numbers
    // This ensures unique keys for each pair while maintaining order independence
    return num1 < num2 ? (num1 << 16) | num2 : (num2 << 16) | num1;
  }

  private checkCollision(entity1: Entity, entity2: Entity): CollisionResult | null {
    const movement1 = entity1.getComponent<MovementComponent>(MovementComponent.componentName);
    const movement2 = entity2.getComponent<MovementComponent>(MovementComponent.componentName);
    const collider1 = entity1.getComponent<ColliderComponent>(ColliderComponent.componentName);
    const collider2 = entity2.getComponent<ColliderComponent>(ColliderComponent.componentName);

    if (!movement1 || !movement2 || !collider1 || !collider2) return null;

    const pos1 = movement1.getPosition();
    const pos2 = movement2.getPosition();
    const area1 = collider1.getCollisionArea(pos1);
    const area2 = collider2.getCollisionArea(pos2);

    // Simple AABB collision check
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
    const movement1 = entity.getComponent<MovementComponent>(MovementComponent.componentName);
    const movement2 = nearbyEntity.getComponent<MovementComponent>(MovementComponent.componentName);
    if (!movement1 || !movement2) return;

    // Get positions
    const pos1 = movement1.getPosition();
    const pos2 = movement2.getPosition();

    // Calculate collision response
    const dx = pos2[0] - pos1[0];
    const dy = pos2[1] - pos1[1];
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) return; // Avoid division by zero

    // Normalize direction
    const nx = dx / distance;
    const ny = dy / distance;

    // Calculate overlap
    const overlap = Math.min(collisionResult.overlapX, collisionResult.overlapY);

    // Handle collision response based on entity types
    if (entity.isType('player')) {
      // Player pushes enemy
      if (nearbyEntity.isType('enemy')) {
        const pushForce = 5; // Adjust this value to control push strength
        movement2.setPosition([pos2[0] + nx * pushForce, pos2[1] + ny * pushForce]);
      }
    } else if (nearbyEntity.isType('player')) {
      // Enemy cannot push player
      const pushForce = 5;
      movement1.setPosition([pos1[0] - nx * pushForce, pos1[1] - ny * pushForce]);
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
    const movement1 = entity1.getComponent<MovementComponent>(MovementComponent.componentName);
    const movement2 = entity2.getComponent<MovementComponent>(MovementComponent.componentName);
    if (!movement1 || !movement2) return;

    const pos1 = movement1.getPosition();
    const pos2 = movement2.getPosition();

    // Get velocity components
    const velocity1 = entity1.getComponent<VelocityComponent>(VelocityComponent.componentName);
    const velocity2 = entity2.getComponent<VelocityComponent>(VelocityComponent.componentName);
    if (!velocity1 || !velocity2) return;

    // Get current velocities
    const vel1 = velocity1.getVelocity();
    const vel2 = velocity2.getVelocity();

    // Calculate relative velocity
    const relativeVelocityX = vel2.x - vel1.x;
    const relativeVelocityY = vel2.y - vel1.y;

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
    const newVel1X = vel1.x - impulseX;
    const newVel1Y = vel1.y - impulseY;
    const newVel2X = vel2.x + impulseX;
    const newVel2Y = vel2.y + impulseY;

    // Apply velocity changes
    velocity1.setVelocity({ x: newVel1X, y: newVel1Y });
    velocity2.setVelocity({ x: newVel2X, y: newVel2Y });

    // Still prevent overlap
    const pushForce = overlap / 2;
    movement1.setPosition([pos1[0] - nx * pushForce, pos1[1] - ny * pushForce]);
    movement2.setPosition([pos2[0] + nx * pushForce, pos2[1] + ny * pushForce]);

    // Apply damping to reduce oscillation
    const damping = 0.8; // Adjust this value to control damping
    velocity1.setVelocity({ x: newVel1X * damping, y: newVel1Y * damping });
    velocity2.setVelocity({ x: newVel2X * damping, y: newVel2Y * damping });
  }

  getCollisionResults(): CollisionResult[] {
    return this.damageCollisionResults;
  }

  destroy(): void {
    this.checkedPairs.clear();
    this.damageCollisionResults = [];
  }
}
