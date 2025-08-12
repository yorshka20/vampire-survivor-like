import {
  AnimationComponent,
  LifecycleComponent,
  RenderComponent,
  TransformComponent,
} from '@ecs/components';
import { RenderLayerIdentifier } from '@ecs/constants/renderLayerPriority';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';
import { SpriteSheetLoader } from '@ecs/utils/SpriteSheetLoader';
import { Point } from '@ecs/utils/types';

export interface EffectProps {
  position: Point;
  size: [number, number];
  color: { r: number; g: number; b: number; a: number };
  type: 'explosion' | 'heal' | 'buff' | 'laser';
  duration: number;
}

export function createEffectEntity(world: World, props?: Partial<EffectProps>): Entity {
  const effect = world.createEntity('effect');

  // Set default values
  const defaultProps: EffectProps = {
    position: [0, 0],
    size: [30, 30],
    color: { r: 255, g: 255, b: 0, a: 1 },
    type: 'explosion',
    duration: 500,
  };

  const finalProps = { ...defaultProps, ...props };

  const spriteLoader = SpriteSheetLoader.getInstance();
  const spriteSheet = spriteLoader.getSpriteSheet('explosion_effect');

  if (!spriteSheet) {
    throw new Error(`explosion_effect sprite sheet not loaded`);
  }

  // Create animation component and set the animation
  const animationComponent = world.createComponent(
    AnimationComponent,
    spriteSheet,
  ) as AnimationComponent;
  animationComponent.setAnimation('explosion_fire', true);
  effect.addComponent(animationComponent);

  // Add components
  effect.addComponent(
    world.createComponent(TransformComponent, {
      position: finalProps.position,
    }),
  );

  effect.addComponent(
    world.createComponent(RenderComponent, {
      shape: 'pattern',
      patternType: 'effect',
      color: finalProps.color,
      size: finalProps.size,
      layer: RenderLayerIdentifier.ENTITY,
    }),
  );

  effect.addComponent(world.createComponent(LifecycleComponent, finalProps.duration));

  return effect;
}
