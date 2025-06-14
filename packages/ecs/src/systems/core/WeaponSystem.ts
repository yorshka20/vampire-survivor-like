import {
  HealthComponent,
  MovementComponent,
  RenderComponent,
  StatsComponent,
  WeaponComponent,
} from '@ecs/components';
import {
  AreaWeapon,
  BombWeapon,
  MeleeWeapon,
  RangedWeapon,
  SpinningWeapon,
  SpiralWeapon,
  WeaponType,
} from '@ecs/components/weapon/WeaponTypes';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { Game } from '@ecs/core/game/Game';
import { createAreaEffectEntity, createEffectEntity, createProjectileEntity } from '@ecs/entities';
import { TimeUtil } from '@ecs/utils/timeUtil';

export class WeaponSystem extends System {
  private maxAreaEffects = 10;
  private areaEffects: Entity[] = [];

  constructor() {
    super('WeaponSystem', SystemPriorities.WEAPON, 'logic');
  }

  update(deltaTime: number): void {
    const currentTime = TimeUtil.now();
    const weaponEntities = this.world.getEntitiesWithComponents([
      WeaponComponent,
      MovementComponent,
    ]);

    for (const weaponEntity of weaponEntities) {
      const weapon = weaponEntity.getComponent<WeaponComponent>(WeaponComponent.componentName);
      if (!weapon.canAttack(currentTime, weapon.currentWeaponIndex)) continue;

      const movement = weaponEntity.getComponent<MovementComponent>(
        MovementComponent.componentName,
      );
      const stats = weaponEntity.getComponent<StatsComponent>(StatsComponent.componentName);

      // Process each weapon
      for (let i = 0; i < weapon.weapons.length; i++) {
        const currentWeapon = weapon.weapons[i];
        if (!currentWeapon) continue;

        // Check if we can attack with this weapon
        const effectiveAttackSpeed =
          currentWeapon.attackSpeed * (stats?.attackSpeedMultiplier ?? 1);
        const attackInterval = TimeUtil.toMilliseconds(1) / effectiveAttackSpeed;
        const lastAttackTime = weapon.lastAttackTimes[i] ?? 0;

        if (currentTime - lastAttackTime >= attackInterval) {
          const position = movement.getPosition();
          const effectiveDamage = currentWeapon.damage * (stats?.damageMultiplier ?? 1);

          switch (currentWeapon.type) {
            case WeaponType.RANGED_AUTO_AIM:
              this.handleRangedAutoAim(
                weaponEntity,
                weapon,
                currentWeapon as RangedWeapon,
                position,
                effectiveDamage,
                currentTime,
                i,
              );
              break;
            case WeaponType.RANGED_FIXED:
              this.handleRangedFixed(
                weaponEntity,
                weapon,
                currentWeapon as RangedWeapon,
                position,
                effectiveDamage,
                currentTime,
                i,
              );
              break;
            case WeaponType.MELEE:
              this.handleMelee(
                weaponEntity,
                weapon,
                currentWeapon as MeleeWeapon,
                position,
                effectiveDamage,
                currentTime,
                i,
              );
              break;
            case WeaponType.AREA:
              this.handleArea(
                weaponEntity,
                weapon,
                currentWeapon as AreaWeapon,
                position,
                effectiveDamage,
                currentTime,
                i,
              );
              break;
            case WeaponType.SPIRAL:
              this.handleSpiral(
                weaponEntity,
                weapon,
                currentWeapon as SpiralWeapon,
                position,
                effectiveDamage,
                currentTime,
                i,
              );
              break;
            case WeaponType.SPINNING:
              this.handleSpinning(
                weaponEntity,
                weapon,
                currentWeapon as SpinningWeapon,
                position,
                effectiveDamage,
                currentTime,
                i,
              );
              break;
            case WeaponType.BOMB:
              this.handleBomb(
                weaponEntity,
                weapon,
                currentWeapon as BombWeapon,
                position,
                effectiveDamage,
                currentTime,
                i,
              );
              break;
          }
        }
      }
    }
  }

