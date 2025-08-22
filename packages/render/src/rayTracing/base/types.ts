import { Point, RgbaColor, ShapeDescriptor } from '@ecs';
import { RenderingOptions, RenderingStats, Vector3 } from '@ecs/core/worker';
import { MaterialProperties } from '../worker';

export interface Intersection3D {
  point: Vector3;
  normal: Vector3;
  distance: number;
  entity: SerializedEntity;
  material?: MaterialProperties;
}

export interface Intersection2D {
  point: Point;
  normal: [number, number];
  distance: number;
  entity: SerializedEntity;
}

// Scene description for workers
export interface SerializedScene {
  entities: Record<string, SerializedEntity>;
  lights: SerializedLight[];
  camera: SerializedCamera;
  environment: {
    backgroundColor: RgbaColor;
    ambientColor: RgbaColor;
    skybox?: string;
  };
  renderingOptions: RenderingOptions;
}

// Tile-based rendering
export interface TileInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
}

export interface TileResult {
  tile: TileInfo;
  pixels: number[];
  renderTime: number;
  stats: RenderingStats;
}

// Enhanced entity serialization
export interface SerializedEntity {
  id: string;
  shape: ShapeDescriptor;
  position: Point;
  rotation?: number;
  // Material properties could be added here
  material?: {
    color?: RgbaColor;
    reflectivity?: number;
    roughness?: number;
  };
}

// Enhanced light serialization
export interface SerializedLight {
  // Basic properties (for backward compatibility)
  position: [number, number];
  color: RgbaColor;
  intensity: number;
  radius: number;

  // Extended properties for 3D ray tracing
  height?: number;
  type?: 'point' | 'directional' | 'ambient' | 'spot';
  castShadows?: boolean;
  attenuation?: 'none' | 'linear' | 'quadratic' | 'realistic';
  direction?: [number, number, number];
  spotAngle?: number;
  spotPenumbra?: number;
  enabled?: boolean;
  layer?: number;
}

// Enhanced camera serialization
export interface SerializedCamera {
  // Basic properties (for backward compatibility)
  position: [number, number];
  fov: number;
  facing: number;

  // Extended properties for 3D ray tracing
  height?: number;
  pitch?: number;
  roll?: number;
  projectionMode?: 'perspective' | 'orthographic';
  cameraMode?: 'topdown' | 'sideview' | 'custom';
  aspect?: number;
  near?: number;
  far?: number;
  viewBounds?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  resolution?: {
    width: number;
    height: number;
  };
  zoom?: number;
}

export interface AccumulationBuffer {
  colorSum: Float32Array;
  sampleCount: Uint32Array;
}

export interface SamplingConfig {
  totalPasses: number;
  currentPass: number;
  pattern: 'checkerboard' | 'random' | 'spiral';
}
