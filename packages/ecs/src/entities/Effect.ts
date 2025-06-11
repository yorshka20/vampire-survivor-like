import { MovementComponent, RenderComponent } from '@ecs/components';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';

export interface EffectProps {
  position: { x: number; y: number };
  size: [number, number];
  color: { r: number; g: number; b: number; a: number };
  type: 'explosion' | 'heal' | 'buff';
  duration: number;
}

export function createEffectEntity(world: World, props?: Partial<EffectProps>): Entity {
  const effect = world.createEntity('effect');

  // Set default values
  const defaultProps: EffectProps = {
    position: { x: 0, y: 0 },
    size: [30, 30],
    color: { r: 255, g: 255, b: 0, a: 1 },
    type: 'explosion',
    duration: 500,
  };

  const finalProps = { ...defaultProps, ...props };

  // Add components
  effect.addComponent(
    world.createComponent(MovementComponent, {
      position: { x: finalProps.position.x, y: finalProps.position.y },
      speed: 0,
    }),
  );

  effect.addComponent(
    world.createComponent(RenderComponent, {
      color: finalProps.color,
      size: finalProps.size,
      shape: 'circle',
    }),
  );

  return effect;
}
