import { AreaWeapon, BombWeapon, Weapon, WeaponType } from '@ecs/components/weapon/WeaponTypes';
import { Component } from '@ecs/core/ecs/Component';
import { Point } from '@ecs/utils/types';

export interface DamageProps {
  damage: number;
  source: string;
  team?: 'player' | 'enemy';
  penetration?: number;
  tickRate?: number; // Time between damage ticks in milliseconds
  duration?: number; // Total duration of the damage effect in milliseconds
  weapon: Weapon; // Reference to the weapon that caused this damage
  laser?: {
    aim: Point;
  };
}

export class DamageComponent extends Component {
  static componentName = 'Damage';

  damage: number;
  source: string;
  team: 'player' | 'enemy';
  penetration: number;
  tickRate?: number;
  duration?: number;
  lastTickTime: number;
  startTime: number;
  hitEntities: Set<string>;
  weapon: Weapon;
  laser?: {
    aim: Point;
  };

  constructor(props: DamageProps) {
    super('Damage');
    this.damage = props.damage;
    this.source = props.source;
    this.team = props.team ?? 'player';
    this.penetration = props.penetration ?? 1;
    this.tickRate = props.tickRate;
    this.duration = props.duration;
    this.lastTickTime = Date.now();
    this.startTime = Date.now();
    this.hitEntities = new Set();
    this.weapon = props.weapon;
    this.laser = props.laser;
  }

  recordHit(entityId: string): void {
    this.hitEntities.add(entityId);
  }

  hasHit(entityId: string): boolean {
    return this.hitEntities.has(entityId);
  }

  canHitMore(): boolean {
    return this.penetration === -1 || this.hitEntities.size < this.penetration;
  }

  isExpired(): boolean {
    if (!this.duration || this.duration === -1) return false;
    return Date.now() - this.startTime >= this.duration;
  }

  canTick(): boolean {
    if (!this.tickRate) return false;
    return Date.now() - this.lastTickTime >= this.tickRate;
  }

  isAoe(): boolean {
    return this.weapon?.type === WeaponType.AREA || this.weapon?.type === WeaponType.BOMB;
  }

  getAoeRadius(): number {
    if (this.weapon?.type === WeaponType.AREA) {
      return (this.weapon as AreaWeapon).radius;
    }
    return (this.weapon as BombWeapon).explosionRadius;
  }

  isLaser(): boolean {
    return this.weapon?.type === WeaponType.LASER;
  }

  getLaser(): { aim: Point } | undefined {
    return this.laser;
  }

  canExplode(): this is { weapon: BombWeapon } {
    return this.weapon?.type === WeaponType.BOMB;
  }

  updateTickTime(): void {
    this.lastTickTime = Date.now();
  }

  isCritical(): boolean {
    if (!this.weapon) return false;
    const criticalChance = this.weapon.criticalChance ?? 0.1; // Default 10% critical chance
    return Math.random() < criticalChance;
  }

  getDamage(): { damage: number; isCritical: boolean } {
    const isCritical = this.isCritical();
    if (!this.weapon) {
      return { damage: this.damage, isCritical: false };
    }
    const criticalMultiplier = this.weapon.criticalMultiplier ?? 1.5; // Default 1.5x critical multiplier
    return {
      damage: isCritical ? this.damage * criticalMultiplier : this.damage,
      isCritical,
    };
  }

  reset(): void {
    super.reset();
    this.hitEntities.clear();
    this.lastTickTime = Date.now();
    this.startTime = Date.now();
  }

  recreate(props: DamageProps): void {
    this.damage = props.damage;
    this.source = props.source;
    this.team = props.team ?? 'player';
    this.penetration = props.penetration ?? 1;
    this.tickRate = props.tickRate;
    this.duration = props.duration;
  }
}
