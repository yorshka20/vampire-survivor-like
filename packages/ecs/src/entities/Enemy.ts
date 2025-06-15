import {
  AIComponent,
  AnimationComponent,
  ColliderComponent,
  HealthComponent,
  MovementComponent,
  RenderComponent,
  SoundEffectComponent,
  StateComponent,
  VelocityComponent,
} from '@ecs/components';
import { RenderLayerIdentifier } from '@ecs/constants/renderLayerPriority';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';
import { SpriteSheetLoader } from '@ecs/utils/SpriteSheetLoader';
import { Color } from '@ecs/utils/types';
import { randomRgb } from './utils/rgb';

export interface EnemyProps {
  position: { x: number; y: number };
  size?: [number, number];
  health?: number;
  playerId: string;
  speed?: number;
  color?: Color;
}

export function createEnemyEntity(world: World, props: EnemyProps): Entity {
  const enemy = world.createEntity('enemy');

  // Get sprite sheet from loader
  const spriteLoader = SpriteSheetLoader.getInstance();
  const spriteSheet = spriteLoader.getSpriteSheet('slime_green');
  if (!spriteSheet) {
    throw new Error('Slime sprite sheet not loaded');
  }

  // Add components
  enemy.addComponent(
    world.createComponent(MovementComponent, {
      position: { x: props.position.x, y: props.position.y },
      speed: props.speed ?? 2,
    }),
  );

  enemy.addComponent(
    world.createComponent(VelocityComponent, {
      velocity: { x: 0, y: 0 },
      maxSpeed: props.speed ?? 2,
    }),
  );

  enemy.addComponent(
    world.createComponent(RenderComponent, {
      shape: 'pattern',
      patternType: 'enemy',
      size: props.size ?? [30, 30],
      color: props.color ?? randomRgb(1),
      visible: true,
      layer: RenderLayerIdentifier.ENTITY,
    }),
  );

  // Add animation component
  enemy.addComponent(world.createComponent(AnimationComponent, spriteSheet));

  enemy.addComponent(
    world.createComponent(HealthComponent, {
      maxHealth: props.health ?? 100,
      currentHealth: props.health ?? 100,
    }),
  );

  enemy.addComponent(
    world.createComponent(AIComponent, {
      behavior: 'chase',
      targetEntityId: props.playerId,
      speed: props.speed ?? 2,
    }),
  );

  enemy.addComponent(
    world.createComponent(ColliderComponent, {
      type: 'circle',
      size: props.size ?? [30, 30],
      offset: [0, 0],
    }),
  );

  // Add sound effects
  enemy.addComponent(
    world.createComponent(SoundEffectComponent, {
      hitSound: 'hit',
      deathSound: 'death',
    }),
  );

  // Add state component
  enemy.addComponent(
    world.createComponent(StateComponent, {
      isDazed: false,
      dazeRemainingFrames: 0,
      isHit: false,
      hitRemainingFrames: 0,
    }),
  );

  return enemy;
}
