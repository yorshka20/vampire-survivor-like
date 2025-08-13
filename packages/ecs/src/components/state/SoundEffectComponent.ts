import { Component } from '@ecs/core/ecs/Component';
import { SoundType } from '@ecs/core/resources/SoundManager';

export interface SoundEffectConfig {
  hitSound?: SoundType;
  deathSound?: SoundType;
  powerUpSound?: SoundType;
  coinSound?: SoundType;
  explosionSound?: SoundType;
  jumpSound?: SoundType;
  tapSound?: SoundType;
  volume?: number;
}

export class SoundEffectComponent extends Component {
  static componentName = 'SoundEffect';

  private config: SoundEffectConfig;
  volume: number;

  constructor(config: SoundEffectConfig) {
    super(SoundEffectComponent.componentName);
    this.config = config;
    this.volume = config.volume ?? 0.5;
  }

  getSound(soundType: SoundType): string | undefined {
    switch (soundType) {
      case 'hit':
        return this.config.hitSound;
      case 'death':
        return this.config.deathSound;
      case 'power_up':
        return this.config.powerUpSound;
      case 'coin':
        return this.config.coinSound;
      case 'explosion':
        return this.config.explosionSound;
      case 'jump':
        return this.config.jumpSound;
      case 'tap':
        return this.config.tapSound;
      default:
        return undefined;
    }
  }
}
