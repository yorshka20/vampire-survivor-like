import {
  AreaWeapon,
  BombWeapon,
  LaserBurstWeapon,
  LaserWeapon,
  MeleeWeapon,
  RangedWeapon,
  SpinningWeapon,
  SpiralWeapon,
  Weapon,
  WeaponType,
} from '@ecs/components/weapon/WeaponTypes';
import { RgbaColor } from '@ecs/utils/color';
import { WeaponProps } from './weapon';

/**
 * Default values for weapon properties
 */
export interface WeaponDefaults {
  color: RgbaColor;
  projectileSize: [number, number];
  projectileSpeed: number;
  projectileLifetime: number;
}

/**
 * Weapon properties interface for factory
 */
type WeaponFactoryProps = WeaponProps;

/**
 * Weapon factory configuration for creating different weapon types
 */
export interface WeaponFactoryConfig {
  name: string;
  createWeapon: (props: WeaponFactoryProps, defaults: WeaponDefaults) => Weapon;
}

/**
 * Creates a ranged weapon with common projectile properties
 */
function createRangedWeapon(
  props: WeaponFactoryProps,
  defaults: WeaponDefaults,
  type: WeaponType.RANGED_AUTO_AIM | WeaponType.RANGED_FIXED,
  name: string,
): RangedWeapon {
  return {
    name,
    type,
    damage: props.damage,
    attackSpeed: props.attackSpeed,
    range: props.range,
    projectileCount: props.rangedWeapon?.projectileCount ?? 1,
    projectileLifetime: props.rangedWeapon?.projectileLifetime ?? defaults.projectileLifetime,
    projectileSpeed: props.rangedWeapon?.projectileSpeed ?? defaults.projectileSpeed,
    projectileSize: props.rangedWeapon?.projectileSize ?? defaults.projectileSize,
    projectileColor: props.rangedWeapon?.projectileColor ?? defaults.color,
  };
}

/**
 * Weapon factory configuration map
 */
