import { SPEED_MULTIPLIERS, calculateSpeed } from '@ecs/constants/speed';
import { Component } from '@ecs/core/ecs/Component';
import { Point } from '@ecs/utils/types';

type EntityType = 'PLAYER' | 'ENEMY' | 'PROJECTILE';

interface MovementProps {
  position: { x: number; y: number };
  speed?: number;
  entityType?: EntityType;
}

export class MovementComponent extends Component {
  static componentName = 'Movement';
  position: { x: number; y: number };
  speed: number;
  private maxSpeed: number;
  private acceleration: number;
  private entityType: EntityType;

  constructor(props: MovementProps) {
    super('Movement');
    this.position = props.position;
    this.entityType = props.entityType ?? 'PLAYER';
    this.speed = props.speed ?? calculateSpeed(SPEED_MULTIPLIERS[this.entityType].BASE);
    this.maxSpeed = calculateSpeed(SPEED_MULTIPLIERS[this.entityType].MAX);
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
    const minSpeed = calculateSpeed(SPEED_MULTIPLIERS[this.entityType].MIN);
    const maxSpeed = calculateSpeed(SPEED_MULTIPLIERS[this.entityType].MAX);
    this.speed = Math.min(Math.max(speed, minSpeed), maxSpeed);
  }

  getMaxSpeed(): number {
    return this.maxSpeed;
  }

  getAcceleration(): number {
    return this.acceleration;
  }

  getEntityType(): EntityType {
    return this.entityType;
  }

  move(dx: number, dy: number): void {
    this.position.x += dx;
    this.position.y += dy;
  }

  reset(): void {
    this.position = { x: -9999, y: -9999 };
    this.speed = calculateSpeed(SPEED_MULTIPLIERS[this.entityType].BASE);
    this.maxSpeed = calculateSpeed(SPEED_MULTIPLIERS[this.entityType].MAX);
    this.acceleration = 0;
  }
}
