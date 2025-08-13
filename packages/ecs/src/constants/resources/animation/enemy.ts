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

/**
 * Orc enemy animations 6*8 = 48 grids
 * The provided sprite sheet is 100x100 per frame and likely laid out in a single row.
 * We use center-crop in rendering (via sourceCropScale) to remove large transparent padding.
 * The frame indices below assume the sheet contains at least idle(0-1), walk(2-5), attack(6-9), hurt(10-11).
 * If the sheet has fewer frames, rendering will safely use available ones.
 */
export const orcAnimations = new Map<string, AnimationData>([
  [
    'idle',
    {
      frames: [0, 1, 2, 3, 4, 5],
      frameDuration: 0.6,
      loop: true,
    },
  ],
  [
    'walk',
    {
      frames: [8, 9, 10, 11, 12, 13, 14, 15],
      frameDuration: 0.12,
      loop: true,
    },
  ],
  [
    'attack',
    {
      frames: [16, 17, 18, 19, 20, 21],
      frameDuration: 0.1,
      loop: false,
    },
  ],
  [
    'attack2',
    {
      frames: [24, 25, 26, 27, 28, 29],
      frameDuration: 0.1,
      loop: false,
    },
  ],
  [
    'hurt',
    {
      frames: [32, 33, 34, 35],
      frameDuration: 0.1,
      loop: false,
    },
  ],
  [
    'death',
    {
      frames: [40, 41, 42, 43],
      frameDuration: 0.1,
      loop: false,
    },
  ],
]);
