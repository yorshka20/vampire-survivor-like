export interface AnimationData {
  frames: number[]; // Frame indices in the sprite sheet
  frameDuration: number; // Duration of each frame in seconds
  loop: boolean; // Whether the animation should loop
}

export interface SpriteSheetData {
  name: string; // Identifier of this sprite sheet
  image: HTMLImageElement;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  animations: Map<string, AnimationData>;
  // Optional crop scale: 1 means use full frame; 0.5 means use the centered 50% area
  sourceCropScale?: number;
}

export type AnimationState = 'idle' | 'walk' | 'attack' | 'hurt' | 'death' | 'jump';
