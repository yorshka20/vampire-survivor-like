import { Point, Vec2 } from '@ecs';
import { Intersection2D, SerializedEntity } from './types';

// Existing 2D ray tracing functions (preserved for compatibility)
export class Ray2D {
  origin: Point;
  direction: Vec2;

  constructor(origin: Point, direction: Vec2) {
    this.origin = origin;
    this.direction = Ray2D.normalize(direction);
  }

  /**
   * Normalizes a 2D vector.
   * @param direction The vector to normalize.
   * @returns The normalized vector.
   */
  static normalize(direction: Vec2): Vec2 {
    const length = Math.sqrt(direction[0] * direction[0] + direction[1] * direction[1]);
    if (length === 0) return [0, 0];
    return [direction[0] / length, direction[1] / length];
  }

  pointAt(t: number): Point {
    return [this.origin[0] + t * this.direction[0], this.origin[1] + t * this.direction[1]];
  }

  /**
   * Calculates the intersection of a 2D ray with an Axis-Aligned Bounding Box (AABB).
   * @param ray The 2D ray.
   * @param aabbMin The minimum corner of the AABB.
   * @param aabbMax The maximum corner of the AABB.
   * @returns The intersection distance and normal, or null if no intersection.
   */
  static rayAABBIntersect(
    ray: Ray2D,
    aabbMin: Point,
    aabbMax: Point,
  ): { t: number; normal: Vec2 } | null {
    const { origin, direction } = ray;

    let tmin = -Infinity;
    let tmax = Infinity;

    let normal: Vec2 = [0, 0];
    let currentNormal: Vec2 = [0, 0];

    for (let i = 0; i < 2; i++) {
      const invD = direction[i] === 0 ? Infinity : 1 / direction[i];
      let t0 = (aabbMin[i] - origin[i]) * invD;
      let t1 = (aabbMax[i] - origin[i]) * invD;

      if (invD < 0) {
        [t0, t1] = [t1, t0];
      }

      if (t0 > tmin) {
        tmin = t0;
        currentNormal = [0, 0];
        currentNormal[i] = invD < 0 ? 1 : -1;
        normal = currentNormal;
      }
      if (t1 < tmax) {
        tmax = t1;
      }

      if (tmin > tmax) return null;
    }

    const epsilon = 1e-4;
    if (tmin > epsilon) {
      return { t: tmin, normal };
    }
    return null;
  }

  /**
   * Calculates the dot product of two 2D vectors.
   * @param v1 The first vector.
   * @param v2 The second vector.
   * @returns The dot product.
   */
  static dotProduct(v1: Vec2, v2: Vec2): number {
    return v1[0] * v2[0] + v1[1] * v2[1];
  }

  /**
   * Calculates the intersection of a 2D ray with a circle.
   * @param ray The 2D ray.
   * @param circle The circle object with center and radius.
   * @returns The intersection distance (t value), or null if no intersection.
   */
  static rayCircleIntersect(ray: Ray2D, circle: { center: Point; radius: number }): number | null {
    const oc: Vec2 = [ray.origin[0] - circle.center[0], ray.origin[1] - circle.center[1]];
    const a = Ray2D.dotProduct(ray.direction, ray.direction);
    const b = 2.0 * Ray2D.dotProduct(oc, ray.direction);
    const c = Ray2D.dotProduct(oc, oc) - circle.radius * circle.radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
      return null;
    } else {
      const t = (-b - Math.sqrt(discriminant)) / (2.0 * a);
      const epsilon = 1e-4;
      return t > epsilon ? t : null;
    }
  }

  /**
   * Rotates a point around an origin by a given angle.
   * @param point The point to rotate.
   * @param origin The origin of rotation.
   * @param angle The angle in radians.
   * @returns The rotated point.
   */
  static rotatePoint(point: Point, origin: Point, angle: number): Point {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const translatedX = point[0] - origin[0];
    const translatedY = point[1] - origin[1];

    const rotatedX = translatedX * cos - translatedY * sin;
    const rotatedY = translatedX * sin + translatedY * cos;

    return [rotatedX + origin[0], rotatedY + origin[1]];
  }

  /**
   * Rotates a point around an origin by a given angle in the inverse direction.
   * @param point The point to rotate.
   * @param origin The origin of rotation.
   * @param angle The angle in radians.
   * @returns The inverse rotated point.
   */
  static inverseRotatePoint(point: Point, origin: Point, angle: number): Point {
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const translatedX = point[0] - origin[0];
    const translatedY = point[1] - origin[1];

    const rotatedX = translatedX * cos - translatedY * sin;
    const rotatedY = translatedX * sin + translatedY * cos;

    return [rotatedX + origin[0], rotatedY + origin[1]];
  }

  /**
   * Finds the closest 2D intersection of a ray with a list of entities.
   * @param ray The 2D ray to test.
   * @param entities The list of entities to check for intersection.
   * @returns The closest intersection point and related data, or null if no intersection is found.
   */
  static findClosestIntersection(ray: Ray2D, entities: SerializedEntity[]): Intersection2D | null {
    let closestIntersection: Intersection2D | null = null;
    let minDistance = Infinity;

    for (const entity of entities) {
      let intersectionDistance: number | null = null;
      let normal: Vec2 = [0, 0];

      if (entity.shape.type === 'circle') {
        const circle = {
          center: entity.position,
          radius: entity.shape.radius,
        };

        const t = Ray2D.rayCircleIntersect(ray, circle);

        if (t !== null && t < minDistance) {
          intersectionDistance = t;
          const intersectionPoint = ray.pointAt(t);
          normal = Ray2D.normalize([
            intersectionPoint[0] - circle.center[0],
            intersectionPoint[1] - circle.center[1],
          ]);
        }
      } else if (entity.shape.type === 'rect') {
        const { width, height } = entity.shape;
        const rectCenter = entity.position;
        const rectRotation = entity.rotation || 0;

        const invRectRotation = -rectRotation;
        const localRayOrigin = Ray2D.inverseRotatePoint(ray.origin, rectCenter, invRectRotation);
        const localRayDirection: Vec2 = [
          ray.direction[0] * Math.cos(invRectRotation) -
            ray.direction[1] * Math.sin(invRectRotation),
          ray.direction[0] * Math.sin(invRectRotation) +
            ray.direction[1] * Math.cos(invRectRotation),
        ];
        const localRay = new Ray2D(localRayOrigin, localRayDirection);

        const aabbMin: Point = [-width / 2, -height / 2];
        const aabbMax: Point = [width / 2, height / 2];

        const aabbIntersection = Ray2D.rayAABBIntersect(localRay, aabbMin, aabbMax);

        if (aabbIntersection !== null && aabbIntersection.t < minDistance) {
          intersectionDistance = aabbIntersection.t;
          normal = [
            aabbIntersection.normal[0] * Math.cos(rectRotation) -
              aabbIntersection.normal[1] * Math.sin(rectRotation),
            aabbIntersection.normal[0] * Math.sin(rectRotation) +
              aabbIntersection.normal[1] * Math.cos(rectRotation),
          ];
        }
      }

      if (intersectionDistance !== null && intersectionDistance < minDistance) {
        minDistance = intersectionDistance;
        closestIntersection = {
          point: ray.pointAt(intersectionDistance),
          normal,
          distance: intersectionDistance,
          entity,
        };
      }
    }

    return closestIntersection;
  }
}
