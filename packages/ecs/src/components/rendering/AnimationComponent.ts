import { Component } from '@ecs/core/ecs/Component';
import { AnimationState, SpriteSheetData } from '@ecs/types/animation';

export class AnimationComponent extends Component {
  static componentName: string = 'AnimationComponent';

  private currentFrame: number = 0;
  private frameTime: number = 0;
  private currentAnimation: AnimationState = 'idle';
  private spriteSheet: SpriteSheetData;
  private isPlaying: boolean = true;

  constructor(spriteSheet: SpriteSheetData) {
    super('AnimationComponent');
    this.spriteSheet = spriteSheet;
  }

  update(deltaTime: number): void {
    if (!this.isPlaying) return;

    const animation = this.spriteSheet.animations.get(this.currentAnimation);
    if (!animation) return;

    this.frameTime += deltaTime;
    if (this.frameTime >= animation.frameDuration) {
      this.frameTime = 0;
      this.currentFrame = (this.currentFrame + 1) % animation.frames.length;

      // If animation is not looping and we've reached the end
      if (!animation.loop && this.currentFrame === animation.frames.length - 1) {
        this.isPlaying = false;
      }
    }
  }

  getCurrentFrame(): number {
    const animation = this.spriteSheet.animations.get(this.currentAnimation);
    if (!animation) return 0;
    return animation.frames[this.currentFrame];
  }

  setAnimation(state: AnimationState, forceRestart: boolean = false): void {
    if (this.currentAnimation === state && !forceRestart) return;

    if (this.spriteSheet.animations.has(state)) {
      this.currentAnimation = state;
      this.currentFrame = 0;
      this.frameTime = 0;
      this.isPlaying = true;
    }
  }

  getCurrentAnimation(): AnimationState {
    return this.currentAnimation;
  }

  getSpriteSheet(): SpriteSheetData {
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
    this.isPlaying = true;
  }
}
