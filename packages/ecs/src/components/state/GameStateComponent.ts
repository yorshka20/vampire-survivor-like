import { Component } from '@ecs/core/ecs/Component';

export class GameStateComponent extends Component {
  static componentName = 'GameState';

  private currentWave: number = 1;
  private enemyCount: number = 0;
  private timeUntilNextWave: number = 0;

  constructor() {
    super(GameStateComponent.componentName);
  }

  setWave(wave: number): void {
    this.currentWave = wave;
  }

  getWave(): number {
    return this.currentWave;
  }

  setEnemyCount(count: number): void {
    this.enemyCount = count;
  }

  getEnemyCount(): number {
    return this.enemyCount;
  }

  setTimeUntilNextWave(time: number): void {
    this.timeUntilNextWave = time;
  }

  getTimeUntilNextWave(): number {
    return this.timeUntilNextWave;
  }

  reset(): void {
    this.currentWave = 1;
    this.enemyCount = 0;
    this.timeUntilNextWave = 0;
  }
}
