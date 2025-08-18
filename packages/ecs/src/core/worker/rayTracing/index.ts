import { Point, RgbaColor, Vec2 } from '@ecs/utils';
import { RayTracingWorkerData, SerializedEntity, SerializedLight } from '../types';

// Extended interface for progressive ray tracing worker data
export interface ProgressiveRayTracingWorkerData extends RayTracingWorkerData {
  sampling: {
    currentPass: number;
    totalPasses: number;
    pattern: 'checkerboard' | 'random';
  };
}

// Extended tile result that includes sampling information
export interface ProgressiveTileResult {
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: number[];
  sampledPixels: boolean[]; // Track which pixels were sampled in this pass
}

/**
 * Progressive ray tracing handler that samples only a subset of pixels per pass
 */
export function handleRayTracing(data: ProgressiveRayTracingWorkerData): ProgressiveTileResult[] {
  const { entities, lights, camera, viewport, cameraOffset, tiles, sampling } = data;
  const entityList = Object.values(entities);
  const tileResults: ProgressiveTileResult[] = [];

  for (const tile of tiles) {
    // Initialize pixel and sampling arrays
    const pixels = new Array(tile.width * tile.height * 4).fill(0);
    const sampledPixels = new Array(tile.width * tile.height).fill(false);
    let pixelIndex = 0;

    for (let j = 0; j < tile.height; j++) {
      for (let i = 0; i < tile.width; i++) {
        const x = tile.x + i;
        const y = tile.y + j;
        const currentPixelIndex = j * tile.width + i;

        // Check if this pixel should be sampled in the current pass
        const shouldSample = shouldSamplePixel(
          x,
          y,
          sampling.currentPass,
          sampling.totalPasses,
          sampling.pattern,
        );
        sampledPixels[currentPixelIndex] = shouldSample;

        let color: RgbaColor = { r: 0, g: 0, b: 0, a: 255 }; // Default background color

        if (shouldSample) {
          // Perform ray tracing for this pixel
          const ray = createPrimaryRay(x, y, viewport, camera);
          const intersection = findClosestIntersection(ray, entityList);

          if (intersection) {
            color = shade(intersection, entityList, lights);
          }
        }

        // Store the color values (will be 0 for unsampled pixels)
        pixels[pixelIndex++] = color.r;
        pixels[pixelIndex++] = color.g;
        pixels[pixelIndex++] = color.b;
        pixels[pixelIndex++] = color.a;
      }
    }

    tileResults.push({
      x: tile.x,
      y: tile.y,
      width: tile.width,
      height: tile.height,
      pixels,
      sampledPixels,
    });
  }

  return tileResults;
}

/**
 * Determines whether a pixel should be sampled in the current pass based on the sampling pattern
 */
function shouldSamplePixel(
  x: number,
  y: number,
  currentPass: number,
  totalPasses: number,
  pattern: 'checkerboard' | 'random',
): boolean {
  switch (pattern) {
    case 'checkerboard':
      return shouldSamplePixelCheckerboard(x, y, currentPass, totalPasses);
    case 'random':
      return shouldSamplePixelRandom(x, y, currentPass, totalPasses);
    default:
      return shouldSamplePixelCheckerboard(x, y, currentPass, totalPasses);
  }
}

/**
 * Checkerboard sampling pattern - distributes pixels evenly across passes
 */
function shouldSamplePixelCheckerboard(
  x: number,
  y: number,
  currentPass: number,
  totalPasses: number,
): boolean {
  // Create an offset based on the current pass to ensure different pixels are sampled each time
  const offset = currentPass % totalPasses;
  return (x + y + offset) % totalPasses === 0;
}

/**
 * Random sampling pattern - uses pseudo-random distribution
 */
