import { Color } from '@ecs/utils/types';

export enum WeaponType {
  RANGED_AUTO_AIM = 'RANGED_AUTO_AIM',
  RANGED_FIXED = 'RANGED_FIXED',
  MELEE = 'MELEE',
  AREA = 'AREA',
  SPIRAL = 'SPIRAL',
  SPINNING = 'SPINNING',
  BOMB = 'BOMB',
  LASER = 'LASER',
}

export interface BaseWeapon {
  name: string;
  damage: number;
  attackSpeed: number;
  attackCooldown?: number;
  type: WeaponType;
  range: number;
  penetration?: number;
  criticalChance?: number;
  criticalMultiplier?: number;
  // Child weapon properties
  childWeapon?: Weapon;
  childWeaponAttackCooldown?: number;
}

export interface RangedWeapon extends BaseWeapon {
  type:
    | WeaponType.RANGED_AUTO_AIM
    | WeaponType.RANGED_FIXED
    | WeaponType.SPIRAL
    | WeaponType.SPINNING
    | WeaponType.BOMB;
  maxProjectileCount?: number;
  projectileSpeed: number;
  projectileSize: [number, number];
  projectileColor: Color;
  projectileCount: number;
  projectileLifetime: number;
  fixedAngle?: number; // Angle in degrees for fixed direction weapons
}

export interface MeleeWeapon extends BaseWeapon {
  type: WeaponType.MELEE;
  swingAngle: number; // Attack angle range in degrees
  swingDuration: number; // Attack animation duration in milliseconds
}

export interface AreaWeapon extends BaseWeapon {
  type: WeaponType.AREA;
  radius: number; // Effect radius
  duration: number; // Effect duration in milliseconds
  tickRate: number; // Damage tick frequency in milliseconds
  color: Color;
}

export interface SpiralWeapon extends RangedWeapon {
  type: WeaponType.SPIRAL;
  followPlayer?: boolean;
  spiralSpeed: number; // Rotation speed in degree per second
  spiralRadius: number; // Initial radius of the spiral
  spiralExpansion: number; // How fast the spiral expands outward
  initialAngle?: number; // Initial angle for spiral movement
}

export interface SpinningWeapon extends RangedWeapon {
  type: WeaponType.SPINNING;
  spinSpeed: number; // Rotation speed in degree per second
  spinRadius: number; // Initial radius of the spin
  spinCount: number;
  spinLifetime: number;
  followPlayer?: boolean;
}

export interface BombWeapon extends RangedWeapon {
  type: WeaponType.BOMB;
  explosionRadius: number; // Radius of the explosion effect
  explosionDuration: number; // Duration of the explosion effect in milliseconds
  explosionColor: Color; // Color of the explosion effect
}

export interface LaserWeapon extends BaseWeapon {
  type: WeaponType.LASER;
  color: Color;
  laserLength: number; // Length of the laser
  laserWidth: number; // Width of the laser
}

export type Weapon =
  | RangedWeapon
  | MeleeWeapon
  | AreaWeapon
  | SpiralWeapon
  | SpinningWeapon
  | BombWeapon
  | LaserWeapon;
