import { Component } from '@ecs/core/ecs/Component';

interface SpiralMovementProps {
  centerX: number;
  centerY: number;
  angle: number;
  radius: number;
  speed: number;
  expansion: number;
}

export class SpiralMovementComponent extends Component {
  static componentName = 'SpiralMovement';

  private centerX: number;
  private centerY: number;
  private angle: number;
  private radius: number;
  private speed: number;
  private expansion: number;

  constructor(props: SpiralMovementProps) {
    super('SpiralMovement');
    this.centerX = props.centerX;
    this.centerY = props.centerY;
    this.angle = props.angle;
    this.radius = props.radius;
    this.speed = props.speed;
    this.expansion = props.expansion;
  }

  update(deltaTime: number): void {
    // Convert deltaTime to seconds
    const dt = deltaTime / 1000;

    // Update angle and radius
    this.angle += this.speed * dt;
    this.radius += this.expansion * dt;
  }

  getOffset(): { x: number; y: number } {
    return {
      x: Math.cos(this.angle) * this.radius,
      y: Math.sin(this.angle) * this.radius,
    };
  }

  getCenter(): { x: number; y: number } {
    return {
      x: this.centerX,
      y: this.centerY,
    };
  }
}
