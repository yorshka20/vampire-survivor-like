import {
  AreaWeapon,
  MeleeWeapon,
  RangedWeapon,
  SpinningWeapon,
  SpiralWeapon,
  Weapon,
  WeaponType,
} from '@ecs/components/weapon/WeaponTypes';

const RapidFire: RangedWeapon = {
  name: 'Rapid Fire',
  damage: 5,
  attackSpeed: 5,
  attackCooldown: 100,
  projectileSpeed: 10,
  projectileSize: [6, 6],
  projectileColor: { r: 255, g: 255, b: 0, a: 1 },
  type: WeaponType.RANGED_AUTO_AIM,
  range: 400,
  projectileCount: 1,
  projectileLifetime: 1000 * 3,
};

const HeavyShot: RangedWeapon = {
  name: 'Heavy Shot',
  damage: 20,
  attackSpeed: 1,
  attackCooldown: 1000,
  projectileSpeed: 6,
  projectileSize: [15, 15],
  projectileColor: { r: 255, g: 100, b: 0, a: 1 },
  type: WeaponType.RANGED_FIXED,
  range: 400,
  projectileCount: 1,
  projectileLifetime: 1000 * 1,
};

const PiercingShot: RangedWeapon = {
  name: 'Piercing Shot',
  damage: 10,
  attackSpeed: 2,
  attackCooldown: 100,
  projectileSpeed: 12,
  projectileSize: [8, 8],
  projectileColor: { r: 0, g: 255, b: 255, a: 1 },
  type: WeaponType.RANGED_FIXED,
  penetration: 10,
  range: 400,
  projectileCount: 1,
  projectileLifetime: 1000 * 5,
};

const AutoAim: RangedWeapon = {
  name: 'Auto Aim',
  damage: 10,
  attackSpeed: 2,
  attackCooldown: 200,
  projectileSpeed: 8,
  projectileSize: [8, 8],
  projectileColor: { r: 255, g: 255, b: 0, a: 1 },
  type: WeaponType.RANGED_AUTO_AIM,
  range: 400,
  projectileCount: 1,
  projectileLifetime: 1000 * 3,
};

const Aura: AreaWeapon = {
  name: 'Area',
  damage: 10,
  attackSpeed: 1, // 2 shots per second
  attackCooldown: 1000,
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
  attackCooldown: 1000,
  swingAngle: 45,
  swingDuration: 100,
  type: WeaponType.MELEE,
  range: 400,
};

const SpiralShot: SpiralWeapon = {
  name: 'Spiral Shot',
  damage: 5,
  attackSpeed: 5,
  attackCooldown: 50,
  maxProjectileCount: 600,
  projectileSpeed: 10,
  projectileSize: [10, 10],
  projectileColor: { r: 255, g: 0, b: 255, a: 1 },
  type: WeaponType.SPIRAL,
  range: 400,
  spiralSpeed: 80, // degree/s
  spiralRadius: 10,
  spiralExpansion: 80,
  projectileCount: 6,
  projectileLifetime: 1000 * 5,
  followPlayer: true,
};

const SpiralOrb: SpinningWeapon = {
  name: 'Spiral Orb',
  damage: 50,
  attackSpeed: 4,
  attackCooldown: 600,
  maxProjectileCount: 100,
  projectileSpeed: 2,
  projectileSize: [24, 24],
  projectileColor: { r: 255, g: 0, b: 255, a: 1 },
  projectileCount: 1,
  projectileLifetime: 1000 * 5,
  type: WeaponType.SPINNING,
  range: 400,
  penetration: -1,
  spinSpeed: 200, // degree/s
  spinRadius: 300,
  spinCount: 1,
  spinLifetime: 1000 * 5,
  followPlayer: true,
  childWeapon: {
    name: 'Orb Spiral Shot',
    damage: 5,
    attackSpeed: 3,
    projectileSpeed: 16,
    projectileSize: [6, 6],
    projectileColor: { r: 255, g: 255, b: 255, a: 1 },
    type: WeaponType.SPIRAL,
    range: 200,
    spiralSpeed: 200,
    spiralRadius: 5,
    spiralExpansion: 120,
    projectileCount: 8,
    projectileLifetime: 1000 * 4,
    followPlayer: false,
  },
  childWeaponAttackCooldown: 1000,
};

export const WeaponList: Weapon[] = [
  RapidFire,
  HeavyShot,
  PiercingShot,
  AutoAim,
  Aura,
  Melee,
  SpiralShot,
  SpiralOrb,
];

export const WeaponMap = {
  RapidFire: RapidFire,
  HeavyShot: HeavyShot,
  PiercingShot: PiercingShot,
  AutoAim: AutoAim,
  Aura: Aura,
  Melee: Melee,
  SpiralShot: SpiralShot,
  SpiralOrb: SpiralOrb,
} as const;
