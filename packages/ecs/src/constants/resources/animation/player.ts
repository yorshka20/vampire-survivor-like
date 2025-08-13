import { AnimationData } from '@ecs/types/animation';

export const playerAnimations = new Map<string, AnimationData>([
  [
    'idle',
    {
      frames: [0, 1, 2, 3],
      frameDuration: 0.2,
      loop: true,
    },
  ],
  [
    'walk',
    {
      frames: [16, 17, 18, 19, 20, 21, 22, 23],
      frameDuration: 0.15,
      loop: true,
    },
  ],
]);
