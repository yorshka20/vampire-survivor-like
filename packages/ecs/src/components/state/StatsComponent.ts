import { STAT_LIMITS } from '@ecs/constants/statLimits';
import { Component } from '@ecs/core/ecs/Component';

export interface StatsProps {
  /** Multiplier for damage */
  damageMultiplier?: number;
  /** Multiplier for attack speed */
  attackSpeedMultiplier?: number;
  /** Multiplier for move speed */
  moveSpeedMultiplier?: number;
  /** Multiplier for max health */
  maxHealthMultiplier?: number;
  /** Multiplier for pickup range */
  pickupRangeMultiplier?: number;
  /** Multiplier for exp gain */
  expGainMultiplier?: number;
}

export class StatsComponent extends Component {
  static componentName = 'Stats';
  damageMultiplier: number;
  attackSpeedMultiplier: number;
  moveSpeedMultiplier: number;
  maxHealthMultiplier: number;
  pickupRangeMultiplier: number;
  expGainMultiplier: number;

  constructor(props: StatsProps = {}) {
    super('Stats');
    this.damageMultiplier = props.damageMultiplier ?? 1;
    this.attackSpeedMultiplier = props.attackSpeedMultiplier ?? 1;
    this.moveSpeedMultiplier = props.moveSpeedMultiplier ?? 1;
    this.maxHealthMultiplier = props.maxHealthMultiplier ?? 1;
    this.pickupRangeMultiplier = props.pickupRangeMultiplier ?? 1;
    this.expGainMultiplier = props.expGainMultiplier ?? 1;
  }

  applyMultiplier(stat: keyof StatsProps, multiplier: number): void {
    if (stat in this) {
      this[stat] *= multiplier;
      this.ensureStatLimits(stat);
    }
  }

  applyIncrement(stat: keyof StatsProps, increment: number): void {
    if (stat in this) {
      this[stat] += increment;
      this.ensureStatLimits(stat);
    }
  }

  ensureStatLimits(stat: keyof StatsProps): void {
    if (!(stat in this)) {
      return;
    }
    if (stat in STAT_LIMITS) {
      const limits = STAT_LIMITS[stat];
      if (!this.isInRange(this[stat], limits.min, limits.max)) {
        this[stat] = limits.max;
      }
    }
  }

  private isInRange(value: number, min: number, max: number): boolean {
    return value >= min && value <= max;
  }

  reset(): void {
    super.reset();
    this.damageMultiplier = 1;
    this.attackSpeedMultiplier = 1;
    this.moveSpeedMultiplier = 1;
    this.maxHealthMultiplier = 1;
    this.pickupRangeMultiplier = 1;
    this.expGainMultiplier = 1;
  }
}
