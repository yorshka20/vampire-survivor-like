import { Point, Vec2 } from '@ecs';

// Existing 2D ray tracing functions (preserved for compatibility)
export class Ray2D {
  origin: Point;
  direction: Vec2;

  constructor(origin: Point, direction: Vec2) {
    this.origin = origin;
    this.direction = this.normalize(direction);
  }

  private normalize(direction: Vec2): Vec2 {
    const length = Math.sqrt(direction[0] * direction[0] + direction[1] * direction[1]);
    if (length === 0) return [0, 0];
    return [direction[0] / length, direction[1] / length];
  }

  pointAt(t: number): Point {
    return [this.origin[0] + t * this.direction[0], this.origin[1] + t * this.direction[1]];
  }
}
