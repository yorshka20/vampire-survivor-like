import {
  ColliderComponent,
  createShapeDescriptor,
  RenderComponent,
  ShapeComponent,
  TransformComponent,
  WeaponComponent,
} from '@ecs/components';
import {
  AreaWeapon,
  BombWeapon,
  LaserBurstWeapon,
  LaserWeapon,
  MeleeWeapon,
  RangedWeapon,
  SpinningWeapon,
  SpiralWeapon,
  WeaponType,
} from '@ecs/components/weapon/WeaponTypes';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';
import { Point } from '@ecs/utils/types';
import { randomRgb } from '../utils/rgb';
import { createWeapon, getDefaultWeaponProperties } from './WeaponFactory';

export interface WeaponProps {
  position: Point;
  size: [number, number];
  ownerId: string;
  weaponType: WeaponType;
  // Common properties
  damage: number;
  attackSpeed: number;
  range: number;
  attackCooldown?: number;
  // Ranged weapon properties
  rangedWeapon?: RangedWeapon;
  // Melee weapon properties
  meleeWeapon?: MeleeWeapon;
  // Area weapon properties
  areaWeapon?: AreaWeapon;
  // Spiral weapon properties
  spiralWeapon?: SpiralWeapon;
  // Spinning weapon properties
  spinningWeapon?: SpinningWeapon;
  // Laser weapon properties
  laserWeapon?: LaserWeapon;
  // Bomb weapon properties
  bombWeapon?: BombWeapon;
  // Laser burst weapon properties
  laserBurstWeapon?: LaserBurstWeapon;
}

// todo: consider if we need this component

/**
 * Creates a weapon entity using the factory pattern
 */
export function createWeaponEntity(world: World, props?: Partial<WeaponProps>): Entity {
  const weapon = world.createEntity('weapon');

  // Set default values
  const defaultProps: WeaponProps = {
    position: [0, 0],
    size: [20, 20],
    ownerId: '',
    weaponType: WeaponType.RANGED_AUTO_AIM,
    damage: 10,
    attackSpeed: 2,
    range: 400,
    attackCooldown: 200,
  };

  const finalProps = { ...defaultProps, ...props };

  // Create weapon using factory
  const weaponDefaults = getDefaultWeaponProperties(randomRgb(1));
  const weaponData = createWeapon(finalProps, weaponDefaults);

  // Add components
  weapon.addComponent(
    world.createComponent(TransformComponent, {
      position: finalProps.position,
    }),
  );

  weapon.addComponent(
    world.createComponent(ColliderComponent, {
      type: 'circle',
      size: finalProps.size,
    }),
  );

  weapon.addComponent(
    world.createComponent(ShapeComponent, {
      descriptor: createShapeDescriptor('circle', {
        radius: finalProps.size[0] / 2,
      }),
    }),
  );

  weapon.addComponent(
    world.createComponent(RenderComponent, {
      color: { r: 128, g: 128, b: 128, a: 1 },
    }),
  );

  weapon.addComponent(
    world.createComponent(WeaponComponent, {
      id: weaponData.id,
      weapons: [weaponData],
      currentWeaponId: weaponData.id,
      attackCooldown: finalProps.attackCooldown,
    }),
  );

  return weapon;
}
