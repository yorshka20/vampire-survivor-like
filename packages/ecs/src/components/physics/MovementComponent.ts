import { Component } from '@ecs/core/ecs/Component';
import { Point } from '@ecs/utils/types';

interface MovementProps {
  position: { x: number; y: number };
  speed: number;
}

export class MovementComponent extends Component {
  static componentName = 'Movement';
  position: { x: number; y: number };
  speed: number;
  private maxSpeed: number;
  private acceleration: number;

  constructor(props: MovementProps) {
    super('Movement');
    this.position = props.position;
    this.speed = props.speed;
    this.maxSpeed = 10;
    this.acceleration = 0.5;
  }

  getPosition(): Point {
    return [this.position.x, this.position.y];
  }

  setPosition(position: Point): void {
    this.position = { x: position[0], y: position[1] };
  }

  getSpeed(): number {
    return this.speed;
  }

  setSpeed(speed: number): void {
    this.speed = Math.min(speed, this.maxSpeed);
  }

  getMaxSpeed(): number {
    return this.maxSpeed;
  }

  getAcceleration(): number {
    return this.acceleration;
  }

  move(dx: number, dy: number): void {
    this.position.x += dx;
    this.position.y += dy;
  }

  reset(): void {
    this.position = { x: -9999, y: -9999 };
    this.speed = 0;
    this.maxSpeed = 10;
    this.acceleration = 0;
  }
}
