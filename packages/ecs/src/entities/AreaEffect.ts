import {
  ColliderComponent,
  DamageComponent,
  RenderComponent,
  TransformComponent,
  Weapon,
} from '@ecs/components';
import { RenderLayerIdentifier } from '@ecs/constants/renderLayerPriority';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';
import { Color, Point } from '@ecs/utils/types';
import { randomRgb } from './utils/rgb';

export interface AreaEffectProps {
  position: Point;
  type: 'laser' | 'area';
  damage: number;
  source: string;
  color?: Color;
  weapon: Weapon;
  area?: {
    radius: number;
    duration: number;
    tickRate: number;
  };
  laser?: {
    aim: Point;
  };
}

export function createAreaEffectEntity(world: World, props: AreaEffectProps): Entity {
  const effect = world.createEntity('areaEffect');

  // Add components
  effect.addComponent(
    world.createComponent(TransformComponent, {
      position: props.position,
    }),
  );

  const size: [number, number] =
    props.type === 'laser' ? [10, 10] : [props.area?.radius ?? 0, props.area?.radius ?? 0];

  effect.addComponent(
    world.createComponent(ColliderComponent, {
      type: 'circle',
      size,
      isTrigger: true,
    }),
  );

  effect.addComponent(
    world.createComponent(RenderComponent, {
      shape: props.type === 'laser' ? 'line' : 'circle',
      color: props.color ?? randomRgb(0.3),
      size,
      laser: props.type === 'laser' ? props.laser : undefined,
      layer: RenderLayerIdentifier.BACKGROUND,
    }),
  );

  effect.addComponent(
    world.createComponent(DamageComponent, {
      damage: props.damage,
      source: props.source,
      penetration: -1, // Infinite penetration for area effects
      tickRate: props.area?.tickRate ?? 100,
      duration: props.area?.duration ?? 400,
      weapon: props.weapon,
      laser: props.laser,
    }),
  );

  return effect;
}