function shouldSamplePixelRandom(
  x: number,
  y: number,
  currentPass: number,
  totalPasses: number,
): boolean {
  // Use pixel coordinates and pass number to generate a deterministic pseudo-random value
  const seed = x * 9973 + y * 9967 + currentPass * 9949;
  const pseudoRandom = (seed % 1000) / 1000;

  // Sample this pixel if the random value falls within the current pass's range
  const passRange = 1.0 / totalPasses;
  const passStart = (currentPass % totalPasses) * passRange;
  const passEnd = passStart + passRange;

  return pseudoRandom >= passStart && pseudoRandom < passEnd;
}

// Helper classes and functions for ray tracing (unchanged from original)
class Ray2D {
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

/**
 * Rotates a point around an origin by a given angle (in radians).
 */
function rotatePoint(point: Point, origin: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const translatedX = point[0] - origin[0];
  const translatedY = point[1] - origin[1];

  const rotatedX = translatedX * cos - translatedY * sin;
  const rotatedY = translatedX * sin + translatedY * cos;

  return [rotatedX + origin[0], rotatedY + origin[1]];
}

/**
 * Inverse rotates a point around an origin by a given angle (in radians).
 */
function inverseRotatePoint(point: Point, origin: Point, angle: number): Point {
  const cos = Math.cos(-angle); // Inverse rotation
  const sin = Math.sin(-angle);
  const translatedX = point[0] - origin[0];
  const translatedY = point[1] - origin[1];

  const rotatedX = translatedX * cos - translatedY * sin;
  const rotatedY = translatedX * sin + translatedY * cos;

  return [rotatedX + origin[0], rotatedY + origin[1]];
}

/**
 * Calculates the intersection of a ray with an axis-aligned bounding box (AABB).
 * Returns the distance to the intersection and the normal at the intersection point,
 * or null if no intersection.
 */
function rayAABBIntersect(
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
    const invD = 1 / direction[i];
    let t0 = (aabbMin[i] - origin[i]) * invD;
    let t1 = (aabbMax[i] - origin[i]) * invD;

    if (invD < 0) {
      [t0, t1] = [t1, t0]; // Swap t0 and t1
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

    if (tmin > tmax) return null; // No intersection
  }

  const epsilon = 1e-4;
  if (tmin > epsilon) {
    return { t: tmin, normal };
  }
  return null;
}

function createPrimaryRay(x: number, y: number, viewport: number[], camera: any): Ray2D {
  const halfFov = (camera.fov / 2) * (Math.PI / 180);
  const aspectRatio = viewport[2] / viewport[3];

  const screenX = ((x / viewport[2]) * 2 - 1) * aspectRatio;
  const screenY = 1 - (y / viewport[3]) * 2;

  const direction: Vec2 = [screenX * Math.tan(halfFov), screenY * Math.tan(halfFov)];

  // Rotate direction based on camera facing
  const angle = camera.facing * (Math.PI / 180);
  const rotatedDirection: Vec2 = [
    direction[0] * Math.cos(angle) - direction[1] * Math.sin(angle),
    direction[0] * Math.sin(angle) + direction[1] * Math.cos(angle),
  ];

  return new Ray2D(camera.position, rotatedDirection);
}

interface Intersection {
  point: Point;
  normal: Vec2;
  distance: number;
  entity: SerializedEntity;
}

function findClosestIntersection(ray: Ray2D, entities: SerializedEntity[]): Intersection | null {
  let closestIntersection: Intersection | null = null;
  let minDistance = Infinity;

  for (const entity of entities) {
    let intersectionDistance: number | null = null;
    let normal: Vec2 = [0, 0];

    if (entity.shape.type === 'circle') {
      const circle = {
        center: entity.position,
        radius: entity.shape.radius,
      };

      const t = rayCircleIntersect(ray, circle);

      if (t !== null && t < minDistance) {
        intersectionDistance = t;
        const intersectionPoint = ray.pointAt(t);
        normal = normalize([
          intersectionPoint[0] - circle.center[0],
          intersectionPoint[1] - circle.center[1],
        ]);
      }
    } else if (entity.shape.type === 'rect') {
      const { width, height } = entity.shape;
      const rectCenter = entity.position;
      const rectRotation = entity.rotation || 0; // Use entity rotation, default to 0

      // Transform ray to local space of the rectangle
      const invRectRotation = -rectRotation;
      const localRayOrigin = inverseRotatePoint(ray.origin, rectCenter, invRectRotation);
      const localRayDirection: Vec2 = [
        ray.direction[0] * Math.cos(invRectRotation) - ray.direction[1] * Math.sin(invRectRotation),
        ray.direction[0] * Math.sin(invRectRotation) + ray.direction[1] * Math.cos(invRectRotation),
      ];
      const localRay = new Ray2D(localRayOrigin, localRayDirection);

      // Define the AABB in local space
      const aabbMin: Point = [-width / 2, -height / 2];
      const aabbMax: Point = [width / 2, height / 2];

      const aabbIntersection = rayAABBIntersect(localRay, aabbMin, aabbMax);

      if (aabbIntersection !== null && aabbIntersection.t < minDistance) {
        intersectionDistance = aabbIntersection.t;
        // Transform normal back to world space
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

function shade(
  intersection: Intersection,
  entities: SerializedEntity[],
  lights: SerializedLight[],
): RgbaColor {
  let finalColor: RgbaColor = { r: 0, g: 0, b: 0, a: 255 };

  for (const light of lights) {
    const lightDirection: Vec2 = [
      light.position[0] - intersection.point[0],
      light.position[1] - intersection.point[1],
    ];
    const distanceToLight = Math.sqrt(
      lightDirection[0] * lightDirection[0] + lightDirection[1] * lightDirection[1],
    );
    const normalizedLightDirection = normalize(lightDirection);

    // Offset the shadow ray origin slightly along the normal to avoid self-intersection
    const shadowRayOrigin: Point = [
      intersection.point[0] + intersection.normal[0] * 1e-4,
      intersection.point[1] + intersection.normal[1] * 1e-4,
    ];

    const shadowRay = new Ray2D(shadowRayOrigin, normalizedLightDirection);
    const inShadow = findClosestIntersection(shadowRay, entities);

    if (!inShadow || inShadow.distance > distanceToLight) {
      // Not in shadow or intersection is further than the light
      const dot = Math.max(0, dotProduct(intersection.normal, normalizedLightDirection));
      const intensity = light.intensity * (1 - distanceToLight / light.radius);
      if (intensity > 0) {
        finalColor.r += light.color.r * dot * intensity;
        finalColor.g += light.color.g * dot * intensity;
        finalColor.b += light.color.b * dot * intensity;
      }
    }
  }

  // Clamp colors
  finalColor.r = Math.min(255, finalColor.r);
  finalColor.g = Math.min(255, finalColor.g);
  finalColor.b = Math.min(255, finalColor.b);

  return finalColor;
}

// Vector utility functions
function normalize(v: Vec2): Vec2 {
  const length = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
  if (length === 0) return [0, 0];
  return [v[0] / length, v[1] / length];
}

function dotProduct(v1: Vec2, v2: Vec2): number {
  return v1[0] * v2[0] + v1[1] * v2[1];
}

// Intersection functions (assuming they are not in a separate module in the worker scope)
function rayCircleIntersect(ray: Ray2D, circle: { center: Point; radius: number }): number | null {
  const oc: Vec2 = [ray.origin[0] - circle.center[0], ray.origin[1] - circle.center[1]];
  const a = dotProduct(ray.direction, ray.direction);
  const b = 2.0 * dotProduct(oc, ray.direction);
  const c = dotProduct(oc, oc) - circle.radius * circle.radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return null;
  } else {
    const t = (-b - Math.sqrt(discriminant)) / (2.0 * a);
    const epsilon = 1e-4; // Small epsilon to avoid self-intersection issues
    return t > epsilon ? t : null;
  }
}
