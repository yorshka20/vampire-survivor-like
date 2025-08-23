import { RectArea, RgbaColor } from '@ecs';
import { BaseWorkerData } from '@ecs/core/worker';
import { SamplingConfig, SerializedCamera, SerializedEntity, SerializedLight } from '../base';

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
  viewport?: RectArea;
  cameraOffset?: [number, number];
  tiles: { x: number; y: number; width: number; height: number }[];
  sampling: SamplingConfig;

  // use shared array buffer to track which pixels were sampled in this pass
  sampledPixelsBuffer: SharedArrayBuffer;

  // Shared array buffers for pixel accumulation
  colorAccumBuffer?: SharedArrayBuffer; // Stores accumulated color values as integers (fixed-point arithmetic)
  sampleCountsBuffer?: SharedArrayBuffer; // Tracks how many samples each pixel has received

  // Canvas width for calculating global pixel indices
  canvasWidth: number;

  previousFrameData?: Uint8ClampedArray;
}

// Progressive ray tracing specific interfaces
export type ProgressiveRayTracingWorkerData = RayTracingWorkerData;

// Extended tile result that includes sampling information
export interface ProgressiveTileResult {
  x: number;
  y: number;
  width: number;
  height: number;
  sampledPixelsBuffer: SharedArrayBuffer; // Track which pixels were sampled in this pass
  // Note: pixels are now written directly to SharedArrayBuffer by workers
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

// Progressive rendering state
export interface ProgressiveRenderingState {
  currentPass: number;
  totalPasses: number;
  completedTiles: number;
  totalTiles: number;
  averageRenderTime: number;
  estimatedTimeRemaining: number;
}
