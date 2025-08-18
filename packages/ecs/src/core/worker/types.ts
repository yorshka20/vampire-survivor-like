import { RectArea } from '@ecs/utils';

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
  entities: Record<string, SimpleEntity>;
  viewport: RectArea;
  cameraOffset: [number, number];
}

// Defines the type for data expected from the collision worker.
export interface WorkerResult {
  taskId: number;
  result: any[]; // This will be the CollisionPair[] from the worker
}
