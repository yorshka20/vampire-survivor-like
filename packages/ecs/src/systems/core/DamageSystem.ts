import {
  ColliderComponent,
  DamageComponent,
  DeathMarkComponent,
  HealthComponent,
  RenderComponent,
  StateComponent,
  TransformComponent,
} from '@ecs/components';
import { LaserWeapon } from '@ecs/components/weapon/WeaponTypes';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { Game } from '@ecs/core/game/Game';
import { SoundManager } from '@ecs/core/resources/SoundManager';
import { createDamageTextEntity } from '@ecs/entities';
import { CollisionSystem } from '../physics/CollisionSystem';
import { GridDebugLayer } from '../rendering';
import { RenderSystem } from '../rendering/RenderSystem';

// Performance monitoring thresholds
const PERFORMANCE_THRESHOLDS = {
  CRITICAL: 30, // FPS threshold for critical performance mode
  NORMAL: 45, // FPS threshold for normal performance mode
};

export class DamageSystem extends System {
  private collisionSystem: CollisionSystem | null = null;
  private renderSystem: RenderSystem | null = null;
  private lastPerformanceCheck: number = 0;
  private performanceCheckInterval: number = 1000; // Check every second
  private isInPerformanceMode: boolean = false;

  private highlightedCells: string[] = [];

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

