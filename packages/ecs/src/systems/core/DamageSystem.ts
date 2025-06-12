import {
  ColliderComponent,
  DamageComponent,
  DeathMarkComponent,
  HealthComponent,
  MovementComponent,
  SoundEffectComponent,
  VelocityComponent,
} from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { Game } from '@ecs/core/game/Game';
import { SoundManager } from '@ecs/core/resources/SoundManager';
import { createDamageTextEntity } from '@ecs/entities';
import { CollisionSystem } from '../physics/CollisionSystem';

// Performance monitoring thresholds
const PERFORMANCE_THRESHOLDS = {
  CRITICAL: 30, // FPS threshold for critical performance mode
  NORMAL: 45, // FPS threshold for normal performance mode
};

export class DamageSystem extends System {
  private collisionSystem: CollisionSystem | null = null;
  private lastPerformanceCheck: number = 0;
  private performanceCheckInterval: number = 1000; // Check every second
  private isInPerformanceMode: boolean = false;

  constructor() {
    super('DamageSystem', SystemPriorities.DAMAGE, 'logic');
    // this.debug = true;
  }

  getCollisionSystem(): CollisionSystem {
    if (!this.collisionSystem) {
      this.collisionSystem = this.world.getSystem<CollisionSystem>(
        'CollisionSystem',
        this.priority,
      );
    }
    if (!this.collisionSystem) {
      throw new Error('CollisionSystem not found');
    }
    return this.collisionSystem;
  }

  private checkPerformance(): void {
    const currentTime = Date.now();
    if (currentTime - this.lastPerformanceCheck >= this.performanceCheckInterval) {
      const fps = Game.getInstance().getFPS();
      this.isInPerformanceMode = fps < PERFORMANCE_THRESHOLDS.CRITICAL;
      this.lastPerformanceCheck = currentTime;
    }
  }

  private processDamage(
    projectile: Entity,
    enemy: Entity,
    damageComponent: DamageComponent,
    health: HealthComponent,
    position: [number, number],
  ): void {
    // Skip if this projectile has already hit this enemy
    if (damageComponent.hasHit(enemy.id)) {
      return;
    }

    // Apply damage with critical hit check
    const { damage, isCritical } = damageComponent.getDamage();
    health.takeDamage(damage);

    // Create damage text
    const damageTextEntity = createDamageTextEntity(this.world, {
      damage,
      targetPos: position,
      isCritical,
    });
    this.world.addEntity(damageTextEntity);

    // Play hit sound
    this.playHitSound(enemy);

    // Check for death
    if (health.currentHealth <= 0) {
      enemy.addComponent(this.world.createComponent(DeathMarkComponent, {}));
    }

    // Record the hit
    damageComponent.recordHit(enemy.id);

    // Ensure projectile's velocity is not blocked
    const velocity = projectile.getComponent<VelocityComponent>(VelocityComponent.componentName);
    if (velocity) {
      velocity.setBlocked(false);
    }
  }

  private playHitSound(entity: Entity): void {
    if (!entity.hasComponent(SoundEffectComponent.componentName)) return;
    const soundEffect = entity.getComponent<SoundEffectComponent>(
      SoundEffectComponent.componentName,
    );
    const hitSound = soundEffect.getHitSound();
    if (hitSound) {
      SoundManager.getInstance().play(hitSound, soundEffect.volume);
    }
  }

  private processContinuousDamage(
    areaEffect: Entity,
    enemy: Entity,
    damageComponent: DamageComponent,
    health: HealthComponent,
    position: [number, number],
  ): void {
    // Check if it's time for a new damage tick
    if (!damageComponent.canTick()) {
      return;
    }

    // Apply damage with critical hit check
    const { damage, isCritical } = damageComponent.getDamage();
    health.takeDamage(damage);

    // Create damage text
    const damageTextEntity = createDamageTextEntity(this.world, {
      damage,
      targetPos: position,
      isCritical,
    });
    this.world.addEntity(damageTextEntity);

    // Play hit sound
    this.playHitSound(enemy);

    // Check for death
    if (health.currentHealth <= 0) {
      enemy.addComponent(this.world.createComponent(DeathMarkComponent, {}));
    }

    // Update tick time
    damageComponent.updateTickTime();
  }

  update(deltaTime: number): void {
    this.checkPerformance();

    const collisionResults = this.getCollisionSystem().getCollisionResults();
    const entitiesToRemove = new Set<Entity>();

    // Process collisions based on performance mode
    for (const result of collisionResults) {
      const { entity1, entity2 } = result;

      if (!entity1 || !entity2) continue;

      // Skip if either entity is marked for removal or dead
      if (
        entity1.toRemove ||
        entity2.toRemove ||
        entity1.hasComponent(DeathMarkComponent.componentName) ||
        entity2.hasComponent(DeathMarkComponent.componentName) ||
        !entity1.hasComponent(ColliderComponent.componentName) ||
        !entity2.hasComponent(ColliderComponent.componentName)
      ) {
        // this.log(
        //   'skipping collision',
        //   entity1.type,
        //   entity1.toRemove,
        //   entity1.components.size,
        //   '|',
        //   entity2.type,
        //   entity2.toRemove,
        //   entity2.components.size,
        // );
        continue;
      }

      // Handle projectile damage
      const isProjectile1 = entity1.isType('projectile');
      const isProjectile2 = entity2.isType('projectile');
      const isAreaEffect1 = entity1.isType('areaEffect');
      const isAreaEffect2 = entity2.isType('areaEffect');
      const isEnemy1 = entity1.isType('enemy');
      const isEnemy2 = entity2.isType('enemy');

      // Skip invalid collision types
      if ((isProjectile1 && isProjectile2) || (isEnemy1 && isEnemy2)) continue;
      if (entity1.isType('player') || entity2.isType('player')) continue;

      const damageSource = isProjectile1 ? entity1 : isAreaEffect1 ? entity1 : entity2;
      const enemy = isProjectile1 || isAreaEffect1 ? entity2 : entity1;

      if (
        !enemy.hasComponent(HealthComponent.componentName) ||
        !enemy.hasComponent(MovementComponent.componentName) ||
        !damageSource.hasComponent(DamageComponent.componentName)
      ) {
        continue;
      }

      const health = enemy.getComponent<HealthComponent>(HealthComponent.componentName);
      const enemyMovement = enemy.getComponent<MovementComponent>(MovementComponent.componentName);
      const damageComponent = damageSource.getComponent<DamageComponent>(
        DamageComponent.componentName,
      );

      // Process damage based on collision tier
      const position = enemyMovement.getPosition();

      // For area effects (which are triggers), always process continuous damage
      if (isAreaEffect1 || isAreaEffect2) {
        // Check if area effect is still valid
        if (!damageComponent.isExpired()) {
          this.processContinuousDamage(damageSource, enemy, damageComponent, health, position);
        }
      } else if (isProjectile1 || isProjectile2) {
        // For projectiles, only process damage if not a trigger
        const projectileCollider = isProjectile1
          ? entity1.getComponent<ColliderComponent>(ColliderComponent.componentName)
          : entity2.getComponent<ColliderComponent>(ColliderComponent.componentName);
        if (!projectileCollider?.isTriggerOnly()) {
          this.processDamage(damageSource, enemy, damageComponent, health, position);
        }
      }

      // Handle projectile removal
      if (!damageComponent.canHitMore() || damageComponent.isExpired()) {
        entitiesToRemove.add(damageSource);
      }
    }

    // Remove entities after processing all collisions
    for (const entity of entitiesToRemove) {
      this.world.removeEntity(entity);
    }
  }
}
