import { Component } from '@ecs/core/ecs/Component';

interface SpiralMovementProps {
  followPlayer?: boolean;
  centerX: number;
  centerY: number;
  angle: number;
  radius: number;
  speed: number;
  expansion: number;
}

export class SpiralMovementComponent extends Component {
  static componentName = 'SpiralMovement';

  private followPlayer: boolean;
  private centerX: number;
  private centerY: number;
  private angle: number;
  private radius: number;
  private speed: number;
  private expansion: number;

  constructor(props: SpiralMovementProps) {
    super('SpiralMovement');
    this.followPlayer = props.followPlayer ?? false;
    this.centerX = props.centerX;
    this.centerY = props.centerY;
    this.angle = props.angle;
    this.radius = props.radius;
    this.speed = props.speed;
    this.expansion = props.expansion;
  }

  update(deltaTime: number): void {
    // Convert deltaTime to seconds and scale it for better control
    const dt = (deltaTime / 1000) * 60; // Scale to roughly match 60fps

    // Update angle and radius with scaled values
    this.angle += (this.speed * dt) / 10; // Divide by 10 to make the speed more manageable
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

  updateCenter(x: number, y: number): void {
    this.centerX = x;
    this.centerY = y;
  }

  getAngle(): number {
    return this.angle;
  }

  getSpeed(): number {
    return this.speed;
  }

  getFollowPlayer(): boolean {
    return this.followPlayer;
  }

  getRadius(): number {
    return this.radius;
  }
}
