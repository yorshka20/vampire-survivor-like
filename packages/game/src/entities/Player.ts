import {
  AnimationComponent,
  ColliderComponent,
  ExperienceComponent,
  HealthComponent,
  InputComponent,
  PhysicsComponent,
  RenderComponent,
  StateComponent,
  StatsComponent,
  TransformComponent,
  WeaponComponent,
} from '@ecs/components';
import { RenderLayerIdentifier } from '@ecs/constants/renderLayerPriority';
import { WeaponMap } from '@ecs/constants/resources/weapon/weaponList';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';
import { SpriteSheetLoader } from '@ecs/utils/SpriteSheetLoader';
import { Point } from '@ecs/utils/types';

interface PlayerProps {
  id?: string;
  position?: Point;
  speed?: number;
  color?: { r: number; g: number; b: number; a: number };
  size?: [number, number];
  shape?: 'circle' | 'rect' | 'triangle';
}

/**
 * Factory function to create a Player entity
 * This is a game-specific entity that uses the ECS engine
 */
export function createPlayerEntity(
  world: World,
  {
    id = 'player',
    position = [400, 300],
    speed = 5,
    color = { r: 0, g: 255, b: 0, a: 1 },
    size = [32, 32], // Updated to match sprite frame size
  }: PlayerProps,
) {
  const player = new Entity(id, 'player');

  // Load sprite sheet
  const loader = SpriteSheetLoader.getInstance();
  const spriteSheet = loader.getSpriteSheet('knight');
  if (!spriteSheet) {
    throw new Error('Knight sprite sheet not loaded');
  }

  // Basic components
  player.addComponent(world.createComponent(InputComponent, {}));
  player.addComponent(
    world.createComponent(TransformComponent, {
      position,
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
  player.addComponent(world.createComponent(AnimationComponent, spriteSheet));

  // Game-specific components
  player.addComponent(
    world.createComponent(HealthComponent, {
      maxHealth: 100,
    }),
  );

  player.addComponent(
    world.createComponent(PhysicsComponent, {
      velocity: [0, 0],
      maxSpeed: speed,
      friction: 0.85,
    }),
  );

  const weapons = [
    // WeaponMap.SpiralOrb,
    // WeaponMap.Aura,
    // WeaponMap.RapidFire,
    // WeaponMap.SpiralShot,
    WeaponMap.Bomb,
    // WeaponMap.Laser,
  ];

  player.addComponent(
    world.createComponent(WeaponComponent, {
      id: 'initial-weapon',
      weapons,
      currentWeaponIndex: 0,
      attackCooldown: 200,
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
    world.createComponent(StateComponent, {
      isHit: false,
      hitRemainingFrames: 0,
      isDazed: false,
      dazeRemainingFrames: 0,
    }),
  );

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
