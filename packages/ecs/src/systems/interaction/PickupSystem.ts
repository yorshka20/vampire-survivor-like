import {
  ChaseComponent,
  ExperienceComponent,
  HealthComponent,
  MovementComponent,
  PickupComponent,
  StatsComponent,
  WeaponComponent,
} from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';
import { IEntity } from '@ecs/core/ecs/types';
import { SoundManager } from '@ecs/core/resources/SoundManager';

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

  private checkGlobalPull(player: IEntity): void {
    const currentTime = Date.now();
    if (currentTime - this.lastGlobalPullTime >= this.GLOBAL_PULL_INTERVAL) {
      this.triggerGlobalItemPull(player);
      this.lastGlobalPullTime = currentTime;
    }
  }

  update(deltaTime: number): void {
    if (!this.gridComponent) return;

    const player = this.getPlayer();
    if (!player) return;

    // invoke global pull every 30 seconds
    this.checkGlobalPull(player);

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

      // Skip if entity doesn't exist or is not a pickup
      if (!entity || !entity.isType('pickup')) {
        continue;
      }

      // Skip if entity doesn't have required components
      if (!entity.hasComponent(PickupComponent.componentName)) {
        continue;
      }

      const pickupComponent = entity.getComponent<PickupComponent>(PickupComponent.componentName);
      if (pickupComponent.isBeingCollected) {
        continue;
      }

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
            SoundManager.playSound(player, 'power_up');
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
            SoundManager.playSound(player, 'tap');
          }
          break;

        case 'magnet':
          stats.applyIncrement('pickupRangeMultiplier', pickup.value);
          break;

        case 'specialEffect':
          this.triggerGlobalItemPull(player);
          SoundManager.playSound(player, 'coin');
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

    if (level % 5 === 0) {
      // todo: mode selection
    }
  }

  private triggerGlobalItemPull(player: IEntity): void {
    const allItems = this.world.getEntitiesByCondition(
      (entity) =>
        entity.hasComponent(PickupComponent.componentName) &&
        !entity.hasComponent(ChaseComponent.componentName),
    );
    for (const item of allItems) {
      // Skip if item is being collected or not pullable
      const pickupComponent = item.getComponent<PickupComponent>(PickupComponent.componentName);
      if (pickupComponent.isBeingCollected || !pickupComponent.pullable) continue;

      item.addComponent(
        this.world.createComponent(ChaseComponent, {
          targetId: player.id,
          speed: 0.8,
        }),
      );
    }
  }
}
