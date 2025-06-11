import { StatsProps } from '@ecs/components/state/StatsComponent';

export const STAT_LIMITS: Record<keyof StatsProps, { min: number; max: number }> = {
  damageMultiplier: { min: 0, max: 1000 },
  attackSpeedMultiplier: { min: 0, max: 100 },
  moveSpeedMultiplier: { min: 0, max: 5 },
  maxHealthMultiplier: { min: 0, max: 1000 },
  pickupRangeMultiplier: { min: 0, max: 50 },
  expGainMultiplier: { min: 0, max: Infinity },
} as const;
