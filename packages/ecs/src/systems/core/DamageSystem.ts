import {
  ColliderComponent,
  DamageComponent,
  DeathMarkComponent,
  HealthComponent,
  StateComponent,
  TransformComponent,
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
    if (this.collisionSystem) return this.collisionSystem;

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

    // Set hit and daze states
    const stateComponent = enemy.getComponent<StateComponent>(StateComponent.componentName);
    if (stateComponent) {
      stateComponent.setHit(13); // 3 frames hit effect
      stateComponent.setDazed(13); // 3 frames daze effect
    }

    // Create damage text
    const damageTextEntity = createDamageTextEntity(this.world, {
      damage,
      targetPos: position,
      isCritical,
    });
    this.world.addEntity(damageTextEntity);

    // Play hit sound
    SoundManager.playSound(enemy, 'hit');

    // Check for death
    if (health.currentHealth <= 0) {
      enemy.addComponent(this.world.createComponent(DeathMarkComponent, undefined));
    }

    // Record the hit
    damageComponent.recordHit(enemy.id);
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

    // Set hit and daze states
    const stateComponent = enemy.getComponent<StateComponent>(StateComponent.componentName);
    if (stateComponent) {
      stateComponent.setHit(1); // 1 frame hit effect
      stateComponent.setDazed(2); // 2 frames daze effect
    }

    // Create damage text
    const damageTextEntity = createDamageTextEntity(this.world, {
      damage,
      targetPos: position,
      isCritical,
    });
    this.world.addEntity(damageTextEntity);

    // Play hit sound
    SoundManager.playSound(enemy, 'hit');

    // Check for death
    if (health.currentHealth <= 0) {
      enemy.addComponent(this.world.createComponent(DeathMarkComponent, undefined));
    }

    // Update tick time
    damageComponent.updateTickTime();
  }

  private processAoeDamage(damageSource: Entity, damageComponent: DamageComponent): void {
    const { damage, isCritical } = damageComponent.getDamage();
    const position = damageSource
      .getComponent<TransformComponent>(TransformComponent.componentName)
      .getPosition();

    const enemies = this.gridComponent?.getNearbyEntities(
      position,
      damageComponent.getAoeRadius(),
      'damage',
    );
    if (!enemies?.length) return;

    const aoeEnemies: Entity[] = [];
    for (const enemyId of enemies) {
      const enemy = this.world.getEntityById(enemyId);
      if (
        !enemy?.hasComponent(HealthComponent.componentName) ||
        enemy.toRemove ||
        enemy.hasComponent(DeathMarkComponent.componentName)
      ) {
        continue;
      }
      const enemyPosition = enemy
        .getComponent<TransformComponent>(TransformComponent.componentName)
        .getPosition();
      const distance = Math.sqrt(
        (position[0] - enemyPosition[0]) ** 2 + (position[1] - enemyPosition[1]) ** 2,
      );
      if (distance > damageComponent.getAoeRadius()) {
        continue;
      }
      aoeEnemies.push(enemy);
    }

    for (const enemy of aoeEnemies) {
      const health = enemy.getComponent<HealthComponent>(HealthComponent.componentName);
      health.takeDamage(damage);
      damageComponent.recordHit(enemy.id);

      const enemyPosition = enemy
        .getComponent<TransformComponent>(TransformComponent.componentName)
        .getPosition();
      // Set hit and daze states
      const stateComponent = enemy.getComponent<StateComponent>(StateComponent.componentName);
      if (stateComponent) {
        stateComponent.setHit(12); // 12 frames hit effect
        stateComponent.setDazed(12); // 12 frames daze effect
      }
      // Create damage text
      const damageTextEntity = createDamageTextEntity(this.world, {
        damage,
        targetPos: enemyPosition,
        isCritical,
      });
      this.world.addEntity(damageTextEntity);

      // Play hit sound
      SoundManager.playSound(enemy, 'hit');

      // Check for death
      if (health.currentHealth <= 0) {
        enemy.addComponent(this.world.createComponent(DeathMarkComponent, undefined));
      }
    }
  }

  update(deltaTime: number): void {
    this.checkPerformance();

    const collisionResults = this.getCollisionSystem().getCollisionResults();
    const entitiesToRemove: Entity[] = [];

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
        // invalid enemy
        !enemy.hasComponent(HealthComponent.componentName) ||
        !enemy.hasComponent(TransformComponent.componentName) ||
        // already dead
        enemy.toRemove ||
        enemy.hasComponent(DeathMarkComponent.componentName) ||
        // invalid damage source
        !damageSource.hasComponent(DamageComponent.componentName)
      ) {
        continue;
      }

      const health = enemy.getComponent<HealthComponent>(HealthComponent.componentName);
      const enemyTransform = enemy.getComponent<TransformComponent>(
        TransformComponent.componentName,
      );
      const damageComponent = damageSource.getComponent<DamageComponent>(
        DamageComponent.componentName,
      );

      // Process damage based on collision tier
      const position = enemyTransform.getPosition();

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
        if (projectileCollider?.isTriggerOnly()) continue;

        if (damageComponent.isAoe() && damageComponent.canExplode()) {
          this.processAoeDamage(damageSource, damageComponent);
        } else {
          this.processDamage(damageSource, enemy, damageComponent, health, position);
        }
      }

      // Handle projectile removal
      if (!damageComponent.canHitMore() || damageComponent.isExpired()) {
        entitiesToRemove.push(damageSource);

        // trigger onDestroyed callback if the damageSource is removed by damageSystem
        if (!damageComponent.canHitMore()) {
          damageSource.notifyDestroyed();
        }
      }
    }

    // Remove entities after processing all collisions
    for (const entity of entitiesToRemove) {
      this.world.removeEntity(entity);
    }
  }
}
