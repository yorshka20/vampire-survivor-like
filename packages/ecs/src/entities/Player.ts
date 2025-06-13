import {
  ColliderComponent,
  ExperienceComponent,
  HealthComponent,
  InputComponent,
  MovementComponent,
  RenderComponent,
  StatsComponent,
  VelocityComponent,
  WeaponComponent,
} from '@ecs/components';
import { RenderLayerIdentifier } from '@ecs/constants/renderLayerPriority';
import { WeaponMap } from '@ecs/constants/resources/weapon/weaponList';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';

interface PlayerProps {
  id?: string;
  position?: { x: number; y: number };
  speed?: number;
  color?: { r: number; g: number; b: number; a: number };
  size?: [number, number];
  shape?: 'circle' | 'rect' | 'triangle';
}

/**
 * Factory function to create a Player entity
 */
export function createPlayerEntity(
  world: World,
  {
    id = 'player',
    position = { x: 400, y: 300 },
    speed = 5,
    color = { r: 0, g: 255, b: 0, a: 1 },
    size = [40, 40],
  }: PlayerProps,
) {
  const player = new Entity(id, 'player');

  // Basic components
  player.addComponent(world.createComponent(InputComponent, {}));
  player.addComponent(
    world.createComponent(MovementComponent, {
      position,
      speed,
    }),
  );
  player.addComponent(
    world.createComponent(RenderComponent, {
      shape: 'pattern',
      patternType: 'player',
      size,
      color,
      visible: true,
      layer: RenderLayerIdentifier.ENTITY,
    }),
  );

  // Game-specific components
  player.addComponent(
    world.createComponent(HealthComponent, {
      maxHealth: 100,
    }),
  );

  player.addComponent(
    world.createComponent(VelocityComponent, {
      velocity: { x: 5, y: 5 },
      maxSpeed: speed,
      friction: 0.85,
    }),
  );

  const weapons = [
    WeaponMap.SpiralOrb,
    // WeaponMap.Aura,
    // WeaponMap.RapidFire,
    WeaponMap.SpiralShot,
  ];

  player.addComponent(
    world.createComponent(WeaponComponent, {
      weapons,
      currentWeaponIndex: 0,
    }),
  );

  player.addComponent(
    world.createComponent(ExperienceComponent, {
      level: 1,
      currentExp: 0,
      expToNextLevel: 100,
    }),
  );

  player.addComponent(world.createComponent(StatsComponent, {}));

  player.addComponent(
    world.createComponent(ColliderComponent, {
      type: 'circle',
      size,
      offset: [0, 0],
      isTrigger: false,
    }),
  );

  return player;
}
