import { Point, Vec3 } from '@ecs';
import { Ray3D } from './ray3d';
import { SerializedCamera } from './types';

export class RayTracingCamera {
  private static instance: RayTracingCamera;

  position: Point;

  fov: number;
  aspectRatio: number;
  nearPlane: number;
  farPlane: number;

  constructor(camera: SerializedCamera) {
    this.position = camera.position;

    this.fov = camera.fov;
    this.aspectRatio = camera.aspect;
    this.nearPlane = camera.near;
    this.farPlane = camera.far;

    RayTracingCamera.instance = this;
  }

  static cameraRayCache: Ray3D[][] = [];

  static getCamera(camera: SerializedCamera) {
    if (this.instance) {
      return this.instance;
    }
    this.instance = new RayTracingCamera(camera);
    return this.instance;
  }

  static generateCameraRay(screenX: number, screenY: number, camera: SerializedCamera): Ray3D {
    // Initialize cache arrays before checking to prevent undefined behavior
    if (!this.cameraRayCache[screenX]) {
      this.cameraRayCache[screenX] = [];
    }

    if (this.cameraRayCache[screenX][screenY]) {
      return this.cameraRayCache[screenX][screenY];
    }

    const ray = generateCameraRay(screenX, screenY, camera);
    this.cameraRayCache[screenX][screenY] = ray;
    return ray;
  }
}

/**
 * Enhanced 3D ray generation based on camera configuration
 */
function generateCameraRay(screenX: number, screenY: number, camera: SerializedCamera): Ray3D {
  // Convert screen coordinates to normalized coordinates
  const normalizedX = screenX / camera.resolution.width;
  const normalizedY = screenY / camera.resolution.height;

  // Map to view bounds
  const worldX =
    camera.viewBounds.left + (camera.viewBounds.right - camera.viewBounds.left) * normalizedX;
  // Fix Y-axis mapping: screen Y=0 should map to top, Y=height should map to bottom
  // Since top=1044.75 and bottom=0, we want:
  // normalizedY=0 (screen top) -> worldY=bottom (0)
  // normalizedY=1 (screen bottom) -> worldY=top (1044.75)
  const worldY =
    camera.viewBounds.bottom + normalizedY * (camera.viewBounds.top - camera.viewBounds.bottom);

  // Debug logging removed - coordinate mapping is now correct

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
function applyCameraRotations(direction: Vec3, camera: SerializedCamera): Vec3 {
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
