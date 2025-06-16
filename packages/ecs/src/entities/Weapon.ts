import {
  ColliderComponent,
  RenderComponent,
  TransformComponent,
  WeaponComponent,
} from '@ecs/components';
import {
  AreaWeapon,
  MeleeWeapon,
  RangedWeapon,
  SpinningWeapon,
  SpiralWeapon,
  Weapon,
  WeaponType,
} from '@ecs/components/weapon/WeaponTypes';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';
import { Point } from '@ecs/utils/types';
import { randomRgb } from './utils/rgb';

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
}

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

  const color = randomRgb(1);
  const projectileSize: [number, number] = [8, 8];
  const projectileSpeed = 10;
  const projectileLifetime = 1000 * 3;

  // Create weapon based on type
  let weaponData = {} as Weapon;

  switch (finalProps.weaponType) {
    case WeaponType.RANGED_AUTO_AIM:
      weaponData = {
        name: 'Auto Aim Weapon',
        type: WeaponType.RANGED_AUTO_AIM,
        damage: finalProps.damage,
        attackSpeed: finalProps.attackSpeed,
        range: finalProps.range,
        projectileCount: finalProps.rangedWeapon?.projectileCount ?? 1,
        projectileLifetime: finalProps.rangedWeapon?.projectileLifetime ?? projectileLifetime,
        projectileSpeed: finalProps.rangedWeapon?.projectileSpeed ?? projectileSpeed,
        projectileSize: finalProps.rangedWeapon?.projectileSize ?? projectileSize,
        projectileColor: finalProps.rangedWeapon?.projectileColor ?? color,
      };
      break;
    case WeaponType.RANGED_FIXED:
      weaponData = {
        name: 'Fixed Direction Weapon',
        type: WeaponType.RANGED_FIXED,
        damage: finalProps.damage,
        attackSpeed: finalProps.attackSpeed,
        range: finalProps.range,
        projectileSpeed: finalProps.rangedWeapon?.projectileSpeed ?? projectileSpeed,
        projectileSize: finalProps.rangedWeapon?.projectileSize ?? projectileSize,
        projectileColor: finalProps.rangedWeapon?.projectileColor ?? color,
        projectileCount: finalProps.rangedWeapon?.projectileCount ?? 1,
        projectileLifetime: finalProps.rangedWeapon?.projectileLifetime ?? projectileLifetime,
      };
      break;
    case WeaponType.MELEE:
      weaponData = {
        name: 'Melee Weapon',
        type: WeaponType.MELEE,
        damage: finalProps.damage,
        attackSpeed: finalProps.attackSpeed,
        range: finalProps.range,
        swingAngle: finalProps.meleeWeapon?.swingAngle ?? 90,
        swingDuration: finalProps.meleeWeapon?.swingDuration ?? 300,
      };
      break;
    case WeaponType.AREA:
      weaponData = {
        name: 'Area Weapon',
        type: WeaponType.AREA,
        damage: finalProps.damage,
        attackSpeed: finalProps.attackSpeed,
        range: finalProps.range,
        radius: finalProps.areaWeapon?.radius ?? 100,
        duration: finalProps.areaWeapon?.duration ?? 5000,
        tickRate: finalProps.areaWeapon?.tickRate ?? 1000,
        color: finalProps.areaWeapon?.color ?? color,
      };
      break;
    case WeaponType.SPIRAL:
      weaponData = {
        name: 'Spiral Weapon',
        type: WeaponType.SPIRAL,
        damage: finalProps.damage,
        attackSpeed: finalProps.attackSpeed,
        range: finalProps.range,
        spiralSpeed: finalProps.spiralWeapon?.spiralSpeed ?? 30,
        spiralRadius: finalProps.spiralWeapon?.spiralRadius ?? 10,
        spiralExpansion: finalProps.spiralWeapon?.spiralExpansion ?? 15,
        projectileSpeed: finalProps.spiralWeapon?.projectileSpeed ?? projectileSpeed,
        projectileSize: finalProps.spiralWeapon?.projectileSize ?? projectileSize,
        projectileColor: finalProps.spiralWeapon?.projectileColor ?? color,
        projectileCount: finalProps.spiralWeapon?.projectileCount ?? 1,
        projectileLifetime: finalProps.spiralWeapon?.projectileLifetime ?? projectileLifetime,
      };
      break;
  }

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
    world.createComponent(RenderComponent, {
      color: { r: 128, g: 128, b: 128, a: 1 },
      size: finalProps.size,
      shape: 'circle',
    }),
  );

  weapon.addComponent(
    world.createComponent(WeaponComponent, {
      weapons: [weaponData],
      attackCooldown: finalProps.attackCooldown,
    }),
  );

  return weapon;
}
