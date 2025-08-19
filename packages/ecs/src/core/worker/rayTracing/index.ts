import { Point, RgbaColor, Vec2, Vec3 } from '@ecs/utils';
import { RayTracingWorkerData, SerializedEntity } from '../types';

// Enhanced types for 3D ray tracing support

const opacity = 100;

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

  // console.log('[Worker] Ray tracing started with:', {
  //   entitiesCount: entityList.length,
  //   lightsCount: lights.length,
  //   tilesCount: tiles.length,
  //   viewport,
  //   camera: camera.position,
  //   sampling,
  //   entities: entityList.map((e) => ({
  //     id: e.id,
  //     position: e.position,
  //     shape: e.shape,
  //   })),
  // });

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

        let color: RgbaColor = { r: 0, g: 0, b: 0, a: opacity }; // Dark blue background

        if (shouldSample) {
          // Generate 3D ray based on camera configuration
          const ray = generateCameraRay(x, y, camera);
          const intersection = findClosestIntersection3D(ray, entityList);

          if (intersection) {
            color = shade3D(intersection, entityList, lights, camera);
            // Debug removed for performance
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

  // console.log('[Worker] Ray tracing completed, returning', tileResults.length, 'tiles');

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

  const origin: Vec3 = [camera.position[0], camera.position[1], camera.height];

  let direction: Vec3;

  if (camera.cameraMode === 'topdown') {
    // Top-down view: parallel rays pointing down
    direction = [0, 0, -1];

    // For orthographic projection in top-down, adjust the ray origin
    if (camera.projectionMode === 'orthographic') {
      origin[0] = worldX;
      origin[1] = worldY;
    }
  } else if (camera.cameraMode === 'sideview') {
    // Side view: rays from camera position to world points
    direction = [worldX - origin[0], worldY - origin[1], 0 - origin[2]];

    // Normalize direction
    const length = Math.sqrt(direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2);
    if (length > 0) {
      direction[0] /= length;
      direction[1] /= length;
      direction[2] /= length;
    }
  } else {
    // Custom camera mode - implement perspective calculation
    const halfFov = (camera.fov / 2) * (Math.PI / 180);
    const aspectRatio = camera.aspect;

    const screenNormalizedX = (normalizedX * 2 - 1) * aspectRatio;
    const screenNormalizedY = 1 - normalizedY * 2;

    // Create direction in camera space
    const cameraDirection: Vec3 = [
      screenNormalizedX * Math.tan(halfFov),
      screenNormalizedY * Math.tan(halfFov),
      -1,
    ];

    // Apply camera rotations (facing, pitch, roll)
    direction = applyCameraRotations(cameraDirection, camera);
  }

  return new Ray3D(origin, direction);
}

/**
 * Apply camera rotations to transform direction from camera space to world space
 */
function applyCameraRotations(direction: Vec3, camera: EnhancedSerializedCamera): Vec3 {
  let result: Vec3 = [...direction];

  // Apply pitch (rotation around X-axis)
  if (camera.pitch !== 0) {
    const pitchRad = (camera.pitch * Math.PI) / 180;
    const cos = Math.cos(pitchRad);
    const sin = Math.sin(pitchRad);
    const y = result[1] * cos - result[2] * sin;
    const z = result[1] * sin + result[2] * cos;
    result[1] = y;
    result[2] = z;
  }

  // Apply facing (rotation around Z-axis, yaw)
  if (camera.facing !== 0) {
    const facingRad = (camera.facing * Math.PI) / 180;
    const cos = Math.cos(facingRad);
    const sin = Math.sin(facingRad);
    const x = result[0] * cos - result[1] * sin;
    const y = result[0] * sin + result[1] * cos;
    result[0] = x;
    result[1] = y;
  }

  // Apply roll (rotation around Y-axis) - rarely used
  if (camera.roll !== 0) {
    const rollRad = (camera.roll * Math.PI) / 180;
    const cos = Math.cos(rollRad);
    const sin = Math.sin(rollRad);
    const x = result[0] * cos + result[2] * sin;
    const z = -result[0] * sin + result[2] * cos;
    result[0] = x;
    result[2] = z;
  }

  // Normalize the result
  const length = Math.sqrt(result[0] ** 2 + result[1] ** 2 + result[2] ** 2);
  if (length > 0) {
    result[0] /= length;
    result[1] /= length;
    result[2] /= length;
  }

  return result;
}

/**
 * Enhanced 3D ray class
 */
class Ray3D {
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

/**
 * Enhanced 3D intersection interface
 */
interface Intersection3D {
  point: Vec3;
  normal: Vec3;
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
  // For topdown camera with vertical rays, we check point-in-shape instead of ray intersection
  if (Math.abs(ray.direction[0]) < 1e-6 && Math.abs(ray.direction[1]) < 1e-6) {
    // Vertical ray - calculate intersection with z=0 plane
    let t = 0;
    if (Math.abs(ray.direction[2]) > 1e-6) {
      t = -ray.origin[2] / ray.direction[2];
    }

    const intersectionPoint = ray.pointAt(t);
    const point2D: Point = [intersectionPoint[0], intersectionPoint[1]];

    // Check if point is inside any entity
    for (const entity of entities) {
      if (entity.shape.type === 'circle') {
        const dx = point2D[0] - entity.position[0];
        const dy = point2D[1] - entity.position[1];
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= entity.shape.radius) {
          // Found intersection - calculate normal pointing outward from circle center
          const normal2D: Vec2 = distance > 1e-6 ? [dx / distance, dy / distance] : [0, 1];

          return {
            point: intersectionPoint,
            normal: [normal2D[0], normal2D[1], 0],
            distance: t,
            entity,
            point2D,
            normal2D,
          };
        }
      }
      // Add more shape types here if needed
    }

    return null;
  }

  // For non-vertical rays, use original 2D ray logic
  const ray2D = ray.to2D();
  const intersection2D = findClosestIntersection(ray2D, entities);

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
 * Enhanced 3D shading with multiple light types
 */
function shade3D(
  intersection: Intersection3D,
  entities: SerializedEntity[],
  lights: EnhancedSerializedLight[],
  camera: EnhancedSerializedCamera,
): RgbaColor {
  let finalColor: RgbaColor = { r: 0, g: 0, b: 0, a: opacity };

  // Base material color
  const materialColor: RgbaColor = { r: 255, g: 100, b: 100, a: opacity };

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

  // Add some ambient lighting to ensure visibility
  const ambient = 0.3;
  finalColor.r += materialColor.r * ambient;
  finalColor.g += materialColor.g * ambient;
  finalColor.b += materialColor.b * ambient;

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
  const lightPos3D: Vec3 = [light.position[0], light.position[1], light.height];

  let lightDirection: Vec3;
  let distance: number;

  // Calculate light direction and distance based on light type
  switch (light.type) {
    case 'directional':
      lightDirection = [-light.direction[0], -light.direction[1], -light.direction[2]];
      distance = Infinity; // Directional lights have no distance falloff
      // Debug removed for performance
      break;

    case 'ambient':
      // Ambient light contributes equally from all directions
      const ambientIntensity = light.intensity * 0.3; // Reduced ambient contribution
      return {
        r: (materialColor.r * light.color.r * ambientIntensity) / 255 / 255,
        g: (materialColor.g * light.color.g * ambientIntensity) / 255 / 255,
        b: (materialColor.b * light.color.b * ambientIntensity) / 255 / 255,
        a: opacity,
      };

    case 'point':
    case 'spot':
    default:
      const dx = lightPos3D[0] - intersection.point[0];
      const dy = lightPos3D[1] - intersection.point[1];
      const dz = lightPos3D[2] - intersection.point[2];
      distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance === 0) return { r: 0, g: 0, b: 0, a: opacity };

      lightDirection = [dx / distance, dy / distance, dz / distance];
      break;
  }

  // Calculate light intensity with distance attenuation
  let intensity = calculateLightIntensity(intersection.point, light, distance);

  // Debug removed for performance

  if (intensity <= 0) {
    return { r: 0, g: 0, b: 0, a: opacity };
  }

  // Spot light cone check
  if (light.type === 'spot') {
    const spotFalloff = calculateSpotLightFalloff(lightDirection, light);
    intensity *= spotFalloff;

    if (intensity <= 0) {
      return { r: 0, g: 0, b: 0, a: opacity };
    }
  }

  // Shadow test (if light casts shadows)
  if (light.castShadows) {
    const inShadow = isInShadow3D(intersection.point, lightPos3D, entities, distance);
    if (inShadow) {
      return { r: 0, g: 0, b: 0, a: opacity };
    }
  }

  // Calculate diffuse lighting (Lambertian)
  const dotProduct = Math.max(
    0,
    intersection.normal[0] * lightDirection[0] +
      intersection.normal[1] * lightDirection[1] +
      intersection.normal[2] * lightDirection[2],
  );

  // Calculate final light contribution
  const lightContrib = intensity * Math.max(0.1, dotProduct); // Small ambient term

  return {
    r: Math.min(255, materialColor.r * lightContrib),
    g: Math.min(255, materialColor.g * lightContrib),
    b: Math.min(255, materialColor.b * lightContrib),
    a: opacity,
  };
}

/**
 * Calculate light intensity with distance attenuation
 */
function calculateLightIntensity(
  targetPos: Vec3,
  light: EnhancedSerializedLight,
  distance: number,
): number {
  if (!light.enabled) return 0;

  // Directional lights have infinite range
  if (light.type === 'directional') {
    return light.intensity;
  }

  // Other light types check distance
  if (distance > light.radius) return 0;

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
function calculateSpotLightFalloff(lightDirection: Vec3, light: EnhancedSerializedLight): number {
  const spotDir: Vec3 = [...light.direction];

  // Normalize spot direction
  const spotLength = Math.sqrt(spotDir[0] ** 2 + spotDir[1] ** 2 + spotDir[2] ** 2);
  if (spotLength === 0) return 0;

  const normalizedSpotDir: Vec3 = [
    spotDir[0] / spotLength,
    spotDir[1] / spotLength,
    spotDir[2] / spotLength,
  ];

  // Calculate angle between light direction and spot direction
  const dotProduct = Math.max(
    -1,
    Math.min(
      1,
      lightDirection[0] * normalizedSpotDir[0] +
        lightDirection[1] * normalizedSpotDir[1] +
        lightDirection[2] * normalizedSpotDir[2],
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
  point: Vec3,
  lightPos: Vec3,
  entities: SerializedEntity[],
  lightDistance: number,
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
  const epsilon = 1e-4;
  const shadowOrigin: Vec3 = [
    point[0] + shadowDirection[0] * epsilon,
    point[1] + shadowDirection[1] * epsilon,
    point[2] + shadowDirection[2] * epsilon,
  ];

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
