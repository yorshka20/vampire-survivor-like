import { SPEED_MULTIPLIERS, calculateSpeed } from '@ecs/constants/speed';
import { Component } from '@ecs/core/ecs/Component';

interface VelocityProps {
  velocity?: { x: number; y: number };
  // keep for compatibility
  friction?: number;
  maxSpeed?: number;
  entityType?: 'PLAYER' | 'ENEMY' | 'PROJECTILE' | 'ITEM';
}

export class VelocityComponent extends Component {
  static componentName = 'Velocity';
  velocity: { x: number; y: number };
  maxSpeed: number;
  private isBlocked: boolean = false;
  private blockedTimer: number = 0;
  private readonly BLOCKED_DURATION: number = 500; // 500ms blocked duration
  private readonly COLLISION_DAMPING: number = 0.5; // Damping factor for collision response
  private friction: number;
  private entityType: 'PLAYER' | 'ENEMY' | 'PROJECTILE' | 'ITEM';

  constructor(props: VelocityProps = {}) {
    super('Velocity');
    this.velocity = props.velocity ?? { x: 0, y: 0 };
    this.entityType = props.entityType ?? 'PLAYER';
    this.maxSpeed = props.maxSpeed ?? calculateSpeed(SPEED_MULTIPLIERS[this.entityType].MAX);
    this.friction = props.friction ?? 1;
  }

  getVelocity(): { x: number; y: number } {
    return { ...this.velocity };
  }

  setVelocity(velocity: { x: number; y: number }): void {
    if (this.isBlocked) {
      return;
    }

    this.velocity = velocity;

    // Limit speed
    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2);
    const maxSpeed = calculateSpeed(SPEED_MULTIPLIERS[this.entityType].MAX);
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      this.velocity.x *= scale;
      this.velocity.y *= scale;
    }
  }

  stop(): void {
    this.velocity = { x: 0, y: 0 };
  }

  handleCollision(collisionNormal: { x: number; y: number }): void {
    // Apply damping to velocity in collision direction
    const dotProduct = this.velocity.x * collisionNormal.x + this.velocity.y * collisionNormal.y;
    if (dotProduct < 0) {
      this.velocity.x += collisionNormal.x * dotProduct * this.COLLISION_DAMPING;
      this.velocity.y += collisionNormal.y * dotProduct * this.COLLISION_DAMPING;
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

  update(deltaTime: number): void {
    if (this.isBlocked) {
      this.blockedTimer -= deltaTime * 1000;
      if (this.blockedTimer <= 0) {
        this.isBlocked = false;
      }
    }
  }

  isCurrentlyBlocked(): boolean {
    return this.isBlocked;
  }

  reset(): void {
    super.reset();
    this.velocity = { x: 0, y: 0 };
    this.maxSpeed = calculateSpeed(SPEED_MULTIPLIERS[this.entityType].MAX);
    this.isBlocked = false;
    this.blockedTimer = 0;
    this.friction = 1;
  }
}
