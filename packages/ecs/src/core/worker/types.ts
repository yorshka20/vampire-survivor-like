import { ShapeDescriptor } from '@ecs/components/physics';
import { Point, RectArea, RgbaColor } from '@ecs/utils';

export interface SimpleEntity {
  id: string;
  numericId: number;
  isAsleep: boolean;
  position: [number, number];
  collisionArea: RectArea;
  size: [number, number];
  type: string;
  entityType: 'object' | 'obstacle' | 'unknown';
}

export interface WorkerMessage {
  taskType: WorkerTaskType;
  taskId: number;
  data: PickWorkerTaskDataType<WorkerTaskType>;
}

export interface BaseWorkerData {
  [key: string]: any;
}

export interface GeneralWorkerTask<T extends WorkerTaskType> {
  taskType: T;
  task: PickWorkerTaskType<T>;
}

export type WorkerTaskType = 'collision' | 'rayTracing';

export type PickWorkerTaskDataType<T extends WorkerTaskType> = T extends 'collision'
  ? CollisionWorkerData
  : RayTracingWorkerData;

export type PickWorkerTaskType<T extends WorkerTaskType> = T extends 'collision'
  ? CollisionWorkerTask
  : RayTracingWorkerTask;

// Collision worker interfaces (unchanged)
export interface CollisionWorkerTask {
  taskId: number;
  worker: Worker;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  priority: number;
  data: CollisionWorkerData;
}

/**
 * The data payload received from the main thread.
 * Added pairMode parameter to support multiple pair detection modes
 */
export interface CollisionWorkerData extends BaseWorkerData {
  entities: Record<string, SimpleEntity>;
  pairs: { a: string; b: string }[];
  pairMode: 'object-object' | 'object-obstacle' | 'all';
}

// Enhanced ray tracing worker interfaces
export interface RayTracingWorkerTask {
  taskId: number;
  worker: Worker;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  priority: number;
  data: RayTracingWorkerData;
}

export interface RayTracingWorkerData extends BaseWorkerData {
  entities: Record<string, SerializedEntity>;
  lights: SerializedLight[];
  camera: SerializedCamera;
  viewport: RectArea;
  cameraOffset: [number, number];
  tiles: { x: number; y: number; width: number; height: number }[];
  sampling: SamplingConfig;
  previousFrameData?: Uint8ClampedArray;
}

export interface AccumulationBuffer {
  colorSum: Float32Array;
  sampleCount: Uint32Array;
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

// Worker result interfaces
export interface WorkerResult {
  taskId: number;
  result: any[];
}

export interface SamplingConfig {
  totalPasses: number;
  currentPass: number;
  pattern: 'checkerboard' | 'random' | 'spiral';
}

// Progressive ray tracing specific interfaces
export interface ProgressiveRayTracingWorkerData extends RayTracingWorkerData {
  sampling: {
    currentPass: number;
    totalPasses: number;
    pattern: 'checkerboard' | 'random';
  };
}

export interface ProgressiveTileResult {
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: number[];
  sampledPixels: boolean[];
}

// 3D vector and geometry types
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Vector2 {
  x: number;
  y: number;
}

// Ray tracing specific types
export interface Ray3D {
  origin: Vector3;
  direction: Vector3;
}

export interface Ray2D {
  origin: Point;
  direction: [number, number];
}

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

// Material properties for enhanced rendering
export interface MaterialProperties {
  color: RgbaColor;
  reflectivity: number;
  roughness: number;
  metallic: number;
  emission?: RgbaColor;
}

// Light calculation types
export interface LightCalculationResult {
  color: RgbaColor;
  intensity: number;
  inShadow: boolean;
}

// Camera projection types
export type ProjectionMode = 'perspective' | 'orthographic';
export type CameraMode = 'topdown' | 'sideview' | 'custom';
export type LightType = 'point' | 'directional' | 'ambient' | 'spot';
export type AttenuationType = 'none' | 'linear' | 'quadratic' | 'realistic';

// Error handling
export interface WorkerError {
  taskId: number;
  error: string;
  stack?: string;
}

// Performance monitoring
export interface RenderingStats {
  renderTime: number;
  raysShot: number;
  intersectionTests: number;
  shadowRays: number;
  sampledPixels: number;
  totalPixels: number;
}

// Advanced rendering options
export interface RenderingOptions {
  maxBounces: number;
  shadowSamples: number;
  enableReflections: boolean;
  enableRefraction: boolean;
  enableGlobalIllumination: boolean;
  qualityLevel: 'low' | 'medium' | 'high' | 'ultra';
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

// Progressive rendering state
export interface ProgressiveRenderingState {
  currentPass: number;
  totalPasses: number;
  completedTiles: number;
  totalTiles: number;
  averageRenderTime: number;
  estimatedTimeRemaining: number;
}
