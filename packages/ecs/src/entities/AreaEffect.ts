import {
  ColliderComponent,
  DamageComponent,
  MovementComponent,
  RenderComponent,
} from '@ecs/components';
import { RenderLayerIdentifier } from '@ecs/constants/renderLayerPriority';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';
import { Color } from '@ecs/utils/types';
import { randomRgb } from './utils/rgb';

export interface AreaEffectProps {
  position: { x: number; y: number };
  radius: number;
  duration: number;
  tickRate: number;
  damage: number;
  source: string;
  color?: Color;
}

export function createAreaEffectEntity(world: World, props: AreaEffectProps): Entity {
  const effect = world.createEntity('areaEffect');

  // Add components
  effect.addComponent(
    world.createComponent(MovementComponent, {
      position: { x: props.position.x, y: props.position.y },
      speed: 0,
    }),
  );

  effect.addComponent(
    world.createComponent(ColliderComponent, {
      type: 'circle',
      size: [props.radius * 2, props.radius * 2],
      isTrigger: true,
    }),
  );

  effect.addComponent(
    world.createComponent(RenderComponent, {
      shape: 'circle',
      color: props.color ?? randomRgb(0.3),
      size: [props.radius * 2, props.radius * 2],
      layer: RenderLayerIdentifier.BACKGROUND,
    }),
  );

  effect.addComponent(
    world.createComponent(DamageComponent, {
      damage: props.damage,
      source: props.source,
      penetration: -1, // Infinite penetration for area effects
      tickRate: props.tickRate,
      duration: props.duration,
    }),
  );

  return effect;
}
