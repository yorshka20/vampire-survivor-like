import { ShapeDescriptor } from '@ecs/components/physics';
import { Point, RectArea } from '@ecs/utils';

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

// Defines the structure for a worker task, including a unique ID for response routing.
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
  previousFrameData?: Uint8ClampedArray; // previous frame's accumulated result
}

interface AccumulationBuffer {
  colorSum: Float32Array; // RGB accumulation
  sampleCount: Uint32Array; // sample count per pixel
}

export interface SerializedEntity {
  id: string;
  shape: ShapeDescriptor;
  position: Point;
  rotation?: number; // Add rotation property
  // Add other properties as needed for rendering
}

export interface SerializedLight {
  position: [number, number];
  color: any;
  intensity: number;
  radius: number;
}

export interface SerializedCamera {
  position: [number, number];
  fov: number;
  facing: number;
}

// Defines the type for data expected from the collision worker.
export interface WorkerResult {
  taskId: number;
  result: any[]; // This will be the CollisionPair[] from the worker
}

export interface SamplingConfig {
  totalPasses: number; // total sampling rounds
  currentPass: number; // current round
  pattern: 'checkerboard' | 'random' | 'spiral';
}
