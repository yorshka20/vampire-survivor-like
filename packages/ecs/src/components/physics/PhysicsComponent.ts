import { SPEED_MULTIPLIERS, calculateSpeed } from '@ecs/constants/speed';
import { Component } from '@ecs/core/ecs/Component';
import { Point } from '@ecs/utils/types';

type EntityType = 'PLAYER' | 'ENEMY' | 'PROJECTILE' | 'ITEM';

interface PhysicsProps {
  velocity?: Point;
  speed?: number;
  entityType?: EntityType;
  friction?: number;
  maxSpeed?: number;
}

export class PhysicsComponent extends Component {
  static componentName = 'Physics';

  // Velocity properties
  velocity: Point;
  private isBlocked: boolean = false;
  private blockedTimer: number = 0;
  private readonly BLOCKED_DURATION: number = 500; // 500ms blocked duration
  private readonly COLLISION_DAMPING: number = 0.5; // Damping factor for collision response
  private friction: number;

  // Movement properties
  speed: number;
  private maxSpeed: number;
  private acceleration: number;
  private entityType: EntityType;

  constructor(props: PhysicsProps = {}) {
    super('Physics');
    this.entityType = props.entityType ?? 'PLAYER';

    // Initialize velocity properties
    this.velocity = props.velocity ?? [0, 0];
    this.friction = props.friction ?? 1;

    // Initialize movement properties
    this.speed = props.speed ?? calculateSpeed(SPEED_MULTIPLIERS[this.entityType].BASE);
    this.maxSpeed = props.maxSpeed ?? calculateSpeed(SPEED_MULTIPLIERS[this.entityType].MAX);
    this.acceleration = 0.5;
  }

  // Velocity methods
  getVelocity(): Point {
    return this.velocity;
  }

  setVelocity(velocity: Point): void {
    if (this.isBlocked) {
      return;
    }

    this.velocity = velocity;

    // Limit speed
    const speed = Math.sqrt(this.velocity[0] ** 2 + this.velocity[1] ** 2);
    if (speed > this.maxSpeed) {
      const scale = this.maxSpeed / speed;
      this.velocity[0] *= scale;
      this.velocity[1] *= scale;
    }
  }

  stop(): void {
    this.velocity = [0, 0];
  }

  handleCollision(collisionNormal: { x: number; y: number }): void {
    const dotProduct = this.velocity[0] * collisionNormal.x + this.velocity[1] * collisionNormal.y;
    if (dotProduct < 0) {
      this.velocity[0] += collisionNormal.x * dotProduct * this.COLLISION_DAMPING;
      this.velocity[1] += collisionNormal.y * dotProduct * this.COLLISION_DAMPING;
    }
  }

  setBlocked(blocked: boolean): void {
    if (blocked && !this.isBlocked) {
      this.isBlocked = true;
      this.blockedTimer = this.BLOCKED_DURATION;
      this.stop();
    } else if (!blocked && this.isBlocked) {
      this.isBlocked = false;
      this.blockedTimer = 0;
    }
  }

  isCurrentlyBlocked(): boolean {
    return this.isBlocked;
  }

  // Movement methods
  getSpeed(): number {
    return this.speed;
  }

  setSpeed(speed: number): void {
    const minSpeed = calculateSpeed(SPEED_MULTIPLIERS[this.entityType].MIN);
    this.speed = Math.min(Math.max(speed, minSpeed), this.maxSpeed);
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

  update(deltaTime: number): void {
    if (this.isBlocked) {
      this.blockedTimer -= deltaTime * 1000;
      if (this.blockedTimer <= 0) {
        this.isBlocked = false;
      }
    }
  }

  reset(): void {
    super.reset();
    // Reset velocity properties
    this.velocity = [0, 0];
    this.isBlocked = false;
    this.blockedTimer = 0;
    this.friction = 1;

    // Reset movement properties
    this.speed = calculateSpeed(SPEED_MULTIPLIERS[this.entityType].BASE);
    this.maxSpeed = calculateSpeed(SPEED_MULTIPLIERS[this.entityType].MAX);
    this.acceleration = 0.5;
  }
}
