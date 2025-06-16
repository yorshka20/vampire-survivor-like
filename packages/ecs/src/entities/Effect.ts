import { LifecycleComponent, RenderComponent, TransformComponent } from '@ecs/components';
import { RenderLayerIdentifier } from '@ecs/constants/renderLayerPriority';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';
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

  // Add components
  effect.addComponent(
    world.createComponent(TransformComponent, {
      position: finalProps.position,
    }),
  );

  effect.addComponent(
    world.createComponent(RenderComponent, {
      color: finalProps.color,
      size: finalProps.size,
      shape: 'circle',
      layer: RenderLayerIdentifier.BACKGROUND,
    }),
  );

  effect.addComponent(world.createComponent(LifecycleComponent, finalProps.duration));

  return effect;
}
