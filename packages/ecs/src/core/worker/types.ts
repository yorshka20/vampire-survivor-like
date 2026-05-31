import { RectArea } from '@ecs/utils';
import { RayTracingWorkerData, RayTracingWorkerTask } from '@render';

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

export type WorkerTaskType = 'collision' | 'collisionSab' | 'rayTracing';

export type PickWorkerTaskDataType<T extends WorkerTaskType> = T extends 'collision'
  ? CollisionWorkerData
  : T extends 'collisionSab'
    ? CollisionSabWorkerData
    : RayTracingWorkerData;

export type PickWorkerTaskType<T extends WorkerTaskType> = T extends 'collision'
  ? CollisionWorkerTask
  : T extends 'collisionSab'
    ? CollisionSabWorkerTask
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

export interface CollisionSabWorkerTask {
  taskId: number;
  worker: Worker;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  priority: number;
  data: CollisionSabWorkerData;
}

/**
 * SharedArrayBuffer-based payload for the object-object broad phase.
 *
 * Unlike {@link CollisionWorkerData}, the heavy per-entity data lives in shared
 * memory rather than an object tree, so `postMessage` carries only buffer
 * references plus a few scalars — no `structuredClone` of N entities per frame.
 *
 * Layout (strides/offsets) is defined in
 * `@ecs/systems/physics/collision/collisionSabLayout`.
 */
export interface CollisionSabWorkerData extends BaseWorkerData {
  /** Float64Array: per-entity columns [posX, posY, sizeX, sizeY, typeCode]. Shared by all workers. */
  entityBuffer: SharedArrayBuffer;
  /** Int32Array: per-pair entity indices [indexA, indexB]. Shared by all workers. */
  pairBuffer: SharedArrayBuffer;
  /** Float64Array: per-collision [indexA, indexB, normalX, normalY, penetration]. */
  resultBuffer: SharedArrayBuffer;
  /** Int32Array (length = workerCount): collisions written by each worker (Atomics handshake). */
  countBuffer: SharedArrayBuffer;
  /** This worker's slot in countBuffer. */
  workerIndex: number;
  /** Inclusive start pair index this worker processes. Also where it writes results. */
  startPair: number;
  /** Exclusive end pair index this worker processes. */
  endPair: number;
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

// Worker result interfaces
export interface WorkerResult {
  taskId: number;
  result: any[];
}

// Error handling
export interface WorkerError {
  taskId: number;
  error: string;
  stack?: string;
}
