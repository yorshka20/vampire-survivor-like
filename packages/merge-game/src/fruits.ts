import { Color } from '@ecs/utils';

export interface FruitLevel {
  name: string;
  /** World units. */
  radius: number;
  color: Color;
  /** Points awarded when this level is produced by a merge. */
  score: number;
}

const rgb = (r: number, g: number, b: number): Color => ({ r, g, b, a: 1 });

/**
 * Level table, smallest first. Two fruits of level i merge into level i + 1; the
 * last level never merges. Radii are sized for the 600-wide container: the top
 * level is about half the container width.
 */
export const FRUIT_LEVELS: readonly FruitLevel[] = [
  { name: 'cherry', radius: 18, color: rgb(220, 40, 60), score: 1 },
  { name: 'strawberry', radius: 26, color: rgb(255, 90, 90), score: 3 },
  { name: 'grape', radius: 36, color: rgb(150, 80, 220), score: 6 },
  { name: 'orange', radius: 44, color: rgb(255, 170, 40), score: 10 },
  { name: 'persimmon', radius: 56, color: rgb(255, 120, 30), score: 15 },
  { name: 'apple', radius: 68, color: rgb(230, 50, 50), score: 21 },
  { name: 'pear', radius: 80, color: rgb(230, 220, 90), score: 28 },
  { name: 'peach', radius: 96, color: rgb(255, 170, 190), score: 36 },
  { name: 'pineapple', radius: 112, color: rgb(250, 210, 60), score: 45 },
  { name: 'melon', radius: 132, color: rgb(150, 220, 110), score: 55 },
  { name: 'watermelon', radius: 156, color: rgb(40, 160, 70), score: 66 },
];

export const MAX_FRUIT_LEVEL = FRUIT_LEVELS.length - 1;

/** Levels the dropper may hand out (only the small ones). */
export const SPAWNABLE_LEVEL_COUNT = 5;

export function randomSpawnLevel(): number {
  return Math.floor(Math.random() * SPAWNABLE_LEVEL_COUNT);
}
