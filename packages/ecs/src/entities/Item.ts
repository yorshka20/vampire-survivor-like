import {
  createShapeDescriptor,
  PhysicsComponent,
  PickupComponent,
  PickupType,
  RenderComponent,
  RenderPatternType,
  ShapeComponent,
  TransformComponent,
} from '@ecs/components';
import { Weapon } from '@ecs/components/weapon/WeaponTypes';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';
import { Point } from '@ecs/utils/types';
import { RenderLayerIdentifier } from '@render/constant';

export interface ItemProps {
  position: Point;
  size: [number, number];
  color: { r: number; g: number; b: number; a: number };
  type: PickupType;
  value: number;
  pullable?: boolean;
  weapon?: Weapon[];
  powerup?: {
    stat: 'damage' | 'attackSpeed' | 'moveSpeed' | 'maxHealth';
    multiplier: number;
  };
}

// Set default values
const defaultProps: ItemProps = {
  position: [0, 0],
  size: [15, 15],
  color: { r: 0, g: 255, b: 255, a: 1 },
  type: 'experience',
  value: 10,
  pullable: false,
};

export function createItemEntity(world: World, props?: Partial<ItemProps>): Entity {
  const item = world.createEntity('pickup');

  const finalProps = { ...defaultProps, ...props };

  // Add components
  item.addComponent(
    world.createComponent(PickupComponent, {
      type: finalProps.type,
      value: finalProps.value,
      magnetRange: 50,
      pullable: finalProps.pullable,
      weapon: finalProps.weapon?.[0],
      powerup: finalProps.powerup,
    }),
  );

  item.addComponent(
    world.createComponent(TransformComponent, {
      position: finalProps.position,
    }),
  );

  item.addComponent(
    world.createComponent(PhysicsComponent, {
      velocity: [0, 0],
      entityType: 'ITEM',
    }),
  );

  item.addComponent(
    world.createComponent(ShapeComponent, {
      descriptor: createShapeDescriptor('pattern', {
        patternType: getItemPatternType(finalProps.type),
        size: finalProps.size,
      }),
    }),
  );

  item.addComponent(
    world.createComponent(RenderComponent, {
      color: finalProps.color,
      visible: true,
      layer: RenderLayerIdentifier.ITEM,
    }),
  );
  return item;
}

function getItemPatternType(type: PickupType): RenderPatternType {
  switch (type) {
    case 'health':
      return 'heart';
    case 'weapon':
      return 'diamond';
    case 'experience':
      return 'exp';
    case 'powerup':
      return 'star';
    case 'globalPull':
      return 'star';
    case 'laserBurst':
      return 'burst';
    case 'magnet':
      return 'magnet';
    default:
      return 'diamond';
  }
}
