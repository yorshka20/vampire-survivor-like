import { Component } from '@ecs/core/ecs/Component';
import { Color } from '@ecs/utils/types';

export type EnemyType = 'normal' | 'magic' | 'elite' | 'boss' | 'legendary';

export interface StateData {
  isDazed: boolean;
  dazeRemainingFrames: number;
  isHit: boolean;
  hitRemainingFrames: number;
  originalColor: Color | null;
  enemyType?: EnemyType; // Optional classification for enemies
}

export class StateComponent extends Component {
  static componentName = 'State';
  private state: StateData;

  constructor(data: Partial<StateData> = {}) {
    super('State');
    this.state = {
      isDazed: false,
      dazeRemainingFrames: 0,
      isHit: false,
      hitRemainingFrames: 0,
      originalColor: null,
      enemyType: data.enemyType,
      ...data,
    };
  }

  getIsDazed(): boolean {
    return this.state.isDazed;
  }

  getIsHit(): boolean {
    return this.state.isHit;
  }

  getEnemyType(): EnemyType | undefined {
    return this.state.enemyType;
  }

  setEnemyType(type: EnemyType): void {
    this.state.enemyType = type;
  }

  setDazed(frames: number): void {
    this.state.isDazed = true;
    this.state.dazeRemainingFrames = frames;
  }

  setHit(frames: number): void {
    this.state.isHit = true;
    this.state.hitRemainingFrames = frames;
  }

  setOriginalColor(color: Color): void {
    this.state.originalColor = color;
  }

  getOriginalColor(): Color | null {
    return this.state.originalColor;
  }

  update(): void {
    if (this.state.isDazed) {
      this.state.dazeRemainingFrames--;
      if (this.state.dazeRemainingFrames <= 0) {
        this.state.isDazed = false;
      }
    }
    if (this.state.isHit) {
      this.state.hitRemainingFrames--;
      if (this.state.hitRemainingFrames <= 0) {
        this.state.isHit = false;
      }
    }
  }

  reset(): void {
    super.reset();
    this.state = {
      isDazed: false,
      dazeRemainingFrames: 0,
      isHit: false,
      hitRemainingFrames: 0,
      originalColor: null,
      enemyType: undefined,
    };
  }
}