  private getRenderSystem(): RenderSystem {
    if (this.renderSystem) return this.renderSystem;

    if (!this.renderSystem) {
      this.renderSystem = this.world.getSystem<RenderSystem>(
        'RenderSystem',
        SystemPriorities.RENDER,
      );
    }
    if (!this.renderSystem) {
      throw new Error('RenderSystem not found');
    }
    return this.renderSystem;
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

  private processLaserDamage(damageSource: Entity, damageComponent: DamageComponent): void {
    // laser only attack once because it's aoe
    if (damageComponent.laserProcessed) return;

    const { damage, isCritical } = damageComponent.getDamage();
    const laser = damageComponent.getLaser();
    if (!laser) {
      return;
    }
    // Get weapon configuration
    const weapon = damageComponent.weapon;
    if (!weapon || !damageComponent.isLaser()) {
      return;
    }

    // Get laser start position (player position)
    const startPos = damageSource
      .getComponent<TransformComponent>(TransformComponent.componentName)
      .getPosition();

    // Calculate laser direction vector
    const dx = laser.aim[0] - startPos[0];
    const dy = laser.aim[1] - startPos[1];
    const length = Math.sqrt(dx * dx + dy * dy);
    const dirX = dx / length;
    const dirY = dy / length;

    // Use weapon's laser width and length
    const laserWidth = (weapon as LaserWeapon).laserWidth;
    const laserLength = (weapon as LaserWeapon).laserLength;

    // Calculate laser end position
    const endPos: [number, number] = [
      startPos[0] + dirX * laserLength,
      startPos[1] + dirY * laserLength,
    ];

    // Get cells that the laser passes through
    const cells = this.gridComponent?.getCellsInLine(startPos, endPos, laserWidth);
    if (!cells) {
      return;
    }

    // Highlight cells in debug layer
    this.collectHighlightedCells(cells);

    const hitEnemies: Entity[] = [];
    const processedEnemies = new Set<string>(); // Track processed enemies to avoid duplicates

    // Check enemies in each cell
    for (const cell of cells) {
      const enemyIds = this.gridComponent?.getEntitiesInCell(cell, 'damage');
      if (!enemyIds) continue;

      for (const enemyId of enemyIds) {
        // Skip if already processed
        if (processedEnemies.has(enemyId)) continue;
        processedEnemies.add(enemyId);

        const enemy = this.world.getEntityById(enemyId);
        if (
          !enemy ||
          enemy.toRemove ||
          enemy.hasComponent(DeathMarkComponent.componentName) ||
          !enemy.hasComponent(HealthComponent.componentName)
        ) {
          continue;
        }

        const enemyPos = enemy
          .getComponent<TransformComponent>(TransformComponent.componentName)
          .getPosition();
        const enemySize = enemy
          .getComponent<RenderComponent>(RenderComponent.componentName)
          .getSize();
        const enemyRadius = Math.max(enemySize[0], enemySize[1]) / 2;

        // Calculate distance from enemy to laser line
        const distance = this.pointToRayDistance(enemyPos, startPos, dirX, dirY);

        // If enemy is within laser width plus their radius, they are hit
        if (distance <= laserWidth / 2 + enemyRadius) {
          hitEnemies.push(enemy);
        }
      }
    }

    // Apply damage to all hit enemies
    for (const enemy of hitEnemies) {
      const health = enemy.getComponent<HealthComponent>(HealthComponent.componentName);
      health.takeDamage(damage);

      // Set hit and daze states
      const stateComponent = enemy.getComponent<StateComponent>(StateComponent.componentName);
      if (stateComponent) {
        stateComponent.setHit(12); // 12 frames hit effect
        stateComponent.setDazed(12); // 12 frames daze effect
      }

      // Create damage text
      const damageTextEntity = createDamageTextEntity(this.world, {
        damage,
        targetPos: enemy
          .getComponent<TransformComponent>(TransformComponent.componentName)
          .getPosition(),
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

    // mark laser as processed
    damageComponent.laserProcessed = true;
  }

  // Helper method to calculate distance from a point to a ray
  private pointToRayDistance(
    point: [number, number],
    rayStart: [number, number],
    dirX: number,
    dirY: number,
  ): number {
    const x = point[0];
    const y = point[1];
    const x1 = rayStart[0];
    const y1 = rayStart[1];

    // Vector from ray start to point
    const px = x - x1;
    const py = y - y1;

    // Project point onto ray direction
    const proj = px * dirX + py * dirY;

    // If projection is negative, point is behind ray start
    if (proj < 0) {
      return Math.sqrt(px * px + py * py);
    }

    // Calculate closest point on ray
    const closestX = x1 + dirX * proj;
    const closestY = y1 + dirY * proj;

    // Calculate distance from point to closest point on ray
    const dx = x - closestX;
    const dy = y - closestY;

    return Math.sqrt(dx * dx + dy * dy);
  }

  private getGridDebugLayer(): GridDebugLayer | null {
    const gridDebugLayer = this.getRenderSystem().getGridDebugLayer();
    if (!gridDebugLayer) {
      return null;
    }
    return gridDebugLayer;
  }

  private collectHighlightedCells(cells: string[]): void {
    const gridDebugLayer = this.getGridDebugLayer();
    if (!gridDebugLayer) {
      return;
    }
    this.highlightedCells.push(...cells);
  }

  private sendHighlightedCells(): void {
    const gridDebugLayer = this.getGridDebugLayer();
    if (!gridDebugLayer) {
      return;
    }
    if (this.highlightedCells.length === 0) return;
    gridDebugLayer.setHighlightedCells(this.highlightedCells);
    this.highlightedCells.length = 0;
  }

  update(deltaTime: number): void {
    this.checkPerformance();

    const collisionResults = this.getCollisionSystem().getCollisionResults();
    const entitiesToRemove: Entity[] = [];

    // Process collisions based on performance mode
    for (const result of collisionResults) {
      const { entity1, entity2 } = result;

      if (!entity1 || !entity2) continue;

      // Skip invalid pairs
      if (
        entity1.toRemove ||
        entity2.toRemove ||
        entity1.hasComponent(DeathMarkComponent.componentName) ||
        entity2.hasComponent(DeathMarkComponent.componentName) ||
        !entity1.hasComponent(ColliderComponent.componentName) ||
        !entity2.hasComponent(ColliderComponent.componentName) ||
        entity1.isType('player') ||
        entity2.isType('player') ||
        (entity1.isType('enemy') && entity2.isType('enemy'))
      ) {
        continue;
      }

      // Handle projectile damage
      const isProjectile1 = entity1.isType('projectile');
      const isProjectile2 = entity2.isType('projectile');
      const isAreaEffect1 = entity1.isType('areaEffect');
      const isAreaEffect2 = entity2.isType('areaEffect');

      // Skip invalid collision types
      if ((isProjectile1 && isProjectile2) || (isAreaEffect1 && isAreaEffect2)) continue;

      const damageSource = isProjectile1 ? entity1 : isAreaEffect1 ? entity1 : entity2;
      const enemy = isProjectile1 || isAreaEffect1 ? entity2 : entity1;

      if (
        // invalid enemy
        !enemy.hasComponent(HealthComponent.componentName) ||
        !enemy.hasComponent(TransformComponent.componentName) ||
        // invalid damage source
        !damageSource.hasComponent(DamageComponent.componentName)
      ) {
        continue;
      }

      const health = enemy.getComponent<HealthComponent>(HealthComponent.componentName);
      const position = enemy
        .getComponent<TransformComponent>(TransformComponent.componentName)
        .getPosition();
      const damageComponent = damageSource.getComponent<DamageComponent>(
        DamageComponent.componentName,
      );

      // For area effects (which are triggers), always process continuous damage
      if (isAreaEffect1 || isAreaEffect2) {
        // Check if area effect is still valid
        if (damageComponent.isAoe() && !damageComponent.isExpired()) {
          this.processContinuousDamage(damageSource, enemy, damageComponent, health, position);
        } else if (damageComponent.isLaser()) {
          this.processLaserDamage(damageSource, damageComponent);
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
      if (
        (!damageComponent.canHitMore() || damageComponent.isExpired()) &&
        // some damageSource should not be removed by attack, it will be removed by lifeCycleSystem
        damageComponent.shouldRemoveAfterAttack()
      ) {
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

    this.sendHighlightedCells();
  }
}
