import {
  ChaseComponent,
  ExperienceComponent,
  HealthComponent,
  MovementComponent,
  PickupComponent,
  StatsComponent,
  VelocityComponent,
  WeaponComponent,
} from '@ecs/components';
import { Weapon, WeaponType } from '@ecs/components/weapon/WeaponTypes';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';
import { IEntity } from '@ecs/core/ecs/types';
import { generateRandomColor } from '@ecs/utils/color';

export class PickupSystem extends System {
  invokeTimeGap = 50;
  private basePickupRange = 50;
  private collectionDistance = 10; // Distance at which items are considered collected
  private lastGlobalPullTime: number = 0;
  private readonly GLOBAL_PULL_INTERVAL = 1000 * 30; // 30 seconds

  constructor() {
    super('PickupSystem', SystemPriorities.PICKUP, 'logic');
    // this.debug = true; // Enable debug mode
    this.lastGlobalPullTime = Date.now();
  }

  update(deltaTime: number): void {
    if (!this.gridComponent) return;

    const player = this.getPlayer();
    if (!player) return;

    // Check if it's time for global pull
    const currentTime = Date.now();
    if (currentTime - this.lastGlobalPullTime >= this.GLOBAL_PULL_INTERVAL) {
      this.triggerGlobalItemPull(player);
      this.lastGlobalPullTime = currentTime;
      return;
    }

    const playerMovement = player.getComponent<MovementComponent>(MovementComponent.componentName);
    const stats = player.getComponent<StatsComponent>(StatsComponent.componentName);

    const entitiesToRemove: string[] = [];
    const componentsToPickup: PickupComponent[] = [];

    const playerPos = playerMovement.getPosition();
    const pickupRange = this.basePickupRange * (stats?.pickupRangeMultiplier ?? 1);

    // Use 'pickup' query type for better cache performance
    const nearbyEntities = this.gridComponent.getNearbyEntities(playerPos, pickupRange, 'pickup');

    for (const entityId of nearbyEntities) {
      const entity = this.world.getEntityById(entityId);
      if (!entity?.hasComponent(PickupComponent.componentName) || !entity.isType('pickup')) {
        continue;
      }

      const pickupComponent = entity.getComponent<PickupComponent>(PickupComponent.componentName);
      if (pickupComponent.isBeingCollected) continue;

      const pickupMovement = entity.getComponent<MovementComponent>(
        MovementComponent.componentName,
      );
      const pickupPos = pickupMovement.getPosition();

      const dx = playerPos[0] - pickupPos[0];
      const dy = playerPos[1] - pickupPos[1];
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Magnetic pull behavior for items in magnetic range
      if (
        distance < pickupComponent.magnetRange &&
        !entity.hasComponent(ChaseComponent.componentName)
      ) {
        if (entity.hasComponent(VelocityComponent.componentName)) {
          const velocity = entity.getComponent<VelocityComponent>(VelocityComponent.componentName);
          velocity.setVelocity({ x: 0, y: 0 });
        }

        entity.addComponent(
          this.world.createComponent(ChaseComponent, {
            targetId: player.id,
            speed: 1,
            decelerationDistance: 30,
            decelerationRate: 1,
          }),
        );
      }

      // Collection when in pickup range
      if (distance < pickupRange) {
        pickupComponent.startCollection();
        componentsToPickup.push(pickupComponent);
        entitiesToRemove.push(entity.id);
      }
    }

    // Remove collected pickups
    for (const id of entitiesToRemove) {
      const entity = this.world.getEntityById(id);
      if (entity) {
        this.world.removeEntity(entity);
      }
    }

    this.collectPickups(player, componentsToPickup);
  }

  private collectPickups(player: IEntity, pickups: PickupComponent[]): void {
    const stats = player.getComponent<StatsComponent>(StatsComponent.componentName);

    for (const pickup of pickups) {
      switch (pickup.type) {
        case 'experience':
          const expGain = pickup.value * (stats?.expGainMultiplier ?? 1);
          const exp = player.getComponent<ExperienceComponent>(ExperienceComponent.componentName);
          const leveledUp = exp.addExperience(expGain);

          if (leveledUp) {
            this.onPlayerLevelUp(player, exp.level);
          }
          break;

        case 'health':
          const health = player.getComponent<HealthComponent>(HealthComponent.componentName);
          health.heal(pickup.value);
          break;

        case 'weapon':
          if (pickup.weapon) {
            const weapons = player.getComponent<WeaponComponent>(WeaponComponent.componentName);
            weapons.addWeapon(pickup.weapon);
          }
          break;

        case 'powerup':
          if (pickup.powerup) {
            stats.applyMultiplier(
              `${pickup.powerup.stat}Multiplier` as any,
              pickup.powerup.multiplier,
            );
          }
          break;

        case 'pickup':
          stats.applyIncrement('pickupRangeMultiplier', pickup.value);
          break;

        case 'specialEffect':
          this.triggerGlobalItemPull(player);
          break;
      }
    }
  }

  private onPlayerLevelUp(player: IEntity, level: number): void {
    // Grant stat boost on level up
    if (player.hasComponent(StatsComponent.componentName)) {
      const stats = player.getComponent<StatsComponent>(StatsComponent.componentName);

      // Small random stat boost
      const statBoosts = [
        { stat: 'damageMultiplier' as const, mult: 1.05 },
        { stat: 'attackSpeedMultiplier' as const, mult: 1.03 },
        { stat: 'moveSpeedMultiplier' as const, mult: 1.02 },
        { stat: 'maxHealthMultiplier' as const, mult: 1.1 },
      ];

      const randomBoost = statBoosts[Math.floor(Math.random() * statBoosts.length)];
      stats.applyMultiplier(randomBoost.stat, randomBoost.mult);
    }

    // Add a new weapon every 5 levels
    if (level % 5 === 0 && player.hasComponent(WeaponComponent.componentName)) {
      const weapons = player.getComponent<WeaponComponent>(WeaponComponent.componentName);

      const newWeapon: Weapon = {
        name: `Level ${level} Weapon`,
        damage: 10 + level,
        attackSpeed: 2,
        projectileSpeed: 8,
        projectileSize: [8 + level, 8 + level],
        projectileColor: generateRandomColor(),
        range: 400,
        type: WeaponType.RANGED_AUTO_AIM,
      };
      weapons.addWeapon(newWeapon);
    }
  }

  private triggerGlobalItemPull(player: IEntity): void {
    const allItems = this.world.getEntitiesWithComponents([PickupComponent, MovementComponent]);
    for (const item of allItems) {
      if (item.hasComponent(ChaseComponent.componentName)) continue;

      // Skip if item is being collected or not pullable
      const pickupComponent = item.getComponent<PickupComponent>(PickupComponent.componentName);
      if (pickupComponent.isBeingCollected || !pickupComponent.pullable) continue;

      if (item.hasComponent(VelocityComponent.componentName)) {
        const velocity = item.getComponent<VelocityComponent>(VelocityComponent.componentName);
        velocity.setVelocity({ x: 0, y: 0 });
      }

      item.addComponent(
        this.world.createComponent(ChaseComponent, {
          targetId: player.id,
          speed: 0.8,
          decelerationDistance: 30,
          decelerationRate: 1,
        }),
      );
    }
  }
}
