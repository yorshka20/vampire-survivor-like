import {
  AIComponent,
  AnimationComponent,
  ColliderComponent,
  HealthComponent,
  PhysicsComponent,
  RenderComponent,
  SoundEffectComponent,
  StateComponent,
  TransformComponent,
} from '@ecs/components';
import { RenderLayerIdentifier } from '@ecs/constants/renderLayerPriority';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';
import { SpriteSheetLoader } from '@ecs/utils/SpriteSheetLoader';
import { Color, Point } from '@ecs/utils/types';
import { randomRgb } from './utils/rgb';

export interface EnemyProps {
  position: Point;
  size?: [number, number];
  health?: number;
  playerId: string;
  speed?: number;
  color?: Color;
  // Which sprite sheet to use for this enemy's animation
  spriteSheetName?: string; // default: 'slime_green'
}

export function createEnemyEntity(world: World, props: EnemyProps): Entity {
  const enemy = world.createEntity('enemy');

  // Determine sprite sheet to use (default slime)
  const spriteSheetName = props.spriteSheetName ?? 'slime_green';

  // Get sprite sheet from loader
  const spriteLoader = SpriteSheetLoader.getInstance();
  const spriteSheet = spriteLoader.getSpriteSheet(spriteSheetName);
  if (!spriteSheet) {
    throw new Error(`${spriteSheetName} sprite sheet not loaded`);
  }

  // Use sprite sheet frame dimensions for consistent sizing
  const spriteFrameSize: [number, number] = [spriteSheet.frameWidth, spriteSheet.frameHeight];
  const enemySize = props.size ?? spriteFrameSize;

  // Add components
  enemy.addComponent(
    world.createComponent(TransformComponent, {
      position: props.position,
    }),
  );

  enemy.addComponent(
    world.createComponent(PhysicsComponent, {
      velocity: [0, 0],
      maxSpeed: props.speed ?? 2,
    }),
  );

  enemy.addComponent(
    world.createComponent(RenderComponent, {
      shape: 'pattern',
      patternType: 'enemy',
      size: enemySize, // Use calculated enemy size
      color: props.color ?? randomRgb(1),
      visible: true,
      layer: RenderLayerIdentifier.ENTITY,
    }),
  );

  // Add animation component
  enemy.addComponent(world.createComponent(AnimationComponent, spriteSheetName));

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
      type: 'rect',
      size: enemySize, // Use same size as render component for consistency
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

  // Add state component with enemyType = normal by default
  enemy.addComponent(
    world.createComponent(StateComponent, {
      isDazed: false,
      dazeRemainingFrames: 0,
      isHit: false,
      hitRemainingFrames: 0,
      enemyType: 'normal',
    }),
  );

  return enemy;
}

/**
 * Create an elite enemy that uses the orc sprite sheet and is larger/stronger.
 */
export function createEliteEnemyEntity(
  world: World,
  props: Omit<EnemyProps, 'spriteSheetName'>,
): Entity {
  const spriteLoader = SpriteSheetLoader.getInstance();
  const orcSheet = spriteLoader.getSpriteSheet('orc');
  if (!orcSheet) {
    throw new Error('orc sprite sheet not loaded');
  }

  // Elite enemies are larger than normal ones; base on frame dimensions
  const baseSize: [number, number] = [orcSheet.frameWidth, orcSheet.frameHeight];
  const eliteSize: [number, number] = props.size ?? [baseSize[0] * 1.5, baseSize[1] * 1.5];

  const enemy = createEnemyEntity(world, {
    ...props,
    // Health will be set by caller (e.g., spawn system) to huge amount
    size: eliteSize,
    spriteSheetName: 'orc',
  });

  // Mark as elite via StateComponent
  const state = enemy.getComponent<StateComponent>(StateComponent.componentName);
  if (state) state.setEnemyType('elite');

  return enemy;
}
