import { Point, RgbaColor, Vec2 } from '@ecs/utils';
import { RayTracingWorkerData, SerializedEntity } from '../types';

// Enhanced types for 3D ray tracing support
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Vector2 {
  x: number;
  y: number;
}

// Enhanced interfaces matching the main thread types
export interface EnhancedSerializedLight {
  // Basic properties
  position: [number, number];
  height: number;
  color: RgbaColor;
  intensity: number;
  radius: number;

  // Extended properties
  type: 'point' | 'directional' | 'ambient' | 'spot';
  castShadows: boolean;
  attenuation: 'none' | 'linear' | 'quadratic' | 'realistic';
  direction: [number, number, number];
  spotAngle: number;
  spotPenumbra: number;
  enabled: boolean;
  layer: number;
}

export interface EnhancedSerializedCamera {
  // Basic properties
  position: [number, number];
  fov: number;
  facing: number;

  // 3D support
  height: number;
  pitch: number;
  roll: number;

  // Projection and view settings
  projectionMode: 'perspective' | 'orthographic';
  cameraMode: 'topdown' | 'sideview' | 'custom';
  aspect: number;
  near: number;
  far: number;

  // View bounds and resolution
  viewBounds: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  resolution: {
    width: number;
    height: number;
  };
  zoom: number;
}

// Extended interface for progressive ray tracing worker data
export interface ProgressiveRayTracingWorkerData extends RayTracingWorkerData {
  camera: EnhancedSerializedCamera;
  lights: EnhancedSerializedLight[];
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
 * Enhanced progressive ray tracing handler with 3D camera and lighting support
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

        let color: RgbaColor = { r: 20, g: 20, b: 40, a: 255 }; // Dark blue background

        if (shouldSample) {
          // Generate 3D ray based on camera configuration
          const ray = generateCameraRay(x, y, camera);
          const intersection = findClosestIntersection3D(ray, entityList);

          if (intersection) {
            color = shade3D(intersection, entityList, lights, camera);
          } else {
            // Apply ambient lighting to background
            color = applyAmbientLighting(color, lights);
          }
        }

