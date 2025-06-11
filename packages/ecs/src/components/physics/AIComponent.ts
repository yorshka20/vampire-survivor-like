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

  reset(): void {
    this.behavior = 'chase';
    this.targetEntityId = null;
    this.detectionRange = 500;
    this.speed = 2;
  }
}
