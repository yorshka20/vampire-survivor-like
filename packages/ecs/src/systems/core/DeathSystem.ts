import { DeathMarkComponent, HealthComponent, MovementComponent } from '@ecs/components';
import { ItemDropRate } from '@ecs/constants/itemDropRate';
import { PowerupStats, WeaponList } from '@ecs/constants/resources';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { SoundManager } from '@ecs/core/resources/SoundManager';
import { createItemEntity } from '@ecs/entities/Item';
import { SystemPriorities } from '../../constants/systemPriorities';

export class DeathSystem extends System {
  private dropItemsMap: { rate: number; create: (position: [number, number]) => void }[] = [];
  constructor() {
    super('DeathSystem', SystemPriorities.DEATH, 'logic');
    this.dropItemsMap = [
      {
        rate: ItemDropRate.HEALTH,
        create: (position) => this.createHealthPickup(position[0], position[1], 20),
      },
      {
        rate: ItemDropRate.WEAPON,
        create: (position) => this.createWeaponPickup(position[0], position[1]),
      },
      {
        rate: ItemDropRate.POWERUP,
        create: (position) => this.createPowerupPickup(position[0], position[1]),
      },
      {
        rate: ItemDropRate.MAGNET,
        create: (position) => this.createMagnetPickup(position[0], position[1]),
      },
      {
        rate: ItemDropRate.GLOBAL_PULL,
        create: (position) => this.createGlobalPullPickup(position[0], position[1]),
      },
    ];
  }

  update(deltaTime: number): void {
    const entities = this.world.getEntitiesByType('enemy');
    const entitiesToRemove: Entity[] = [];

    for (const entity of entities) {
      // Check for death mark first
      if (entity.hasComponent(DeathMarkComponent.componentName)) {
        // Play death sound if entity has sound effect component
        SoundManager.playSound(entity, 'death');
        // Drop items
        this.dropItems(entity);
        entitiesToRemove.push(entity);
        continue;
      }

      // Only check health if no death mark
      if (entity.hasComponent(HealthComponent.componentName)) {
        const health = entity.getComponent<HealthComponent>(HealthComponent.componentName);
        if (health.isDead && !entity.hasComponent(DeathMarkComponent.componentName)) {
          // Add death mark to ensure consistent handling
          entity.addComponent(this.world.createComponent(DeathMarkComponent, undefined));
          entitiesToRemove.push(entity);
        }
      }
    }

    // Remove dead entities
    for (const entity of entitiesToRemove) {
      this.world.removeEntity(entity);
    }
  }

  private dropItems(enemy: Entity): void {
    const movement = enemy.getComponent<MovementComponent>(MovementComponent.componentName);
    if (!movement) return;

    const health = enemy.getComponent<HealthComponent>(HealthComponent.componentName);
    const position = movement.getPosition();

    // Always drop experience
    this.createExperienceGem(
      position[0],
      position[1],
      10 * health.maxHealth + Math.floor(Math.random() * 20),
    );

    // Chance for other drops
    const dropChance = Math.random();
    let accumulatedChance = 0;

    // Judge which item should drop based on ItemDropRate
    const judgeDrop = (chance: number): boolean => {
      const dropped = dropChance < accumulatedChance;
      accumulatedChance += chance;
      return dropped;
    };

    for (const config of this.dropItemsMap) {
      if (judgeDrop(config.rate)) {
        config.create(position);
        break;
      }
    }
  }

  private createExperienceGem(x: number, y: number, value: number): void {
    const gem = createItemEntity(this.world, {
      position: { x, y },
      type: 'experience',
      value,
      pullable: true,
    });

    this.world.addEntity(gem);
  }

  private createHealthPickup(x: number, y: number, value: number): void {
    const health = createItemEntity(this.world, {
      position: { x, y },
      type: 'health',
      value,
      pullable: true,
    });

    this.world.addEntity(health);
  }

  private createWeaponPickup(x: number, y: number): void {
    const randomWeapon = WeaponList[Math.floor(Math.random() * WeaponList.length)];

    const weapon = createItemEntity(this.world, {
      position: { x, y },
      type: 'weapon',
      weapon: [randomWeapon],
      pullable: false,
    });

    this.world.addEntity(weapon);
  }

  private createPowerupPickup(x: number, y: number): void {
    const randomPowerup = PowerupStats[Math.floor(Math.random() * PowerupStats.length)];
    const powerup = createItemEntity(this.world, {
      position: { x, y },
      type: 'powerup',
      powerup: randomPowerup,
      pullable: true,
    });

    this.world.addEntity(powerup);
  }

  private createMagnetPickup(x: number, y: number): void {
    const pickup = createItemEntity(this.world, {
      position: { x, y },
      type: 'magnet',
      pullable: true,
      value: 0.01,
    });

    this.world.addEntity(pickup);
  }

  private createGlobalPullPickup(x: number, y: number): void {
    const pickup = createItemEntity(this.world, {
      position: { x, y },
      type: 'specialEffect',
      size: [40, 40],
      pullable: false,
    });

    this.world.addEntity(pickup);
  }
}
