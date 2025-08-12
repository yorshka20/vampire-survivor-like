import { Component } from '@ecs/core/ecs/Component';
import { SpriteSheetData } from '@ecs/types/animation';
import { SpriteSheetLoader } from '@ecs/utils/SpriteSheetLoader';

export class AnimationComponent extends Component {
  static componentName: string = 'AnimationComponent';

  private currentFrame: number = 0;
  private frameTime: number = 0;
  private currentAnimation: string = 'idle';
  private spriteSheet: SpriteSheetData | null = null;
  private isPlaying: boolean = true;

  constructor(spriteSheetName: string) {
    super('AnimationComponent');
    this.setSpriteSheet(spriteSheetName);
  }

  private setSpriteSheet(spriteSheetName: string): void {
    const spriteSheet = SpriteSheetLoader.getInstance().getSpriteSheet(spriteSheetName);
    if (!spriteSheet) {
      throw new Error(`Sprite sheet ${spriteSheetName} not found`);
    }
    this.spriteSheet = spriteSheet;
  }

  update(deltaTime: number): void {
    if (!this.isPlaying || !this.spriteSheet) return;

    const animation = this.spriteSheet.animations.get(this.currentAnimation);
    if (!animation) return;

    this.frameTime += deltaTime;
    if (this.frameTime >= animation.frameDuration) {
      this.frameTime = 0;

      // For non-looping animations, stay on the last frame
      if (!animation.loop && this.currentFrame === animation.frames.length - 1) {
        this.isPlaying = false;
        return;
      }

      this.currentFrame = (this.currentFrame + 1) % animation.frames.length;
    }
  }

  getCurrentFrame(): number {
    const animation = this.spriteSheet?.animations.get(this.currentAnimation);
    if (!animation) return 0;
    return animation.frames[this.currentFrame];
  }

  setAnimation(state: string, forceRestart: boolean = false): void {
    if (this.currentAnimation === state && !forceRestart) return;

    if (this.spriteSheet?.animations.has(state)) {
      this.currentAnimation = state;
      this.currentFrame = 0;
      this.frameTime = 0;
      this.isPlaying = true;
    }
  }

  getCurrentAnimation(): string {
    return this.currentAnimation;
  }

  getSpriteSheet(): SpriteSheetData {
    if (!this.spriteSheet) {
      throw new Error('Sprite sheet not set');
    }
    return this.spriteSheet;
  }

  pause(): void {
    this.isPlaying = false;
  }

  resume(): void {
    this.isPlaying = true;
  }

  isAnimationPlaying(): boolean {
    return this.isPlaying;
  }

  reset(): void {
    super.reset();
    this.currentFrame = 0;
    this.frameTime = 0;
    this.currentAnimation = 'idle';
    this.isPlaying = false;
    // Don't reset spriteSheet here - it will be set in recreate()
  }

  recreate(spriteSheetName: string): void {
    this.reset();
    this.setSpriteSheet(spriteSheetName);
    this.isPlaying = true;
  }
}
