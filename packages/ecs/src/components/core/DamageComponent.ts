import { Component } from '@ecs/core/ecs/Component';

export interface DamageProps {
  damage: number;
  source: string;
  team?: 'player' | 'enemy';
  penetration?: number;
  tickRate?: number; // Time between damage ticks in milliseconds
  duration?: number; // Total duration of the damage effect in milliseconds
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
    if (!this.duration) return false;
    return Date.now() - this.startTime >= this.duration;
  }

  canTick(): boolean {
    if (!this.tickRate) return false;
    return Date.now() - this.lastTickTime >= this.tickRate;
  }

  updateTickTime(): void {
    this.lastTickTime = Date.now();
  }

  reset(): void {
    this.hitEntities.clear();
    this.lastTickTime = Date.now();
    this.startTime = Date.now();
  }
}
