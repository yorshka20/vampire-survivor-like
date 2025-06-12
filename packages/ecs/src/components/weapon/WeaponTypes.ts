import { Color } from '@ecs/utils/types';

export enum WeaponType {
  RANGED_AUTO_AIM = 'RANGED_AUTO_AIM',
  RANGED_FIXED = 'RANGED_FIXED',
  MELEE = 'MELEE',
  AREA = 'AREA',
  SPIRAL = 'SPIRAL',
}

interface BaseWeapon {
  name: string;
  type: WeaponType;
  damage: number;
  attackSpeed: number; // attacks per second
  range: number;
  projectileSpeed?: number;
  projectileSize?: [number, number];
  projectileColor?: Color;
  criticalChance?: number; // Chance of critical hit (0-1)
  criticalMultiplier?: number; // Damage multiplier for critical hits
}

export interface RangedWeapon extends BaseWeapon {
  type: WeaponType.RANGED_AUTO_AIM | WeaponType.RANGED_FIXED;
  projectileSpeed: number;
  projectileSize: [number, number];
  projectileColor: Color;
  penetration?: number;
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

export interface SpiralWeapon extends BaseWeapon {
  type: WeaponType.SPIRAL;
  followPlayer?: boolean;
  projectileSpeed: number;
  projectileSize: [number, number];
  projectileColor: Color;
  spiralSpeed: number; // Rotation speed in radians per second
  spiralRadius: number; // Initial radius of the spiral
  spiralExpansion: number; // How fast the spiral expands outward
  projectileCount: number; // Number of projectiles to spawn around the player
  projectileLifetime: number; // Lifetime of the projectile in milliseconds
}

export type Weapon = RangedWeapon | MeleeWeapon | AreaWeapon | SpiralWeapon;
