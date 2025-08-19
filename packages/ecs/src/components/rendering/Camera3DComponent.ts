import { Component } from '@ecs/core/ecs/Component';
import { Resolution, Vec2, Vec3, ViewBounds } from '@ecs/types/types';

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

  // 生成光线（用于光线追踪）
  generateRay(screenX: number, screenY: number): { origin: Vec3; direction: Vec3 } {
    const worldPoint = this.screenToWorld(screenX, screenY);
    const origin = this.position3D;

    let direction: Vec3;

    if (this.cameraMode === 'topdown') {
      // 俯视角：光线垂直向下
      direction = [0, 0, -1];
    } else {
      // 侧视角：从相机位置指向世界点
      direction = [worldPoint[0] - origin[0], worldPoint[1] - origin[1], 0 - origin[2]];

      // 归一化方向向量
      const length = Math.sqrt(direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2);
      if (length > 0) {
        direction[0] /= length;
        direction[1] /= length;
        direction[2] /= length;
      }
    }

    return { origin, direction };
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
