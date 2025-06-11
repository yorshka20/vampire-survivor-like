import { Component } from '@ecs/core/ecs/Component';

export interface SoundEffectConfig {
  hitSound?: string; // Sound key for when entity is hit
  deathSound?: string; // Sound key for when entity dies
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

  getHitSound(): string | undefined {
    return this.config.hitSound;
  }

  getDeathSound(): string | undefined {
    return this.config.deathSound;
  }
}
