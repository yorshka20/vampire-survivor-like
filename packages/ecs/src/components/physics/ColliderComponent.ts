import { Component } from '@ecs/core/ecs/Component';
import { Point, RectArea } from '@ecs/utils/types';
import { TransformComponent } from './TransformComponent';

export interface ColliderProps {
  type: 'circle' | 'rect' | 'laser';
  size: [number, number];
  offset?: [number, number];
  isTrigger?: boolean; // Whether this collider should only trigger events without physical collision
  laser?: {
    aim: Point;
    laserWidth: number;
    laserLength: number;
  };
}

export class ColliderComponent extends Component {
  static componentName = 'Collider';
  type: 'circle' | 'rect' | 'laser';
  size: [number, number];
  offset: [number, number];
  private isTrigger: boolean; // If true, this collider will only trigger events without physical collision
  private isColliding: boolean = false; // Current collision state of this collider
  private collidingEntities: Set<string> = new Set(); // Set of entity IDs that are currently colliding with this collider
  private laser?: {
    aim: Point;
    laserWidth: number;
    laserLength: number;
    // Cached direction and length for performance optimization
    cachedDirection?: [number, number];
    cachedLength?: number;
    cachedLengthSquared?: number;
  };

  constructor(props: ColliderProps) {
    super(ColliderComponent.componentName);
    this.type = props.type;
    this.size = props.size;
    this.offset = props.offset || [0, 0];
    this.isTrigger = props.isTrigger || false;
    this.laser = props.laser;

    // Pre-calculate laser direction if laser is provided
    if (this.laser) {
      this.updateLaserDirection([0, 0]); // Initial calculation with dummy position
    }
  }

  /**
   * Update laser direction cache for performance optimization
   * This method should be called whenever the laser aim or position changes
   */
  updateLaserDirection(position: Point): void {
    if (!this.laser) return;

    const dx = this.laser.aim[0] - position[0];
    const dy = this.laser.aim[1] - position[1];
    const lengthSquared = dx * dx + dy * dy;
    const length = Math.sqrt(lengthSquared);

    // Cache the direction vector and length
    this.laser.cachedDirection = [dx / length, dy / length];
    this.laser.cachedLength = length;
    this.laser.cachedLengthSquared = lengthSquared;
  }

  /**
   * Get cached laser direction for performance optimization
   */
  getCachedLaserDirection(): [number, number] | undefined {
    return this.laser?.cachedDirection;
  }

  /**
   * Get cached laser length for performance optimization
   */
  getCachedLaserLength(): number | undefined {
    return this.laser?.cachedLength;
  }

  /**
   * Get cached laser length squared for performance optimization
   */
  getCachedLaserLengthSquared(): number | undefined {
    return this.laser?.cachedLengthSquared;
  }

  getBounds(): { x: number; y: number; width: number; height: number } {
    const position = this.entity?.getComponent<TransformComponent>('TransformComponent')
      ?.position || [0, 0];
    return {
      x: position[0] + this.offset[0],
      y: position[1] + this.offset[1],
      width: this.size[0],
      height: this.size[1],
    };
  }

  getCollider(): ColliderProps {
    return {
      type: this.type,
      size: this.size,
      offset: this.offset,
      laser: this.laser,
    };
  }

  getCollisionArea(position: Point, out?: RectArea): RectArea {
    const [x, y] = position;

    switch (this.type) {
      case 'rect':
        return this.getRectCollisionArea(x, y, out);
      case 'circle':
        return this.getCircleCollisionArea(x, y, out);
      case 'laser':
        return this.getLaserCollisionArea(x, y, out);
      default:
        return out ?? [0, 0, 0, 0];
    }
  }

  private getRectCollisionArea(x: number, y: number, out?: RectArea): RectArea {
    const [width, height] = this.size;
    const [offsetX = 0, offsetY = 0] = this.offset || [0, 0];
    const radius = Math.max(width, height) / 2;
    if (out) {
      out[0] = x + offsetX - radius;
      out[1] = y + offsetY - radius;
      out[2] = radius * 2;
      out[3] = radius * 2;
      return out;
    }
    return [x + offsetX - radius, y + offsetY - radius, radius * 2, radius * 2];
  }

  private getCircleCollisionArea(x: number, y: number, out?: RectArea): RectArea {
    const [width, height] = this.size;
    const [offsetX = 0, offsetY = 0] = this.offset || [0, 0];
    if (out) {
      out[0] = x + offsetX - width / 2;
      out[1] = y + offsetY - height / 2;
      out[2] = width;
      out[3] = height;
      return out;
    }
    return [x + offsetX - width / 2, y + offsetY - height / 2, width, height];
  }

  private getLaserCollisionArea(x: number, y: number, out?: RectArea): RectArea {
    if (!this.laser) {
      return out ?? [0, 0, 0, 0];
    }
    const [width, height] = this.size;

    // Use cached direction if available, otherwise calculate
    let dirX: number, dirY: number;
    if (this.laser.cachedDirection) {
      [dirX, dirY] = this.laser.cachedDirection;
    } else {
      // Fallback to calculation if cache is not available
      const dx = this.laser.aim[0] - x;
      const dy = this.laser.aim[1] - y;
      const length = Math.sqrt(dx * dx + dy * dy);
      dirX = dx / length;
      dirY = dy / length;
    }

    // Calculate the bounding box that encompasses the laser path
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    // Calculate the four corners of the bounding box
    const corners = [
      [x - halfWidth, y - halfHeight],
      [x + halfWidth, y - halfHeight],
      [x + halfWidth, y + halfHeight],
      [x - halfWidth, y + halfHeight],
    ];

    // Project corners onto the laser direction
    const minX = Math.min(...corners.map((c) => c[0]));
    const maxX = Math.max(...corners.map((c) => c[0]));
    const minY = Math.min(...corners.map((c) => c[1]));
    const maxY = Math.max(...corners.map((c) => c[1]));

    if (out) {
      out[0] = minX;
      out[1] = minY;
      out[2] = maxX - minX;
      out[3] = maxY - minY;
      return out;
    }
    return [minX, minY, maxX - minX, maxY - minY];
  }

  isTriggerOnly(): boolean {
    return this.isTrigger;
  }

  setColliding(isColliding: boolean, entityId?: string): void {
    this.isColliding = isColliding;
    if (entityId) {
      if (isColliding) {
        this.collidingEntities.add(entityId);
      } else {
        this.collidingEntities.delete(entityId);
      }
    }
  }

  getCollidingEntities(): string[] {
    return Array.from(this.collidingEntities);
  }

  isCurrentlyColliding(): boolean {
    return this.isColliding;
  }

  reset(): void {
    super.reset();
    this.type = 'circle';
    this.size[0] = 0;
    this.size[1] = 0;
    this.offset[0] = 0;
    this.offset[1] = 0;
    this.isTrigger = false;
    this.isColliding = false;
    this.collidingEntities.clear();
    this.laser = undefined;
  }
}