        // Store the color values (will be 0 for unsampled pixels in first pass)
        pixels[pixelIndex++] = Math.round(Math.min(255, Math.max(0, color.r)));
        pixels[pixelIndex++] = Math.round(Math.min(255, Math.max(0, color.g)));
        pixels[pixelIndex++] = Math.round(Math.min(255, Math.max(0, color.b)));
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
 * Enhanced 3D ray generation based on camera configuration
 */
function generateCameraRay(
  screenX: number,
  screenY: number,
  camera: EnhancedSerializedCamera,
): Ray3D {
  // Convert screen coordinates to normalized coordinates
  const normalizedX = screenX / camera.resolution.width;
  const normalizedY = screenY / camera.resolution.height;

  // Map to view bounds
  const worldX =
    camera.viewBounds.left + (camera.viewBounds.right - camera.viewBounds.left) * normalizedX;
  const worldY =
    camera.viewBounds.top + (camera.viewBounds.bottom - camera.viewBounds.top) * normalizedY;

  const origin: Vector3 = {
    x: camera.position[0],
    y: camera.position[1],
    z: camera.height,
  };

  let direction: Vector3;

  if (camera.cameraMode === 'topdown') {
    // Top-down view: parallel rays pointing down
    direction = { x: 0, y: 0, z: -1 };

    // For orthographic projection in top-down, adjust the ray origin
    if (camera.projectionMode === 'orthographic') {
      origin.x = worldX;
      origin.y = worldY;
    }
  } else if (camera.cameraMode === 'sideview') {
    // Side view: rays from camera position to world points
    direction = {
      x: worldX - origin.x,
      y: worldY - origin.y,
      z: 0 - origin.z,
    };

    // Normalize direction
    const length = Math.sqrt(direction.x ** 2 + direction.y ** 2 + direction.z ** 2);
    if (length > 0) {
      direction.x /= length;
      direction.y /= length;
      direction.z /= length;
    }
  } else {
    // Custom camera mode - implement perspective calculation
    const halfFov = (camera.fov / 2) * (Math.PI / 180);
    const aspectRatio = camera.aspect;

    const screenNormalizedX = (normalizedX * 2 - 1) * aspectRatio;
    const screenNormalizedY = 1 - normalizedY * 2;

    // Create direction in camera space
    const cameraDirection: Vector3 = {
      x: screenNormalizedX * Math.tan(halfFov),
      y: screenNormalizedY * Math.tan(halfFov),
      z: -1,
    };

    // Apply camera rotations (facing, pitch, roll)
    direction = applyCameraRotations(cameraDirection, camera);
  }

  return new Ray3D(origin, direction);
}

/**
 * Apply camera rotations to transform direction from camera space to world space
 */
function applyCameraRotations(direction: Vector3, camera: EnhancedSerializedCamera): Vector3 {
  let result = { ...direction };

  // Apply pitch (rotation around X-axis)
  if (camera.pitch !== 0) {
    const pitchRad = (camera.pitch * Math.PI) / 180;
    const cos = Math.cos(pitchRad);
    const sin = Math.sin(pitchRad);
    const y = result.y * cos - result.z * sin;
    const z = result.y * sin + result.z * cos;
    result.y = y;
    result.z = z;
  }

  // Apply facing (rotation around Z-axis, yaw)
  if (camera.facing !== 0) {
    const facingRad = (camera.facing * Math.PI) / 180;
    const cos = Math.cos(facingRad);
    const sin = Math.sin(facingRad);
    const x = result.x * cos - result.y * sin;
    const y = result.x * sin + result.y * cos;
    result.x = x;
    result.y = y;
  }

  // Apply roll (rotation around Y-axis) - rarely used
  if (camera.roll !== 0) {
    const rollRad = (camera.roll * Math.PI) / 180;
    const cos = Math.cos(rollRad);
    const sin = Math.sin(rollRad);
    const x = result.x * cos + result.z * sin;
    const z = -result.x * sin + result.z * cos;
    result.x = x;
    result.z = z;
  }

  // Normalize the result
  const length = Math.sqrt(result.x ** 2 + result.y ** 2 + result.z ** 2);
  if (length > 0) {
    result.x /= length;
    result.y /= length;
    result.z /= length;
  }

  return result;
}

/**
 * Enhanced 3D ray class
 */
class Ray3D {
  origin: Vector3;
  direction: Vector3;

  constructor(origin: Vector3, direction: Vector3) {
    this.origin = origin;
    this.direction = this.normalize(direction);
  }

  private normalize(direction: Vector3): Vector3 {
    const length = Math.sqrt(
      direction.x * direction.x + direction.y * direction.y + direction.z * direction.z,
    );
    if (length === 0) return { x: 0, y: 0, z: 0 };
    return {
      x: direction.x / length,
      y: direction.y / length,
      z: direction.z / length,
    };
  }

  pointAt(t: number): Vector3 {
    return {
      x: this.origin.x + t * this.direction.x,
      y: this.origin.y + t * this.direction.y,
      z: this.origin.z + t * this.direction.z,
    };
  }

