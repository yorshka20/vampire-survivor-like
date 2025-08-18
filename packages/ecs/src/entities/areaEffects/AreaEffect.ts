import {
  ColliderComponent,
  createShapeDescriptor,
  DamageComponent,
  LifecycleComponent,
  RenderComponent,
  ShapeComponent,
  ShapeName,
  TransformComponent,
  Weapon,
} from '@ecs/components';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';
import { Color, Point, randomRgb } from '@ecs/utils';
import { RenderLayerIdentifier } from '@render/constant';

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
    duration: number;
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

  const colliderComponent = world.createComponent(ColliderComponent, {
    type: props.type === 'laser' ? 'laser' : 'circle',
    size,
    isTrigger: true,
    laser: props.type === 'laser' ? props.laser : undefined,
  }) as ColliderComponent;

  effect.addComponent(colliderComponent);

  // Update laser direction cache with actual position for better performance
  if (props.type === 'laser' && props.laser) {
    colliderComponent.updateLaserDirection(props.position);
  }

  const shape = props.type === 'laser' ? 'line' : 'circle';

  effect.addComponent(
    world.createComponent(ShapeComponent, {
      descriptor: createShapeDescriptor(shape as ShapeName, {
        size,
      }),
    }),
  );

  effect.addComponent(
    world.createComponent(RenderComponent, {
      color: props.color ?? randomRgb(0.3),
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
      duration:
        props.type === 'laser' ? (props.laser?.duration ?? 200) : (props.area?.duration ?? 400),
      laser: props.laser,
      weapon: props.weapon,
    }),
  );

  effect.addComponent(
    world.createComponent(
      LifecycleComponent,
      props.type === 'laser' ? (props.laser?.duration ?? 200) : (props.area?.duration ?? 400),
    ),
  );

  return effect;
}
