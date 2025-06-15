import { Component } from '@ecs/core/ecs/Component';

export type AIBehavior = 'chase' | 'flee' | 'wander' | 'idle';

interface AIProps {
  behavior?: AIBehavior;
  targetEntityId?: string;
  detectionRange?: number;
  speed?: number;
}

export class AIComponent extends Component {
  static componentName = 'AI';
  behavior: AIBehavior;
  targetEntityId: string | null;
  detectionRange: number;
  speed: number;
  private paused: boolean = false;

  constructor(props: AIProps = {}) {
    super('AI');
    this.behavior = props.behavior ?? 'chase';
    this.targetEntityId = props.targetEntityId ?? null;
    this.detectionRange = props.detectionRange ?? 500;
    this.speed = props.speed ?? 2;
  }

  setTarget(entityId: string): void {
    this.targetEntityId = entityId;
  }

  clearTarget(): void {
    this.targetEntityId = null;
  }

  setBehavior(behavior: AIBehavior): void {
    this.behavior = behavior;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  isPaused(): boolean {
    return this.paused;
  }

  reset(): void {
    super.reset();
    this.behavior = 'chase';
    this.targetEntityId = null;
    this.detectionRange = 500;
    this.speed = 2;
    this.paused = false;
  }
}