export const WEAPON_FACTORY_CONFIG: Record<WeaponType, WeaponFactoryConfig> = {
  [WeaponType.RANGED_AUTO_AIM]: {
    name: 'Auto Aim Weapon',
    createWeapon: (props, defaults) =>
      createRangedWeapon(props, defaults, WeaponType.RANGED_AUTO_AIM, 'Auto Aim Weapon'),
  },
  [WeaponType.RANGED_FIXED]: {
    name: 'Fixed Direction Weapon',
    createWeapon: (props, defaults) =>
      createRangedWeapon(props, defaults, WeaponType.RANGED_FIXED, 'Fixed Direction Weapon'),
  },
  [WeaponType.MELEE]: {
    name: 'Melee Weapon',
    createWeapon: (props, defaults): MeleeWeapon => ({
      name: 'Melee Weapon',
      type: WeaponType.MELEE,
      damage: props.damage,
      attackSpeed: props.attackSpeed,
      range: props.range,
      swingAngle: props.meleeWeapon?.swingAngle ?? 90,
      swingDuration: props.meleeWeapon?.swingDuration ?? 300,
    }),
  },
  [WeaponType.AREA]: {
    name: 'Area Weapon',
    createWeapon: (props, defaults): AreaWeapon => ({
      name: 'Area Weapon',
      type: WeaponType.AREA,
      damage: props.damage,
      attackSpeed: props.attackSpeed,
      range: props.range,
      radius: props.areaWeapon?.radius ?? 100,
      duration: props.areaWeapon?.duration ?? 5000,
      tickRate: props.areaWeapon?.tickRate ?? 1000,
      color: props.areaWeapon?.color ?? defaults.color,
    }),
  },
  [WeaponType.SPIRAL]: {
    name: 'Spiral Weapon',
    createWeapon: (props, defaults): SpiralWeapon => ({
      name: 'Spiral Weapon',
      type: WeaponType.SPIRAL,
      damage: props.damage,
      attackSpeed: props.attackSpeed,
      range: props.range,
      spiralSpeed: props.spiralWeapon?.spiralSpeed ?? 30,
      spiralRadius: props.spiralWeapon?.spiralRadius ?? 10,
      spiralExpansion: props.spiralWeapon?.spiralExpansion ?? 15,
      projectileSpeed: props.spiralWeapon?.projectileSpeed ?? defaults.projectileSpeed,
      projectileSize: props.spiralWeapon?.projectileSize ?? defaults.projectileSize,
      projectileColor: props.spiralWeapon?.projectileColor ?? defaults.color,
      projectileCount: props.spiralWeapon?.projectileCount ?? 1,
      projectileLifetime: props.spiralWeapon?.projectileLifetime ?? defaults.projectileLifetime,
    }),
  },
  [WeaponType.LASER]: {
    name: 'Laser Weapon',
    createWeapon: (props, defaults): LaserWeapon => ({
      name: 'Laser Weapon',
      type: WeaponType.LASER,
      damage: props.damage,
      attackSpeed: props.attackSpeed,
      range: props.range,
      laserLength: props.laserWeapon?.laserLength ?? 100,
      laserWidth: props.laserWeapon?.laserWidth ?? 10,
      color: props.laserWeapon?.color ?? defaults.color,
      laserDuration: props.laserWeapon?.laserDuration ?? 1000,
    }),
  },
  [WeaponType.SPINNING]: {
    name: 'Spinning Weapon',
    createWeapon: (props, defaults): SpinningWeapon => ({
      name: 'Spinning Weapon',
      type: WeaponType.SPINNING,
      damage: props.damage,
      attackSpeed: props.attackSpeed,
      range: props.range,
      spinCount: props.spinningWeapon?.spinCount ?? 1,
      spinRadius: props.spinningWeapon?.spinRadius ?? 10,
      spinSpeed: props.spinningWeapon?.spinSpeed ?? 10,
      spinLifetime: props.spinningWeapon?.spinLifetime ?? 1000,
      projectileSpeed: props.spinningWeapon?.projectileSpeed ?? defaults.projectileSpeed,
      projectileSize: props.spinningWeapon?.projectileSize ?? defaults.projectileSize,
      projectileColor: props.spinningWeapon?.projectileColor ?? defaults.color,
      projectileCount: props.spinningWeapon?.projectileCount ?? 1,
      projectileLifetime: props.spinningWeapon?.projectileLifetime ?? defaults.projectileLifetime,
    }),
  },
  [WeaponType.BOMB]: {
    name: 'Bomb Weapon',
    createWeapon: (props, defaults): BombWeapon => ({
      name: 'Bomb Weapon',
      type: WeaponType.BOMB,
      damage: props.damage,
      attackSpeed: props.attackSpeed,
      range: props.range,
      projectileSpeed: props.rangedWeapon?.projectileSpeed ?? defaults.projectileSpeed,
      projectileSize: props.rangedWeapon?.projectileSize ?? defaults.projectileSize,
      projectileColor: props.rangedWeapon?.projectileColor ?? defaults.color,
      projectileCount: props.rangedWeapon?.projectileCount ?? 1,
      projectileLifetime: props.rangedWeapon?.projectileLifetime ?? defaults.projectileLifetime,
      explosionRadius: 100,
      explosionDuration: 100,
      explosionColor: { r: 255, g: 255, b: 200, a: 0.2 },
    }),
  },
  [WeaponType.LASER_BURST]: {
    name: 'Laser Burst Weapon',
    createWeapon: (props, defaults): LaserBurstWeapon => ({
      name: 'Laser Burst Weapon',
      type: WeaponType.LASER_BURST,
      damage: props.damage,
      attackSpeed: props.attackSpeed,
      range: props.range,
      beamCount: 10,
      rotationSpeed: 0,
      color: props.laserWeapon?.color ?? defaults.color,
      laserLength: props.laserWeapon?.laserLength ?? 100,
      laserWidth: props.laserWeapon?.laserWidth ?? 10,
      laserDuration: props.laserWeapon?.laserDuration ?? 1000,
    }),
  },
};

/**
 * Creates a weapon using the factory pattern
 * @param props Weapon properties
 * @param defaults Default weapon values
 * @returns Created weapon
 */
export function createWeapon(props: WeaponFactoryProps, defaults: WeaponDefaults): Weapon {
  const factoryConfig = WEAPON_FACTORY_CONFIG[props.weaponType];
  if (!factoryConfig) {
    throw new Error(`Unsupported weapon type: ${props.weaponType}`);
  }

  return factoryConfig.createWeapon(props, defaults);
}

/**
 * Gets the default weapon properties
 * @param color Random color for the weapon
 * @returns Default weapon properties
 */
export function getDefaultWeaponProperties(color: RgbaColor): WeaponDefaults {
  return {
    color,
    projectileSize: [8, 8],
    projectileSpeed: 10,
    projectileLifetime: 1000 * 3,
  };
}
