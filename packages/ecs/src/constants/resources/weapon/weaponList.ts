import {
  AreaWeapon,
  MeleeWeapon,
  RangedWeapon,
  Weapon,
  WeaponType,
} from '@ecs/components/weapon/WeaponTypes';

const RapidFire: RangedWeapon = {
  name: 'Rapid Fire',
  damage: 5,
  attackSpeed: 5,
  projectileSpeed: 10,
  projectileSize: [6, 6],
  projectileColor: { r: 255, g: 255, b: 0, a: 1 },
  type: WeaponType.RANGED_AUTO_AIM,
  range: 400,
};

const HeavyShot: RangedWeapon = {
  name: 'Heavy Shot',
  damage: 20,
  attackSpeed: 1,
  projectileSpeed: 6,
  projectileSize: [15, 15],
  projectileColor: { r: 255, g: 100, b: 0, a: 1 },
  type: WeaponType.RANGED_FIXED,
  range: 400,
};

const PiercingShot: RangedWeapon = {
  name: 'Piercing Shot',
  damage: 10,
  attackSpeed: 2,
  projectileSpeed: 12,
  projectileSize: [8, 8],
  projectileColor: { r: 0, g: 255, b: 255, a: 1 },
  type: WeaponType.RANGED_FIXED,
  penetration: 10,
  range: 400,
};

const AutoAim: RangedWeapon = {
  name: 'Auto Aim',
  damage: 10,
  attackSpeed: 2,
  projectileSpeed: 8,
  projectileSize: [8, 8],
  projectileColor: { r: 255, g: 255, b: 0, a: 1 },
  type: WeaponType.RANGED_AUTO_AIM,
  range: 400,
};

const Aura: AreaWeapon = {
  name: 'Area',
  damage: 10,
  attackSpeed: 1, // 2 shots per second
  color: { r: 255, g: 255, b: 0, a: 1 },
  range: 400,
  radius: Math.random() * 100 + 40,
  duration: 1000 * 5,
  tickRate: 100,
  type: WeaponType.AREA,
};

const Melee: MeleeWeapon = {
  name: 'Melee',
  damage: 10,
  attackSpeed: 1,
  swingAngle: 45,
  swingDuration: 100,
  type: WeaponType.MELEE,
  range: 400,
};

export const WeaponList: Weapon[] = [RapidFire, HeavyShot, PiercingShot, AutoAim, Aura, Melee];

export const WeaponMap: Record<string, Weapon> = {
  RapidFire,
  HeavyShot,
  PiercingShot,
  AutoAim,
  Aura,
  Melee,
};
