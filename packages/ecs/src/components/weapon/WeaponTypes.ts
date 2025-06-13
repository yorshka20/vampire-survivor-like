import { Color } from '@ecs/utils/types';

export enum WeaponType {
  RANGED_AUTO_AIM = 'RANGED_AUTO_AIM',
  RANGED_FIXED = 'RANGED_FIXED',
  MELEE = 'MELEE',
  AREA = 'AREA',
  SPIRAL = 'SPIRAL',
}

export interface BaseWeapon {
  name: string;
  damage: number;
  attackSpeed: number;
  type: WeaponType;
  range: number;
  penetration?: number;
  criticalChance?: number;
  criticalMultiplier?: number;
}

export interface RangedWeapon extends BaseWeapon {
  type: WeaponType.RANGED_AUTO_AIM | WeaponType.RANGED_FIXED | WeaponType.SPIRAL;
  projectileSpeed: number;
  projectileSize: [number, number];
  projectileColor: Color;
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
  projectileSpeed: number;
  projectileSize: [number, number];
  projectileColor: Color;
  penetration?: number;
  spiralSpeed: number; // Rotation speed in radians per second
  spiralRadius: number; // Initial radius of the spiral
  spiralExpansion: number; // How fast the spiral expands outward
  projectileCount: number; // Number of projectiles to spawn around the player
  projectileLifetime: number; // Lifetime of the projectile in milliseconds
}

export type Weapon = RangedWeapon | MeleeWeapon | AreaWeapon | SpiralWeapon;
