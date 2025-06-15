import {
  AnimationComponent,
  ColliderComponent,
  ExperienceComponent,
  HealthComponent,
  InputComponent,
  MovementComponent,
  RenderComponent,
  StateComponent,
  StatsComponent,
  VelocityComponent,
  WeaponComponent,
} from '@ecs/components';
import { RenderLayerIdentifier } from '@ecs/constants/renderLayerPriority';
import { WeaponMap } from '@ecs/constants/resources/weapon/weaponList';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';
import { AnimationData } from '@ecs/types/animation';
import { SpriteSheetLoader } from '@ecs/utils/SpriteSheetLoader';

interface PlayerProps {
  id?: string;
  position?: { x: number; y: number };
  speed?: number;
  color?: { r: number; g: number; b: number; a: number };
  size?: [number, number];
  shape?: 'circle' | 'rect' | 'triangle';
}

// Define player animations
const playerAnimations = new Map<string, AnimationData>([
  [
    'idle',
    {
      frames: [0, 1, 2, 3], // Idle animation frames
      frameDuration: 0.2, // 0.2 seconds per frame
      loop: true,
    },
  ],
  [
    'walk',
    {
      frames: [4, 5, 6, 7], // Walking animation frames
      frameDuration: 0.15, // 0.15 seconds per frame
      loop: true,
    },
  ],
]);

/**
 * Factory function to create a Player entity
 */
export async function createPlayerEntity(
  world: World,
  {
    id = 'player',
    position = { x: 400, y: 300 },
    speed = 5,
    color = { r: 0, g: 255, b: 0, a: 1 },
    size = [32, 32], // Updated to match sprite frame size
  }: PlayerProps,
) {
  const player = new Entity(id, 'player');

  // Load sprite sheet
  const loader = SpriteSheetLoader.getInstance();
  const spriteSheet = await loader.loadSpriteSheet(
    'knight',
    '/assets/sprites/knight.png',
    32, // frameWidth
    32, // frameHeight
    playerAnimations,
  );

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
  player.addComponent(world.createComponent(AnimationComponent, spriteSheet));

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
    // WeaponMap.SpiralOrb,
    // WeaponMap.Aura,
    // WeaponMap.RapidFire,
    // WeaponMap.SpiralShot,
    WeaponMap.Bomb,
  ];

  player.addComponent(
    world.createComponent(WeaponComponent, {
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
