import { Component } from '@ecs/core/ecs/Component';

export class LifecycleComponent extends Component {
  static componentName = 'Lifecycle';
  private createdAt: number;
  private lifetime: number;

  constructor(lifetime: number) {
    super(LifecycleComponent.componentName);
    this.createdAt = Date.now();
    this.lifetime = lifetime;
  }

  isExpired(): boolean {
    return Date.now() - this.createdAt >= this.lifetime;
  }

  getRemainingTime(): number {
    return Math.max(0, this.lifetime - (Date.now() - this.createdAt));
  }

  reset(): void {
    this.createdAt = Date.now();
    this.lifetime = 0;
  }
}
