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
  data: WorkerData | Any;
}

/**
 * The data payload received from the main thread.
 * Added pairMode parameter to support multiple pair detection modes
 */
export interface WorkerData {
  entities: Record<string, SimpleEntity>;
  pairs: { a: string; b: string }[];
  pairMode: 'object-object' | 'object-obstacle' | 'all';
  taskId: number;
}

export interface GeneralWorkerTask {
  taskType: 'collision' | 'rayTracing';
  task: CollisionWorkerTask | RayTracingWorkerTask;
}

export type WorkerTaskType = GeneralWorkerTask['taskType'];

// Defines the structure for a worker task, including a unique ID for response routing.
export interface CollisionWorkerTask {
  taskId: number;
  worker: Worker;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  priority: number;
  data: WorkerData;
}

// Defines the type for data expected from the collision worker.
export interface WorkerResult {
  taskId: number;
  result: any[]; // This will be the CollisionPair[] from the worker
}

export interface RayTracingWorkerTask {
  taskId: number;
  worker: Worker;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  priority: number;
  data: any;
}
