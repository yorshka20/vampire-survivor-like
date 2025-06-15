import { BombWeapon, Weapon, WeaponType } from '@ecs/components/weapon/WeaponTypes';
import { Component } from '@ecs/core/ecs/Component';

export interface DamageProps {
  damage: number;
  source: string;
  team?: 'player' | 'enemy';
  penetration?: number;
  tickRate?: number; // Time between damage ticks in milliseconds
  duration?: number; // Total duration of the damage effect in milliseconds
  weapon: Weapon; // Reference to the weapon that caused this damage
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
