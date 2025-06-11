import { Color } from '@ecs/utils/types';

export function randomRgb(alpha?: number): Color {
  return {
    r: Math.floor(Math.random() * 256),
    g: Math.floor(Math.random() * 256),
    b: Math.floor(Math.random() * 256),
    a: alpha ?? Math.random(),
  };
}
