import { Color } from '@ecs/utils/types';

export enum WeaponType {
  RANGED_AUTO_AIM = 'RANGED_AUTO_AIM',
  RANGED_FIXED = 'RANGED_FIXED',
  MELEE = 'MELEE',
  AREA = 'AREA',
  SPIRAL = 'SPIRAL',
  SPINNING = 'SPINNING',
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
}

export interface RangedWeapon extends BaseWeapon {
  type:
    | WeaponType.RANGED_AUTO_AIM
    | WeaponType.RANGED_FIXED
    | WeaponType.SPIRAL
    | WeaponType.SPINNING;
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
}

export interface SpinningWeapon extends RangedWeapon {
  type: WeaponType.SPINNING;
  spinSpeed: number; // Rotation speed in degree per second
  spinRadius: number; // Initial radius of the spin
  spinCount: number;
  spinLifetime: number;
  followPlayer?: boolean;
}

export type Weapon = RangedWeapon | MeleeWeapon | AreaWeapon | SpiralWeapon | SpinningWeapon;
