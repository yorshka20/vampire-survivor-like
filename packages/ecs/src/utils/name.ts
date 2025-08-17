import { WeaponType } from '@ecs/components/weapon/WeaponTypes';
import { type EntityType } from '@ecs/core/ecs/types';

export function generateEntityId(type: EntityType): string {
  // get the milliseconds from Date.now()
  const milliseconds = Date.now().toString().slice(-4);
  const random = Math.random().toString().slice(2, 9);
  // merge two number
  return `${type}-${milliseconds}${random}`;
}

export function generateWeaponId(weaponType: WeaponType): string {
  return `${weaponType}-${Date.now().toString().slice(-4)}`;
}

/**
 * Generate a numeric key for a pair of entities using their numericId
 * This is much faster than string operations and Set lookups
 * Ensures order independence (A,B == B,A)
 */
export function getNumericPairKey(id1: number, id2: number): number {
  const a = Math.min(id1, id2);
  const b = Math.max(id1, id2);
  return (a << 20) | b;
}
