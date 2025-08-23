import { Component } from '@ecs/core/ecs/Component';
import { Resolution, Vec2, Vec3, ViewBounds } from '@ecs/types/types';
import { SerializedCamera, SerializedRay } from '@render/rayTracing/base/types';

export type ProjectionMode = 'perspective' | 'orthographic';
export type CameraMode = 'topdown' | 'sideview' | 'custom';

export interface Camera3DProps {
  fov?: number;
  facing?: number;
  position?: [number, number];
  height?: number;
  pitch?: number;
  projectionMode?: ProjectionMode;
  cameraMode?: CameraMode;
  resolution?: Resolution;
  viewBounds?: ViewBounds;
  isActive?: boolean;
}

export class Camera3DComponent extends Component {
  static componentName = 'Camera';

  // 基础属性（保持你的原有设计）
  public fov = 90; // Field of view in degrees
  public facing = 0; // Angle in degrees (yaw rotation)
  public position: [number, number] = [0, 0]; // [x, y] 2D position

  // 新增3D支持属性
  public height = 0; // Z坐标，0表示在场景平面上
  public pitch = 0; // 俯仰角（上下看的角度）
  public roll = 0; // 翻滚角（很少用到）

  // 投影和渲染设置
  public projectionMode: ProjectionMode = 'perspective';
  public cameraMode: CameraMode = 'sideview';
  public aspect = 16 / 9; // 宽高比
  public near = 0.1;
  public far = 1000;

  // 视野范围（用于光线追踪采样）
  public viewBounds: ViewBounds = { left: -10, right: 10, top: 10, bottom: -10 };
  public resolution: Resolution = { width: 800, height: 600 };

  // 控制属性
  public isActive = true;
  public zoom = 1.0;

  constructor(props: Camera3DProps = {}) {
    super('Camera');

    // 使用提供的值或默认值
    this.fov = props.fov ?? 90;
    this.facing = props.facing ?? 0;
    this.position = props.position ?? [0, 0];
    this.height = props.height ?? 0;
    this.pitch = props.pitch ?? 0;
    this.projectionMode = props.projectionMode ?? 'perspective';
    this.cameraMode = props.cameraMode ?? 'sideview';
    this.resolution = props.resolution ?? { width: 800, height: 600 };
    this.viewBounds = props.viewBounds ?? { left: -10, right: 10, top: 10, bottom: -10 };
    this.isActive = props.isActive ?? true;
  }

  // 获取3D位置
  get position3D(): Vec3 {
    return [this.position[0], this.position[1], this.height];
  }

  // 设置3D位置
  setPosition3D(pos: Vec3): void {
    this.position = [pos[0], pos[1]];
    this.height = pos[2];
  }

  // 获取朝向向量
  get forwardVector(): Vec3 {
    const yawRad = (this.facing * Math.PI) / 180;
    const pitchRad = (this.pitch * Math.PI) / 180;

    return [
      Math.cos(pitchRad) * Math.cos(yawRad),
      Math.cos(pitchRad) * Math.sin(yawRad),
      -Math.sin(pitchRad),
    ];
  }

  // 快速设置预设模式
  setTopDownMode(height = 10): void {
    this.cameraMode = 'topdown';
    this.height = height;
    this.pitch = -90; // 向下看
    this.projectionMode = 'orthographic';
  }

  setSideViewMode(): void {
    this.cameraMode = 'sideview';
    this.height = 0;
    this.pitch = 0; // 水平看
    this.projectionMode = 'perspective';
  }

  // 根据视野范围计算世界坐标
  screenToWorld(screenX: number, screenY: number): Vec2 {
    const normalizedX = screenX / this.resolution.width;
    const normalizedY = screenY / this.resolution.height;

    const worldX =
      this.viewBounds.left + (this.viewBounds.right - this.viewBounds.left) * normalizedX;
    const worldY =
      this.viewBounds.top + (this.viewBounds.bottom - this.viewBounds.top) * normalizedY;

    return [worldX, worldY];
  }

  /**
   * Generates a 3D ray from the camera's perspective for a given screen coordinate.
   * This function handles different camera modes (top-down, side-view, custom) and projection modes (orthographic, perspective).
   * @param screenX The X-coordinate on the screen (pixel).
   * @param screenY The Y-coordinate on the screen (pixel).
   * @param camera The serialized camera data containing its properties and settings.
   * @returns An object containing the ray's origin and direction in 3D world space.
   */
  static generateCameraRay(
    screenX: number,
    screenY: number,
    camera: SerializedCamera,
  ): SerializedRay {
    // Convert screen coordinates to normalized coordinates
    const normalizedX = screenX / camera.resolution.width;
    const normalizedY = screenY / camera.resolution.height;

    // Map to view bounds
    const worldX =
      camera.viewBounds.left + (camera.viewBounds.right - camera.viewBounds.left) * normalizedX;
    const worldY =
      camera.viewBounds.bottom + normalizedY * (camera.viewBounds.top - camera.viewBounds.bottom);

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
      direction = Camera3DComponent.applyCameraRotations(cameraDirection, camera);
    }

    return { origin, direction };
  }

  /**
   * Applies camera rotations (pitch, facing, roll) to a given 3D direction vector.
   * This transforms a direction from camera space to world space.
   * @param direction The 3D direction vector in camera space.
   * @param camera The serialized camera data containing its rotation properties.
   * @returns The rotated 3D direction vector in world space.
   */
  static applyCameraRotations(direction: Vec3, camera: SerializedCamera): Vec3 {
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

  // 更新视野范围（基于相机位置和缩放）
  updateViewBounds(): void {
    const halfWidth = ((this.viewBounds.right - this.viewBounds.left) / 2) * this.zoom;
    const halfHeight = ((this.viewBounds.top - this.viewBounds.bottom) / 2) * this.zoom;

    this.viewBounds = {
      left: this.position[0] - halfWidth,
      right: this.position[0] + halfWidth,
      top: this.position[1] + halfHeight,
      bottom: this.position[1] - halfHeight,
    };
  }
}
