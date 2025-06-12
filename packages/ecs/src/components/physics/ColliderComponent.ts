import { Component } from '@ecs/core/ecs/Component';
import { Point, RectArea } from '@ecs/utils/types';
import { MovementComponent } from './MovementComponent';

export interface ColliderProps {
  type: 'circle' | 'rect';
  size: [number, number];
  offset?: [number, number];
  isTrigger?: boolean; // Whether this collider should only trigger events without physical collision
}

export class ColliderComponent extends Component {
  static componentName = 'Collider';
  type: 'circle' | 'rect';
  size: [number, number];
  offset: [number, number];
  private isTrigger: boolean; // If true, this collider will only trigger events without physical collision
  private isColliding: boolean = false; // Current collision state of this collider
  private collidingEntities: Set<string> = new Set(); // Set of entity IDs that are currently colliding with this collider

  constructor(props: ColliderProps) {
    super(ColliderComponent.componentName);
    this.type = props.type;
    this.size = props.size;
    this.offset = props.offset || [0, 0];
    this.isTrigger = props.isTrigger || false;
  }

  getBounds(): { x: number; y: number; width: number; height: number } {
    const position = this.entity?.getComponent<MovementComponent>('MovementComponent')
      ?.position || {
      x: 0,
      y: 0,
    };
    return {
      x: position.x + this.offset[0],
      y: position.y + this.offset[1],
      width: this.size[0],
      height: this.size[1],
    };
  }

  getCollider(): ColliderProps {
    return {
      type: this.type,
      size: this.size,
      offset: this.offset,
    };
  }

  getCollisionArea(position: Point, out?: RectArea): RectArea {
    const [x, y] = position;
    const [width, height] = this.size;
    const [offsetX = 0, offsetY = 0] = this.offset || [0, 0];

    if (this.type === 'circle') {
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

    if (out) {
      out[0] = x + offsetX - width / 2;
      out[1] = y + offsetY - height / 2;
      out[2] = width;
      out[3] = height;
      return out;
    }
    return [x + offsetX - width / 2, y + offsetY - height / 2, width, height];
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
    this.type = 'circle';
    this.size = [0, 0];
    this.offset = [0, 0];
    this.isTrigger = false;
    this.isColliding = false;
    this.collidingEntities.clear();
  }
}
