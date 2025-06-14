import { Component } from '@ecs/core/ecs/Component';
import { Game } from '@ecs/core/game/Game';

export class LifecycleComponent extends Component {
  static componentName = 'Lifecycle';
  private createdAt: number;
  private lifetime: number;
  private lifeTimeFrameRemaining: number;

  constructor(lifetime: number) {
    super(LifecycleComponent.componentName);
    this.createdAt = Date.now();
    this.lifetime = lifetime;

    const frameTimeStep = Game.getInstance().getGameLoop().getFixedTimeStep() * 1000;
    this.lifeTimeFrameRemaining = Math.floor(lifetime / frameTimeStep);
  }

  update(deltaTime: number): void {
    this.lifeTimeFrameRemaining -= 1;
  }

  isExpired(): boolean {
    if (this.lifetime === -1) return false;
    return this.lifeTimeFrameRemaining <= 0;
  }

  reset(): void {
    this.createdAt = Date.now();
    this.lifetime = 0;
    this.lifeTimeFrameRemaining = 0;
  }
}