  private handleRangedAutoAim(
    entity: Entity,
    weapon: WeaponComponent,
    currentWeapon: RangedWeapon,
    position: [number, number],
    effectiveDamage: number,
    currentTime: number,
    weaponIndex: number,
  ): void {
    // Find nearest enemy
    const enemyIds = this.gridComponent?.getNearbyEntities(position, currentWeapon.range) ?? [];
    if (enemyIds.length === 0) return;

    let nearestEnemy: Entity | null = null;
    let nearestDistance = Infinity;
    let nearestEnemyPosition: [number, number] | null = null;

    // todo: optimize finding the nearest enemy
    for (const enemyId of enemyIds) {
      const enemy = this.world.getEntityById(enemyId);
      if (!enemy?.isType('enemy')) continue;

      const enemyMovement = enemy.getComponent<MovementComponent>(MovementComponent.componentName);
      const enemyPos = enemyMovement.getPosition();
      const distance = Math.sqrt(
        (enemyPos[0] - position[0]) ** 2 + (enemyPos[1] - position[1]) ** 2,
      );

      if (distance < nearestDistance && distance <= currentWeapon.range) {
        nearestDistance = distance;
        nearestEnemy = enemy;
        nearestEnemyPosition = enemyPos;
      }
    }

    if (nearestEnemy && nearestEnemyPosition) {
      // Calculate direction
      const dx = nearestEnemyPosition[0] - position[0];
      const dy = nearestEnemyPosition[1] - position[1];
      const distance = Math.sqrt(dx * dx + dy * dy);
      const dirX = dx / distance;
      const dirY = dy / distance;

      this.createProjectile(entity, currentWeapon, position, dirX, dirY, effectiveDamage);
      weapon.updateAttackTime(currentTime, weaponIndex);
    }
  }

  private handleRangedFixed(
    entity: Entity,
    weapon: WeaponComponent,
    currentWeapon: RangedWeapon,
    position: [number, number],
    effectiveDamage: number,
    currentTime: number,
    weaponIndex: number,
  ): void {
    // Convert angle to radians
    const angleRad = ((currentWeapon.fixedAngle ?? 0) * Math.PI) / 180;
    const dirX = Math.cos(angleRad);
    const dirY = Math.sin(angleRad);

    this.createProjectile(entity, currentWeapon, position, dirX, dirY, effectiveDamage);
    weapon.updateAttackTime(currentTime, weaponIndex);
  }

  private handleMelee(
    entity: Entity,
    weapon: WeaponComponent,
    currentWeapon: MeleeWeapon,
    position: [number, number],
    effectiveDamage: number,
    currentTime: number,
    weaponIndex: number,
  ): void {
    // Find enemies in melee range
    const enemyIds = this.gridComponent?.getNearbyEntities(position, currentWeapon.range) ?? [];

    for (const enemyId of enemyIds) {
      const enemy = this.world.getEntityById(enemyId);
      if (!enemy || !enemy.isType('enemy')) continue;

      const enemyMovement = enemy.getComponent<MovementComponent>(MovementComponent.componentName);
      const enemyPos = enemyMovement.getPosition();
      const distance = Math.sqrt(
        (enemyPos[0] - position[0]) ** 2 + (enemyPos[1] - position[1]) ** 2,
      );

      if (distance <= currentWeapon.range) {
        // Calculate angle between weapon and enemy
        const dx = enemyPos[0] - position[0];
        const dy = enemyPos[1] - position[1];
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);

        // Check if enemy is within swing angle
        if (Math.abs(angle) <= currentWeapon.swingAngle / 2) {
          const health = enemy.getComponent<HealthComponent>(HealthComponent.componentName);
          if (health) {
            health.takeDamage(effectiveDamage);
          }
        }
      }
    }

