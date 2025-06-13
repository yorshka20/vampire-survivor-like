import { Component } from '@ecs/core/ecs/Component';

interface SpiralMovementProps {
  followPlayer?: boolean;
  center: { x: number; y: number };
  angle: number;
  radius: number;
  speed: number;
  expansion: number;
}

export class SpiralMovementComponent extends Component {
  static componentName = 'SpiralMovement';

  private followPlayer: boolean;
  private center: { x: number; y: number };
  private angle: number;
  private radius: number;
  private speed: number;
  private expansion: number;

  constructor(props: SpiralMovementProps) {
    super('SpiralMovement');
    this.followPlayer = props.followPlayer ?? false;
    this.center = props.center;
    this.angle = props.angle;
    this.radius = props.radius;
    this.speed = props.speed;
    this.expansion = props.expansion;
  }

  update(deltaTime: number): void {
    // deltaTime is in seconds!
    const angleDelta = this.speed * (Math.PI / 180) * deltaTime;
    this.angle += angleDelta;
    if (this.expansion !== 0) {
      this.radius += this.expansion * deltaTime;
    }
  }

  // Get the current position in Cartesian coordinates
  getPosition(): { x: number; y: number } {
    return {
      x: this.center.x + Math.cos(this.angle) * this.radius,
      y: this.center.y + Math.sin(this.angle) * this.radius,
    };
  }

  // Get the velocity vector in Cartesian coordinates
  getVelocity(): { x: number; y: number } {
    // Angular velocity in radians per second
    const angularVelocity = this.speed * (Math.PI / 180);
    // Tangential velocity (perpendicular to radius)
    const tangentialX = -Math.sin(this.angle) * this.radius * angularVelocity;
    const tangentialY = Math.cos(this.angle) * this.radius * angularVelocity;
    // Radial velocity (if expansion is non-zero)
    let radialX = 0;
    let radialY = 0;
    if (this.expansion !== 0) {
      radialX = Math.cos(this.angle) * this.expansion;
      radialY = Math.sin(this.angle) * this.expansion;
    }
    return {
      x: tangentialX + radialX,
      y: tangentialY + radialY,
    };
  }

  getCenter(): { x: number; y: number } {
    return this.center;
  }

  updateCenter(x: number, y: number): void {
    this.center.x = x;
    this.center.y = y;
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
