import { Component } from '@ecs/core/ecs/Component';
import { Vec3 } from '@ecs/types/types';
import { RgbaColor } from '@ecs/utils/color';
import { SerializedLight } from '@render/rayTracing';

export type LightType = 'point' | 'directional' | 'ambient' | 'spot';
export type AttenuationType = 'none' | 'linear' | 'quadratic' | 'realistic';

/**
 * Light source component for 2D ray tracing
 * @property {number[]} position - The position of the light source in the format [x, y].
 * @property {number} height - The Z coordinate of the light source.
 * @property {RgbaColor} color - The color of the light.
 * @property {number} intensity - The intensity of the light, affecting its brightness.
 * @property {number} radius - The radius of the light's influence.
 * @property {LightType} type - The type of light source.
 * @property {boolean} castShadows - Whether this light casts shadows.
 * @property {AttenuationType} attenuation - How light intensity decreases with distance.
 */
export class LightSourceComponent extends Component {
  static componentName = 'LightSource';

  // 基础属性（保持你的原有设计）
  public position: [number, number] = [0, 0];
  public color: RgbaColor = { r: 255, g: 255, b: 255, a: 1 };
  public intensity = 1;
  public radius = 100;

  // 新增3D支持
  public height = 0; // Z坐标，0表示在场景平面上

  // 光源类型和行为
  public type: LightType = 'point';
  public castShadows = true;
  public attenuation: AttenuationType = 'quadratic';

  // 方向光专用属性
  public direction: [number, number, number] = [0, 0, -1]; // 默认向下

  // 聚光灯专用属性
  public spotAngle = 45; // 聚光灯的光锥角度（度）
  public spotPenumbra = 5; // 边缘衰减角度（度）

  // 控制属性
  public enabled = true;
  public layer = 0; // 光照层级，用于分层渲染

