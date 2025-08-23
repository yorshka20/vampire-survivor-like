import { Point, Vec2, Vec3 } from '@ecs';
import { Intersection3D, SerializedEntity } from '@render/rayTracing';
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

  /**
   * Finds the closest intersection in 3D space with a collection of entities.
   * For top-down camera with vertical rays, it checks point-in-shape; otherwise, it uses 2D ray intersection logic.
   * @param ray The 3D ray to test for intersection.
   * @param entities A list of serialized entities to check against.
   * @returns The closest 3D intersection data, or null if no intersection is found.
   */
  static findClosestIntersection3D(
    ray: Ray3D,
    entities: SerializedEntity[],
  ): Intersection3D | null {
    // For topdown camera with vertical rays, we check point-in-shape instead of ray intersection
    if (Math.abs(ray.direction[0]) < 1e-6 && Math.abs(ray.direction[1]) < 1e-6) {
      // Vertical ray - calculate intersection with z=0 plane
      let t = 0;
      if (Math.abs(ray.direction[2]) > 1e-6) {
        t = -ray.origin[2] / ray.direction[2];
      }

      const intersectionPoint = ray.pointAt(t);
      const point2D: Point = [intersectionPoint[0], intersectionPoint[1]];

      // Check if point is inside any entity and find the closest one
      let closestIntersection: Intersection3D | null = null;
      let minDistance = Infinity;

      for (const entity of entities) {
        if (entity.shape.type === 'circle') {
          const dx = point2D[0] - entity.position[0];
          const dy = point2D[1] - entity.position[1];
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance <= entity.shape.radius) {
            // Calculate the actual intersection distance along the ray
            const rayDistance = t;

            if (rayDistance < minDistance) {
              minDistance = rayDistance;

              const normal2D: Vec2 = distance > 1e-6 ? [dx / distance, dy / distance] : [0, 1];

              closestIntersection = {
                point: intersectionPoint,
                normal: [normal2D[0], normal2D[1], 1.0],
                distance: rayDistance,
                entity,
                point2D,
                normal2D,
              };
            }
          }
        }
      }

      return closestIntersection;
    }

    // For non-vertical rays, use original 2D ray logic
    const ray2D = ray.to2D();
    const intersection2D = Ray2D.findClosestIntersection(ray2D, entities);

    if (!intersection2D) return null;

    // Convert back to 3D
    const point3D: Vec3 = [intersection2D.point[0], intersection2D.point[1], 0];
    const normal3D: Vec3 = [intersection2D.normal[0], intersection2D.normal[1], 0];

    return {
      point: point3D,
      normal: normal3D,
      distance: intersection2D.distance,
      entity: intersection2D.entity,
      point2D: intersection2D.point,
      normal2D: intersection2D.normal,
    };
  }

  /**
   * Performs a 3D shadow test to determine if a point is in shadow from a given light source.
   * This function creates a shadow ray from the surface point to the light and checks for intersections with other entities.
   * @param point The point on the surface to test for shadow.
   * @param lightPos The 3D position of the light source.
   * @param entities An array of all serialized entities in the scene, used for checking shadow ray intersections.
   * @param lightDistance The distance from the light source to the point being shaded. This is used to determine if an obstructing object is closer than the light source itself.
   * @param shadedEntity The entity currently being shaded, to prevent self-shadowing.
   * @returns True if the point is in shadow, false otherwise.
   */
  static isInShadow3D(
    point: Vec3,
    lightPos: Vec3,
    entities: SerializedEntity[],
    lightDistance: number,
    shadedEntity: SerializedEntity,
  ): boolean {
    // Create shadow ray from surface point to light
    const shadowDirection: Vec3 = [
      lightPos[0] - point[0],
      lightPos[1] - point[1],
      lightPos[2] - point[2],
    ];

    const distance = Math.sqrt(
      shadowDirection[0] ** 2 + shadowDirection[1] ** 2 + shadowDirection[2] ** 2,
    );

    if (distance === 0) return false;

    // Normalize direction
    shadowDirection[0] /= distance;
    shadowDirection[1] /= distance;
    shadowDirection[2] /= distance;

    // Offset the ray origin slightly to avoid self-intersection
    const epsilon = 1e-3; // Increased epsilon
    const shadowOrigin: Vec3 = [
      point[0] + shadowDirection[0] * epsilon,
      point[1] + shadowDirection[1] * epsilon,
      point[2] + shadowDirection[2] * epsilon,
    ];

    const shadowRay = new Ray3D(shadowOrigin, shadowDirection);
    const intersection = Ray3D.findClosestIntersection3D(shadowRay, entities);

    // For directional lights, any intersection along the shadow ray means it's in shadow
    // For point/spot lights, the intersection must be closer than the light source
    // Also, ensure the shadow ray doesn't hit the object itself
    return (
      intersection !== null &&
      intersection.entity.id !== shadedEntity.id && // Ensure it's not self-shadowing
      (lightDistance === Infinity ? true : intersection.distance < lightDistance - epsilon) // For directional lights, just check if it hits another object
    );
  }
}
