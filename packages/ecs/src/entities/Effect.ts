import {
  AnimationComponent,
  LifecycleComponent,
  RenderComponent,
  ShapeComponent,
  TransformComponent,
} from '@ecs/components';
import { createShapeDescriptor } from '@ecs/components/physics/shape/factory';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';
import { Point } from '@ecs/types/types';
import { RenderLayerIdentifier } from '@render/constant';

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

  // Create animation component and set the animation
  const animationComponent = world.createComponent(
    AnimationComponent,
    'explosion_effect',
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
    world.createComponent(ShapeComponent, {
      descriptor: createShapeDescriptor('rect', {
        width: finalProps.size[0],
        height: finalProps.size[1],
      }),
      tessellated: [],
      bounds: {
        min: [0, 0],
        max: [finalProps.size[0], finalProps.size[1]],
      },
    }),
  );

  effect.addComponent(
    world.createComponent(RenderComponent, {
      color: finalProps.color,
      layer: RenderLayerIdentifier.ENTITY,
    }),
  );

  effect.addComponent(world.createComponent(LifecycleComponent, finalProps.duration));

  return effect;
}