  // Convert to 2D ray for intersection with 2D objects (project to z=0 plane)
  to2D(): Ray2D {
    // Calculate intersection with z=0 plane
    let t = 0;
    if (Math.abs(this.direction.z) > 1e-6) {
      t = -this.origin.z / this.direction.z;
    }

    const intersection2D = this.pointAt(t);
    const origin2D: Point = [intersection2D.x, intersection2D.y];
    const direction2D: Vec2 = [this.direction.x, this.direction.y];

    return new Ray2D(origin2D, direction2D);
  }
}

/**
 * Enhanced 3D intersection interface
 */
interface Intersection3D {
  point: Vector3;
  normal: Vector3;
  distance: number;
  entity: SerializedEntity;
  point2D: Point; // 2D projection for compatibility
  normal2D: Vec2; // 2D normal for compatibility
}

/**
 * Find closest intersection in 3D space
 */
function findClosestIntersection3D(
  ray: Ray3D,
  entities: SerializedEntity[],
): Intersection3D | null {
  // For 2D entities, we intersect with their projection on the z=0 plane
  const ray2D = ray.to2D();

  // Use existing 2D intersection logic
  const intersection2D = findClosestIntersection(ray2D, entities);

  if (!intersection2D) return null;

  // Convert back to 3D
  const point3D: Vector3 = {
    x: intersection2D.point[0],
    y: intersection2D.point[1],
    z: 0, // 2D entities are on z=0 plane
  };

  const normal3D: Vector3 = {
    x: intersection2D.normal[0],
    y: intersection2D.normal[1],
    z: 0, // Normal points in 2D plane
  };

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
 * Enhanced 3D shading with multiple light types
 */
function shade3D(
  intersection: Intersection3D,
  entities: SerializedEntity[],
  lights: EnhancedSerializedLight[],
  camera: EnhancedSerializedCamera,
): RgbaColor {
  let finalColor: RgbaColor = { r: 0, g: 0, b: 0, a: 255 };

  // Base material color (could be enhanced with actual material properties)
  const materialColor: RgbaColor = { r: 200, g: 200, b: 200, a: 255 };

  for (const light of lights) {
    if (!light.enabled) continue;

    const lightContribution = calculateLightContribution(
      intersection,
      light,
      entities,
      materialColor,
    );

    // Add light contribution
    finalColor.r += lightContribution.r;
    finalColor.g += lightContribution.g;
    finalColor.b += lightContribution.b;
  }

  // Clamp colors to valid range
  finalColor.r = Math.min(255, Math.max(0, finalColor.r));
  finalColor.g = Math.min(255, Math.max(0, finalColor.g));
  finalColor.b = Math.min(255, Math.max(0, finalColor.b));

  return finalColor;
}

/**
 * Calculate light contribution for a specific light source
 */
function calculateLightContribution(
  intersection: Intersection3D,
  light: EnhancedSerializedLight,
  entities: SerializedEntity[],
  materialColor: RgbaColor,
): RgbaColor {
  const lightPos3D: Vector3 = {
    x: light.position[0],
    y: light.position[1],
    z: light.height,
  };

  let lightDirection: Vector3;
  let distance: number;

  // Calculate light direction and distance based on light type
  switch (light.type) {
    case 'directional':
      lightDirection = {
        x: -light.direction[0],
        y: -light.direction[1],
        z: -light.direction[2],
      };
      distance = Infinity; // Directional lights have no distance falloff
      break;

    case 'ambient':
      // Ambient light contributes equally from all directions
      const ambientIntensity = light.intensity * 0.3; // Reduced ambient contribution
      return {
        r: (materialColor.r * light.color.r * ambientIntensity) / 255 / 255,
        g: (materialColor.g * light.color.g * ambientIntensity) / 255 / 255,
        b: (materialColor.b * light.color.b * ambientIntensity) / 255 / 255,
        a: 255,
      };

    case 'point':
    case 'spot':
    default:
      const dx = lightPos3D.x - intersection.point.x;
      const dy = lightPos3D.y - intersection.point.y;
      const dz = lightPos3D.z - intersection.point.z;
      distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance === 0) return { r: 0, g: 0, b: 0, a: 255 };

      lightDirection = {
        x: dx / distance,
        y: dy / distance,
        z: dz / distance,
      };
      break;
  }

  // Calculate light intensity with distance attenuation
  let intensity = calculateLightIntensity(intersection.point, light, distance);

  if (intensity <= 0) {
    return { r: 0, g: 0, b: 0, a: 255 };
  }

  // Spot light cone check
  if (light.type === 'spot') {
    const spotFalloff = calculateSpotLightFalloff(lightDirection, light);
    intensity *= spotFalloff;

    if (intensity <= 0) {
      return { r: 0, g: 0, b: 0, a: 255 };
    }
  }

  // Shadow test (if light casts shadows)
  if (light.castShadows) {
    const inShadow = isInShadow3D(intersection.point, lightPos3D, entities, distance);
    if (inShadow) {
      return { r: 0, g: 0, b: 0, a: 255 };
    }
  }

  // Calculate diffuse lighting (Lambertian)
  const dotProduct = Math.max(
    0,
    intersection.normal.x * lightDirection.x +
      intersection.normal.y * lightDirection.y +
      intersection.normal.z * lightDirection.z,
  );

  // Combine material color, light color, and intensity
  const colorScale = (intensity * dotProduct) / 255; // Normalize color values

  return {
    r: (materialColor.r * light.color.r * colorScale) / 255,
    g: (materialColor.g * light.color.g * colorScale) / 255,
    b: (materialColor.b * light.color.b * colorScale) / 255,
    a: 255,
  };
}

/**
 * Calculate light intensity with distance attenuation
 */
function calculateLightIntensity(
  targetPos: Vector3,
  light: EnhancedSerializedLight,
  distance: number,
): number {
  if (!light.enabled || distance > light.radius) return 0;

  let intensity = light.intensity;

  // Apply distance attenuation
  switch (light.attenuation) {
    case 'none':
      break; // No attenuation

    case 'linear':
      intensity *= Math.max(0, 1 - distance / light.radius);
      break;

    case 'quadratic':
      const normalizedDistance = distance / light.radius;
      intensity *= Math.max(0, 1 - normalizedDistance * normalizedDistance);
      break;

    case 'realistic':
      const minDistance = 1;
      const effectiveDistance = Math.max(distance, minDistance);
      const falloff = 1 / (effectiveDistance * effectiveDistance);
      const radiusFalloff = 1 / (light.radius * light.radius);
      intensity *= Math.max(0, falloff - radiusFalloff) / (1 - radiusFalloff);
      break;
  }

  return Math.max(0, intensity);
}

/**
 * Calculate spot light cone falloff
 */
function calculateSpotLightFalloff(
  lightDirection: Vector3,
  light: EnhancedSerializedLight,
): number {
  const spotDir: Vector3 = {
    x: light.direction[0],
    y: light.direction[1],
    z: light.direction[2],
  };

  // Normalize spot direction
  const spotLength = Math.sqrt(spotDir.x ** 2 + spotDir.y ** 2 + spotDir.z ** 2);
  if (spotLength === 0) return 0;

  const normalizedSpotDir: Vector3 = {
    x: spotDir.x / spotLength,
    y: spotDir.y / spotLength,
    z: spotDir.z / spotLength,
  };

  // Calculate angle between light direction and spot direction
  const dotProduct = Math.max(
    -1,
    Math.min(
      1,
      lightDirection.x * normalizedSpotDir.x +
        lightDirection.y * normalizedSpotDir.y +
        lightDirection.z * normalizedSpotDir.z,
    ),
  );

  const angle = (Math.acos(Math.abs(dotProduct)) * 180) / Math.PI;
  const halfAngle = light.spotAngle / 2;
  const penumbraStart = halfAngle - light.spotPenumbra;

  if (angle > halfAngle) {
    return 0; // Outside cone
  } else if (angle < penumbraStart) {
    return 1; // Full intensity
  } else {
    // In penumbra region
    return 1 - (angle - penumbraStart) / light.spotPenumbra;
  }
}

/**
 * Enhanced 3D shadow testing
 */
function isInShadow3D(
  point: Vector3,
  lightPos: Vector3,
  entities: SerializedEntity[],
  lightDistance: number,
): boolean {
  // Create shadow ray from surface point to light
  const shadowDirection: Vector3 = {
    x: lightPos.x - point.x,
    y: lightPos.y - point.y,
    z: lightPos.z - point.z,
  };

  const distance = Math.sqrt(
    shadowDirection.x ** 2 + shadowDirection.y ** 2 + shadowDirection.z ** 2,
  );

  if (distance === 0) return false;

  // Normalize direction
  shadowDirection.x /= distance;
  shadowDirection.y /= distance;
  shadowDirection.z /= distance;

  // Offset the ray origin slightly to avoid self-intersection
  const epsilon = 1e-4;
  const shadowOrigin: Vector3 = {
    x: point.x + shadowDirection.x * epsilon,
    y: point.y + shadowDirection.y * epsilon,
    z: point.z + shadowDirection.z * epsilon,
  };

  const shadowRay = new Ray3D(shadowOrigin, shadowDirection);
  const intersection = findClosestIntersection3D(shadowRay, entities);

  return intersection !== null && intersection.distance < lightDistance - epsilon;
}

/**
 * Apply ambient lighting to background
 */
function applyAmbientLighting(
  backgroundColor: RgbaColor,
  lights: EnhancedSerializedLight[],
): RgbaColor {
  let result = { ...backgroundColor };

  for (const light of lights) {
    if (light.enabled && light.type === 'ambient') {
      const intensity = light.intensity * 0.5; // Reduced for background
      result.r += (light.color.r * intensity) / 255;
      result.g += (light.color.g * intensity) / 255;
      result.b += (light.color.b * intensity) / 255;
    }
  }

  result.r = Math.min(255, Math.max(0, result.r));
  result.g = Math.min(255, Math.max(0, result.g));
  result.b = Math.min(255, Math.max(0, result.b));

  return result;
}

// Sampling functions (unchanged from original)
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

function shouldSamplePixelCheckerboard(
  x: number,
  y: number,
  currentPass: number,
  totalPasses: number,
): boolean {
  const offset = currentPass % totalPasses;
  return (x + y + offset) % totalPasses === 0;
}

function shouldSamplePixelRandom(
  x: number,
  y: number,
  currentPass: number,
  totalPasses: number,
): boolean {
  const seed = x * 9973 + y * 9967 + currentPass * 9949;
  const pseudoRandom = (seed % 1000) / 1000;
  const passRange = 1.0 / totalPasses;
  const passStart = (currentPass % totalPasses) * passRange;
  const passEnd = passStart + passRange;
  return pseudoRandom >= passStart && pseudoRandom < passEnd;
}

// Existing 2D ray tracing functions (preserved for compatibility)
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

interface Intersection {
  point: Point;
  normal: Vec2;
  distance: number;
  entity: SerializedEntity;
}

// Rest of the existing 2D ray tracing functions remain the same...
// (rotatePoint, inverseRotatePoint, rayAABBIntersect, findClosestIntersection, etc.)

function rotatePoint(point: Point, origin: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const translatedX = point[0] - origin[0];
  const translatedY = point[1] - origin[1];

  const rotatedX = translatedX * cos - translatedY * sin;
  const rotatedY = translatedX * sin + translatedY * cos;

  return [rotatedX + origin[0], rotatedY + origin[1]];
}

function inverseRotatePoint(point: Point, origin: Point, angle: number): Point {
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const translatedX = point[0] - origin[0];
  const translatedY = point[1] - origin[1];

  const rotatedX = translatedX * cos - translatedY * sin;
  const rotatedY = translatedX * sin + translatedY * cos;

  return [rotatedX + origin[0], rotatedY + origin[1]];
}

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
      const rectRotation = entity.rotation || 0;

      const invRectRotation = -rectRotation;
      const localRayOrigin = inverseRotatePoint(ray.origin, rectCenter, invRectRotation);
      const localRayDirection: Vec2 = [
        ray.direction[0] * Math.cos(invRectRotation) - ray.direction[1] * Math.sin(invRectRotation),
        ray.direction[0] * Math.sin(invRectRotation) + ray.direction[1] * Math.cos(invRectRotation),
      ];
      const localRay = new Ray2D(localRayOrigin, localRayDirection);

      const aabbMin: Point = [-width / 2, -height / 2];
      const aabbMax: Point = [width / 2, height / 2];

      const aabbIntersection = rayAABBIntersect(localRay, aabbMin, aabbMax);

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

// Vector utility functions
function normalize(v: Vec2): Vec2 {
  const length = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
  if (length === 0) return [0, 0];
  return [v[0] / length, v[1] / length];
}

function dotProduct(v1: Vec2, v2: Vec2): number {
  return v1[0] * v2[0] + v1[1] * v2[1];
}

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
    const epsilon = 1e-4;
    return t > epsilon ? t : null;
  }
}
