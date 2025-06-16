import {
  ColliderComponent,
  DamageComponent,
  LifecycleComponent,
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
    laserWidth: number;
    laserLength: number;
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
    props.type === 'laser'
      ? [props.laser?.laserWidth ?? 0, props.laser?.laserLength ?? 0]
      : [props.area?.radius ?? 0, props.area?.radius ?? 0];

  effect.addComponent(
    world.createComponent(ColliderComponent, {
      type: props.type === 'laser' ? 'laser' : 'circle',
      size,
      isTrigger: true,
      laser: props.type === 'laser' ? props.laser : undefined,
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
      duration: props.type === 'laser' ? 100 : (props.area?.duration ?? 400),
      laser: props.laser,
      weapon: props.weapon,
    }),
  );

  effect.addComponent(
    world.createComponent(
      LifecycleComponent,
      props.type === 'laser' ? 1000 : (props.area?.duration ?? 400),
    ),
  );

  return effect;
}
