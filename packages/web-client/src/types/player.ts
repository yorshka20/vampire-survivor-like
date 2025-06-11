import { Entity } from '@brotov2/ecs/src/core/ecs/Entity';

export interface PlayerStats {
  damageMultiplier: number;
  attackSpeedMultiplier: number;
  moveSpeedMultiplier: number;
  maxHealthMultiplier: number;
  pickupRangeMultiplier: number;
  expGainMultiplier: number;
}

export interface PlayerHealth {
  currentHealth: number;
  maxHealth: number;
}

export interface PlayerExperience {
  level: number;
  currentExp: number;
  expToNextLevel: number;
}

export interface PlayerWeapon {
  name: string;
  damage: number;
  attackSpeed: number;
  projectileSpeed: number;
  projectileSize: [number, number];
  projectileColor?: { r: number; g: number; b: number; a: number };
  range?: number;
}

export interface Player extends Entity {
  getComponent<T>(componentName: string): T;
}
