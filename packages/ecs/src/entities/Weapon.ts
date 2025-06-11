import {
  ColliderComponent,
  MovementComponent,
  RenderComponent,
  WeaponComponent,
} from '@ecs/components';
import {
  AreaWeapon,
  MeleeWeapon,
  RangedWeapon,
  WeaponType,
} from '@ecs/components/weapon/WeaponTypes';
import { Entity } from '@ecs/core/ecs/Entity';
import { World } from '@ecs/core/ecs/World';

export interface WeaponProps {
  position: { x: number; y: number };
  size: [number, number];
  ownerId: string;
  weaponType: WeaponType;
  // Common properties
  damage: number;
  attackSpeed: number;
  range: number;
  // Ranged weapon properties
  projectileSpeed?: number;
  projectileSize?: [number, number];
  projectileColor?: { r: number; g: number; b: number; a: number };
  fixedAngle?: number;
  // Melee weapon properties
  swingAngle?: number;
  swingDuration?: number;
  // Area weapon properties
  radius?: number;
  duration?: number;
  tickRate?: number;
}

export function createWeaponEntity(world: World, props?: Partial<WeaponProps>): Entity {
  const weapon = world.createEntity('weapon');

  // Set default values
  const defaultProps: WeaponProps = {
    position: { x: 0, y: 0 },
    size: [20, 20],
    ownerId: '',
    weaponType: WeaponType.RANGED_AUTO_AIM,
    damage: 10,
    attackSpeed: 2,
    range: 400,
    projectileSpeed: 8,
    projectileSize: [8, 8],
    projectileColor: { r: 255, g: 255, b: 0, a: 1 },
  };

  const finalProps = { ...defaultProps, ...props };

  // Create weapon based on type
  let weaponData: RangedWeapon | MeleeWeapon | AreaWeapon;

  switch (finalProps.weaponType) {
    case WeaponType.RANGED_AUTO_AIM:
      weaponData = {
        name: 'Auto Aim Weapon',
        type: WeaponType.RANGED_AUTO_AIM,
        damage: finalProps.damage,
        attackSpeed: finalProps.attackSpeed,
        range: finalProps.range,
        projectileSpeed: finalProps.projectileSpeed!,
        projectileSize: finalProps.projectileSize!,
        projectileColor: finalProps.projectileColor!,
      };
      break;
    case WeaponType.RANGED_FIXED:
      weaponData = {
        name: 'Fixed Direction Weapon',
        type: WeaponType.RANGED_FIXED,
        damage: finalProps.damage,
        attackSpeed: finalProps.attackSpeed,
        range: finalProps.range,
        projectileSpeed: finalProps.projectileSpeed!,
        projectileSize: finalProps.projectileSize!,
        projectileColor: finalProps.projectileColor!,
        fixedAngle: finalProps.fixedAngle ?? 0,
      };
      break;
    case WeaponType.MELEE:
      weaponData = {
        name: 'Melee Weapon',
        type: WeaponType.MELEE,
        damage: finalProps.damage,
        attackSpeed: finalProps.attackSpeed,
        range: finalProps.range,
        swingAngle: finalProps.swingAngle ?? 90,
        swingDuration: finalProps.swingDuration ?? 300,
      };
      break;
    case WeaponType.AREA:
      weaponData = {
        name: 'Area Weapon',
        type: WeaponType.AREA,
        damage: finalProps.damage,
        attackSpeed: finalProps.attackSpeed,
        range: finalProps.range,
        radius: finalProps.radius ?? 100,
        duration: finalProps.duration ?? 5000,
        tickRate: finalProps.tickRate ?? 1000,
      };
      break;
  }

  // Add components
  weapon.addComponent(
    world.createComponent(MovementComponent, {
      position: { x: finalProps.position.x, y: finalProps.position.y },
      speed: 0,
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
    }),
  );

  return weapon;
}
