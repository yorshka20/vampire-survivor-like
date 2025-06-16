import { AnimationData } from '@ecs/types/animation';

export const slimeAnimations = new Map<string, AnimationData>([
  [
    'idle',
    {
      frames: [0, 1],
      frameDuration: 0.8,
      loop: true,
    },
  ],
  [
    'walk',
    {
      frames: [2, 3, 4, 5],
      frameDuration: 0.15,
      loop: true,
    },
  ],
  [
    'jump',
    {
      frames: [6, 7],
      frameDuration: 0.2,
      loop: false,
    },
  ],
  [
    'hurt',
    {
      frames: [8],
      frameDuration: 0.1,
      loop: false,
    },
  ],
  [
    'attack',
    {
      frames: [9, 10],
      frameDuration: 0.12,
      loop: false,
    },
  ],
]);

export const slimePurpleAnimations = new Map<string, AnimationData>([
  [
    'idle',
    {
      frames: [0, 1],
      frameDuration: 0.8,
      loop: true,
    },
  ],
]);