    weapon.updateAttackTime(currentTime, weaponIndex);
  }

  private getRandomPositionInViewport(position: [number, number]): { x: number; y: number } {
    const game = Game.getInstance();
    const viewport = game.getViewport();
    const padding = 50; // Padding from viewport edges
    const [px, py] = position;

    // Calculate the actual visible area
    const minX = px - viewport.width / 2 + padding;
    const maxX = px + viewport.width / 2 - padding;
    const minY = py - viewport.height / 2 + padding;
    const maxY = py + viewport.height / 2 - padding;

    return {
      x: Math.random() * (maxX - minX - 2 * padding) + minX + padding,
      y: Math.random() * (maxY - minY - 2 * padding) + minY + padding,
    };
  }

  private handleArea(
    entity: Entity,
    weapon: WeaponComponent,
    currentWeapon: AreaWeapon,
    position: [number, number],
    effectiveDamage: number,
    currentTime: number,
    weaponIndex: number,
  ): void {
    if (this.areaEffects.length >= this.maxAreaEffects) {
      return;
    }

    // Generate random position within viewport
    const randomPos = this.getRandomPositionInViewport(position);

    // Create area effect entity
    const areaEffect = createAreaEffectEntity(this.world, {
      position: randomPos,
      radius: currentWeapon.radius,
      duration: currentWeapon.duration,
      tickRate: currentWeapon.tickRate,
      damage: effectiveDamage,
      source: entity.id,
      weapon: currentWeapon,
    });

    this.world.addEntity(areaEffect);
    this.areaEffects.push(areaEffect);

    // Remove area effect when it is removed from the world
    areaEffect.onRemoved((id) => {
      this.areaEffects = this.areaEffects.filter((effect) => effect.id !== id);
    });

    weapon.updateAttackTime(currentTime, weaponIndex);
  }

  private createProjectile(
    entity: Entity,
    weapon: RangedWeapon,
    position: [number, number],
    dirX: number,
    dirY: number,
    damage: number,
  ): void {
    const render = entity.getComponent<RenderComponent>(RenderComponent.componentName);
    const [sizeX, sizeY] = render ? render.getSize() : [0, 0];

    const projectile = createProjectileEntity(this.world, {
      position: {
        x: position[0] + sizeX / 2,
        y: position[1] + sizeY / 2,
      },
      velocity: {
        x: dirX * weapon.projectileSpeed,
        y: dirY * weapon.projectileSpeed,
      },
      damage: damage,
      source: entity.id,
      size: weapon.projectileSize,
      color: weapon.projectileColor,
      weapon: weapon,
    });

    this.world.addEntity(projectile);
  }

  private handleSpiral(
    entity: Entity,
    weapon: WeaponComponent,
    currentWeapon: SpiralWeapon,
    position: [number, number],
    effectiveDamage: number,
    currentTime: number,
    weaponIndex: number,
  ): void {
    // Calculate positions around the player
    const angleStep = (2 * Math.PI) / currentWeapon.projectileCount;

    for (let i = 0; i < currentWeapon.projectileCount; i++) {
      const angle = i * angleStep;
      const spawnX = position[0] + Math.cos(angle) * currentWeapon.spiralRadius;
      const spawnY = position[1] + Math.sin(angle) * currentWeapon.spiralRadius;

      // Create projectile with spiral trajectory
      const projectile = createProjectileEntity(this.world, {
        position: {
          x: spawnX,
          y: spawnY,
        },
        damage: effectiveDamage,
        source: entity.id,
        size: currentWeapon.projectileSize,
        color: currentWeapon.projectileColor,
        weapon: currentWeapon,
        penetration: currentWeapon.penetration,
        lifetime: currentWeapon.projectileLifetime,
        type: 'spiral',
        spiralData: {
          maxProjectileCount: currentWeapon.maxProjectileCount,
          projectileSpeed: currentWeapon.projectileSpeed,
          projectileSize: currentWeapon.projectileSize,
          projectileColor: currentWeapon.projectileColor,
          projectileCount: currentWeapon.projectileCount,
          projectileLifetime: currentWeapon.projectileLifetime,
          followPlayer: currentWeapon.followPlayer,
          spiralRadius: currentWeapon.spiralRadius,
          spiralSpeed: currentWeapon.spiralSpeed,
          spiralExpansion: currentWeapon.spiralExpansion,
          initialAngle: angle,
        },
      });

      this.world.addEntity(projectile);
    }

    weapon.updateAttackTime(currentTime, weaponIndex);
  }

  private handleSpinning(
    entity: Entity,
    weapon: WeaponComponent,
    currentWeapon: SpinningWeapon,
    position: [number, number],
    effectiveDamage: number,
    currentTime: number,
    weaponIndex: number,
  ): void {
    // Calculate positions around the player
    const angleStep = (2 * Math.PI) / currentWeapon.spinCount;

    for (let i = 0; i < currentWeapon.spinCount; i++) {
      const angle = i * angleStep * Math.random();
      const spawnX = position[0] + Math.cos(angle) * currentWeapon.spinRadius;
      const spawnY = position[1] + Math.sin(angle) * currentWeapon.spinRadius;

      const spinRadius = Math.random() * (currentWeapon.spinRadius - 50) + 50;

      // Create projectile with spiral trajectory
      const projectile = createProjectileEntity(this.world, {
        position: {
          x: spawnX,
          y: spawnY,
        },
        size: currentWeapon.projectileSize,
        damage: effectiveDamage,
        source: entity.id,
        penetration: currentWeapon.penetration,
        lifetime: currentWeapon.spinLifetime,
        type: 'spinning',
        weapon: currentWeapon,
        spinningData: {
          maxProjectileCount: currentWeapon.maxProjectileCount,
          projectileSpeed: currentWeapon.projectileSpeed,
          projectileSize: currentWeapon.projectileSize,
          projectileColor: currentWeapon.projectileColor,
          projectileCount: currentWeapon.projectileCount,
          projectileLifetime: currentWeapon.projectileLifetime,
          followPlayer: currentWeapon.followPlayer,
          spinRadius,
          spinSpeed: currentWeapon.spinSpeed,
          spinCount: currentWeapon.spinCount,
          spinLifetime: currentWeapon.spinLifetime,
        },
      });

      // todo: better child weapon handling
      // Add WeaponComponent and StatsComponent to the projectile if it has a child weapon
      if (currentWeapon.childWeapon) {
        // Add StatsComponent first
        projectile.addComponent(
          this.world.createComponent(StatsComponent, {
            damageMultiplier: 1,
            attackSpeedMultiplier: 1,
          }),
        );

        // Then add WeaponComponent
        projectile.addComponent(
          this.world.createComponent(WeaponComponent, {
            weapons: [currentWeapon.childWeapon],
            attackCooldown: currentWeapon.childWeaponAttackCooldown,
          }),
        );
      }

      this.world.addEntity(projectile);
    }

    weapon.updateAttackTime(currentTime, weaponIndex);
  }

  private handleBomb(
    entity: Entity,
    weapon: WeaponComponent,
    currentWeapon: BombWeapon,
    position: [number, number],
    effectiveDamage: number,
    currentTime: number,
    weaponIndex: number,
  ): void {
    // Find nearest enemy
    const enemyIds = this.gridComponent?.getNearbyEntities(position, currentWeapon.range) ?? [];
    if (enemyIds.length === 0) return;

    let nearestEnemy: Entity | null = null;
    let nearestDistance = Infinity;
    let nearestEnemyPosition: [number, number] | null = null;

    for (const enemyId of enemyIds) {
      const enemy = this.world.getEntityById(enemyId);
      if (!enemy?.isType('enemy')) continue;

      const enemyMovement = enemy.getComponent<MovementComponent>(MovementComponent.componentName);
      const enemyPos = enemyMovement.getPosition();
      const distance = Math.sqrt(
        (enemyPos[0] - position[0]) ** 2 + (enemyPos[1] - position[1]) ** 2,
      );

      if (distance < nearestDistance && distance <= currentWeapon.range) {
        nearestDistance = distance;
        nearestEnemy = enemy;
        nearestEnemyPosition = enemyPos;
      }
    }

    if (nearestEnemy && nearestEnemyPosition) {
      // Calculate direction
      const dx = nearestEnemyPosition[0] - position[0];
      const dy = nearestEnemyPosition[1] - position[1];
      const distance = Math.sqrt(dx * dx + dy * dy);
      const dirX = dx / distance;
      const dirY = dy / distance;

      // Create bomb projectile
      const projectile = createProjectileEntity(this.world, {
        position: {
          x: position[0],
          y: position[1],
        },
        velocity: {
          x: dirX * currentWeapon.projectileSpeed,
          y: dirY * currentWeapon.projectileSpeed,
        },
        damage: effectiveDamage,
        source: entity.id,
        size: currentWeapon.projectileSize,
        color: currentWeapon.projectileColor,
        weapon: currentWeapon,
        type: 'bomb',
        lifetime: currentWeapon.projectileLifetime,
      });

      // Add onRemoved handler to create explosion when projectile is removed
      projectile.onRemoved(() => {
        const projectilePos = projectile
          .getComponent<MovementComponent>(MovementComponent.componentName)
          .getPosition();
        // Create a visual-only explosion effect
        const explosion = createEffectEntity(this.world, {
          position: {
            x: projectilePos[0],
            y: projectilePos[1],
          },
          size: [currentWeapon.explosionRadius, currentWeapon.explosionRadius],
          type: 'explosion',
          duration: currentWeapon.explosionDuration,
          color: currentWeapon.explosionColor,
        });

        console.log('explosion', explosion);
        this.world.addEntity(explosion);
      });

      this.world.addEntity(projectile);
      weapon.updateAttackTime(currentTime, weaponIndex);
    }
  }
}