  constructor(
    props: {
      position?: [number, number];
      height?: number;
      color?: RgbaColor;
      intensity?: number;
      radius?: number;
      type?: LightType;
      castShadows?: boolean;
      attenuation?: AttenuationType;
      direction?: [number, number, number];
      spotAngle?: number;
      enabled?: boolean;
      layer?: number;
    } = {},
  ) {
    super('LightSource');

    // 使用提供的值或默认值
    this.position = props.position ?? [0, 0];
    this.height = props.height ?? 0;
    this.color = props.color ?? { r: 255, g: 255, b: 255, a: 1 };
    this.intensity = props.intensity ?? 1;
    this.radius = props.radius ?? 100;
    this.type = props.type ?? 'point';
    this.castShadows = props.castShadows ?? true;
    this.attenuation = props.attenuation ?? 'quadratic';
    this.direction = props.direction ?? [0, 0, -1];
    this.spotAngle = props.spotAngle ?? 45;
    this.enabled = props.enabled ?? true;
    this.layer = props.layer ?? 0;
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

  // 获取归一化方向向量
  get normalizedDirection(): Vec3 {
    const [x, y, z] = this.direction;
    const length = Math.sqrt(x * x + y * y + z * z);
    if (length === 0) return [0, 0, -1];

    return [x / length, y / length, z / length];
  }

  // 计算距离衰减
  calculateAttenuation(distance: number): number {
    if (!this.enabled || distance <= 0) return 0;
    if (distance > this.radius) return 0;

    switch (this.attenuation) {
      case 'none':
        return 1;

      case 'linear':
        return Math.max(0, 1 - distance / this.radius);

      case 'quadratic':
        const normalizedDistance = distance / this.radius;
        return Math.max(0, 1 - normalizedDistance * normalizedDistance);

      case 'realistic':
        // 物理上更真实的平方反比衰减，但有最小距离防止除零
        const minDistance = 1;
        const effectiveDistance = Math.max(distance, minDistance);
        const falloff = 1 / (effectiveDistance * effectiveDistance);
        // 在radius处衰减到一个小值，而不是0
        const radiusFalloff = 1 / (this.radius * this.radius);
        return Math.max(0, falloff - radiusFalloff) / (1 - radiusFalloff);

      default:
        return 1;
    }
  }

  // 计算光照强度（考虑距离和角度）
  calculateLightIntensity(targetPos: Vec3): number {
    if (!this.enabled) return 0;

    const lightPos = this.position3D;
    const distance = Math.sqrt(
      (targetPos[0] - lightPos[0]) ** 2 +
        (targetPos[1] - lightPos[1]) ** 2 +
        (targetPos[2] - lightPos[2]) ** 2,
    );

    let intensity = this.intensity;

    // 根据光源类型计算强度
    switch (this.type) {
      case 'ambient':
        // 环境光不受距离影响
        return intensity;

      case 'directional':
        // 方向光不受距离影响，但可以考虑方向
        return intensity;

      case 'point':
        // 点光源受距离衰减影响
        intensity *= this.calculateAttenuation(distance);
        break;

      case 'spot':
        // 聚光灯需要检查角度
        const lightDir = this.normalizedDirection;
        const targetDir = [
          (targetPos[0] - lightPos[0]) / distance,
          (targetPos[1] - lightPos[1]) / distance,
          (targetPos[2] - lightPos[2]) / distance,
        ];

        const dotProduct =
          lightDir[0] * targetDir[0] + lightDir[1] * targetDir[1] + lightDir[2] * targetDir[2];
        const angle = (Math.acos(Math.max(-1, Math.min(1, dotProduct))) * 180) / Math.PI;

        const halfAngle = this.spotAngle / 2;
        const penumbraStart = halfAngle - this.spotPenumbra;

        if (angle > halfAngle) {
          return 0; // 超出光锥范围
        } else if (angle < penumbraStart) {
          intensity *= this.calculateAttenuation(distance);
        } else {
          // 在边缘衰减区域
          const falloff = 1 - (angle - penumbraStart) / this.spotPenumbra;
          intensity *= falloff * this.calculateAttenuation(distance);
        }
        break;
    }

    return Math.max(0, intensity);
  }

  // 检查点是否在光照范围内
  isPointInRange(targetPos: Vec3): boolean {
    if (!this.enabled) return false;

    if (this.type === 'ambient' || this.type === 'directional') {
      return true; // 环境光和方向光影响所有点
    }

    const lightPos = this.position3D;
    const distance = Math.sqrt(
      (targetPos[0] - lightPos[0]) ** 2 +
        (targetPos[1] - lightPos[1]) ** 2 +
        (targetPos[2] - lightPos[2]) ** 2,
    );

    return distance <= this.radius;
  }

  // 获取光源到目标点的方向（用于阴影计算）
  getDirectionToTarget(targetPos: Vec3): Vec3 {
    if (this.type === 'directional') {
      // 方向光的光线方向是固定的
      return this.normalizedDirection;
    }

    // 点光源和聚光灯：从光源指向目标
    const lightPos = this.position3D;
    const dx = targetPos[0] - lightPos[0];
    const dy = targetPos[1] - lightPos[1];
    const dz = targetPos[2] - lightPos[2];
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (length === 0) return [0, 0, 0];

    return [dx / length, dy / length, dz / length];
  }

  // 快速设置预设光源类型
  setAsAmbientLight(intensity = 0.3): void {
    this.type = 'ambient';
    this.intensity = intensity;
    this.castShadows = false;
    this.attenuation = 'none';
  }

  setAsDirectionalLight(direction: [number, number, number] = [0, 0, -1], intensity = 1): void {
    this.type = 'directional';
    this.direction = direction;
    this.intensity = intensity;
    this.castShadows = true;
    this.attenuation = 'none';
  }

  setAsPointLight(radius = 100, intensity = 1): void {
    this.type = 'point';
    this.radius = radius;
    this.intensity = intensity;
    this.castShadows = true;
    this.attenuation = 'quadratic';
  }

  setAsSpotLight(angle = 45, penumbra = 5, direction: [number, number, number] = [0, 0, -1]): void {
    this.type = 'spot';
    this.spotAngle = angle;
    this.spotPenumbra = penumbra;
    this.direction = direction;
    this.castShadows = true;
    this.attenuation = 'quadratic';
  }

  // 调试信息
  getDebugInfo(): string {
    return (
      `Light(${this.type}): pos=[${this.position[0]},${this.position[1]},${this.height}], ` +
      `intensity=${this.intensity}, radius=${this.radius}, shadows=${this.castShadows}`
    );
  }

  /**
   * Calculates the light intensity with distance attenuation for a given light source.
   * @param targetPos The 3D position of the point being shaded.
   * @param light The serialized light source data.
   * @param distance The distance from the light source to the target position.
   * @returns The calculated light intensity, clamped between 0 and 1.
   */
  static calculateLightIntensity(
    targetPos: Vec3,
    light: SerializedLight,
    distance: number,
  ): number {
    if (!light.enabled) return 0;

    // Directional lights have infinite range
    if (light.type === 'directional') {
      return light.intensity;
    }

    // Other light types check distance
    if (distance > light.radius) {
      return 0;
    }

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
   * Calculates the falloff factor for a spot light based on the angle between the light direction and the spot direction.
   * @param lightDirection The direction vector from the light source to the shaded point.
   * @param light The serialized spot light source data.
   * @returns The spot light falloff factor, ranging from 0 (outside cone) to 1 (full intensity).
   */
  static calculateSpotLightFalloff(lightDirection: Vec3, light: SerializedLight): number {
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
}
