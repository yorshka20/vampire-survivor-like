import { Point, Vec2, Vec3 } from '@ecs';
import { Ray2D } from './ray2d';

/**
 * Enhanced 3D ray class
 */
export class Ray3D {
  origin: Vec3;
  direction: Vec3;

  constructor(origin: Vec3, direction: Vec3) {
    this.origin = origin;
    this.direction = this.normalize(direction);
  }

  private normalize(direction: Vec3): Vec3 {
    const length = Math.sqrt(
      direction[0] * direction[0] + direction[1] * direction[1] + direction[2] * direction[2],
    );
    if (length === 0) return [0, 0, 0];
    return [direction[0] / length, direction[1] / length, direction[2] / length];
  }

  pointAt(t: number): Vec3 {
    return [
      this.origin[0] + t * this.direction[0],
      this.origin[1] + t * this.direction[1],
      this.origin[2] + t * this.direction[2],
    ];
  }

  // Convert to 2D ray for intersection with 2D objects (project to z=0 plane)
  to2D(): Ray2D {
    // Calculate intersection with z=0 plane
    let t = 0;
    if (Math.abs(this.direction[2]) > 1e-6) {
      t = -this.origin[2] / this.direction[2];
    }

    const intersection2D = this.pointAt(t);
    const origin2D: Point = [intersection2D[0], intersection2D[1]];
    const direction2D: Vec2 = [this.direction[0], this.direction[1]];

    return new Ray2D(origin2D, direction2D);
  }
}
