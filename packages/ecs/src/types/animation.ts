export interface AnimationData {
  frames: number[]; // Frame indices in the sprite sheet
  frameDuration: number; // Duration of each frame in seconds
  loop: boolean; // Whether the animation should loop
}

export interface SpriteSheetData {
  image: HTMLImageElement;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  animations: Map<string, AnimationData>;
}

export type AnimationState = 'idle' | 'walk' | 'attack' | 'hit' | 'death';
