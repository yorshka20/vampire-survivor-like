import { Component } from '@ecs/core/ecs/Component';

export class LifecycleComponent extends Component {
  static componentName = 'Lifecycle';
  private createdAt: number;
  private lifetime: number;
  private remainingTime: number;

  constructor(lifetime: number) {
    super(LifecycleComponent.componentName);
    this.createdAt = Date.now();
    this.lifetime = lifetime;
    this.remainingTime = lifetime;
  }

  update(deltaTime: number): void {
    this.remainingTime -= deltaTime * 1000; // Convert deltaTime to milliseconds
  }

  isExpired(): boolean {
    // -1 means infinite lifetime
    if (this.lifetime === -1) return false;
    return this.remainingTime <= 0;
  }

  reset(): void {
    super.reset();
    this.lifetime = 0;
    this.remainingTime = 0;
  }

  recreate(lifetime: number): void {
    this.createdAt = Date.now();
    this.lifetime = lifetime;
    this.remainingTime = lifetime;
  }
}
