import { Color } from '@ecs/utils/types';

export type PowerupItem = {
  stat: 'damage' | 'attackSpeed' | 'moveSpeed' | 'maxHealth';
  multiplier: number;
  color: Color;
};

export const PowerupStats: PowerupItem[] = [
  { stat: 'damage' as const, multiplier: 1.2, color: { r: 255, g: 0, b: 0, a: 1 } },
  { stat: 'attackSpeed' as const, multiplier: 1.15, color: { r: 255, g: 255, b: 0, a: 1 } },
  { stat: 'moveSpeed' as const, multiplier: 1.1, color: { r: 0, g: 255, b: 255, a: 1 } },
  { stat: 'maxHealth' as const, multiplier: 1.25, color: { r: 0, g: 255, b: 0, a: 1 } },
];
