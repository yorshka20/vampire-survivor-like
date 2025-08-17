/**
 * @file WorkerPoolManager.ts
 * @description Manages a pool of Web Workers for collision detection, distributing tasks and routing results.
 *
 * This manager ensures that worker resources are efficiently shared among different systems
 * (e.g., BorderSystem, ParallelCollisionSystem) that require collision computations.
 * It assigns a unique taskId to each request, allowing results to be accurately returned
 * to the initiating system.
 */

import collisionWorker from './collision.worker.ts?worker';

// Defines the structure for a worker task, including a unique ID for response routing.
export interface WorkerTask {
  taskId: number;
  worker: Worker;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  priority: number;
  data: any;
}

// Defines the type for data expected from the collision worker.
export interface CollisionWorkerResult {
  taskId: number;
  collisions: any[]; // This will be the CollisionPair[] from the worker
}

export class WorkerPoolManager {
  private static instance: WorkerPoolManager;
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private taskQueue: WorkerTask[] = [];
  private activeTasks: Map<number, WorkerTask> = new Map();
  private taskIdCounter: number = 0;

  private static workerCount: number = 8;

  private constructor() {
    for (let i = 0; i < WorkerPoolManager.workerCount; i++) {
      const worker = new collisionWorker();
      worker.onmessage = this.handleWorkerMessage.bind(this);
      worker.onerror = this.handleWorkerError.bind(this);
      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }
    console.log(`WorkerPoolManager initialized with ${WorkerPoolManager.workerCount} workers.`);
  }

  /**
   * Retrieves the singleton instance of the WorkerPoolManager.
   * @returns The singleton instance of WorkerPoolManager.
   */
  public static getInstance(): WorkerPoolManager {
    if (!WorkerPoolManager.instance) {
      WorkerPoolManager.instance = new WorkerPoolManager();
    }
    return WorkerPoolManager.instance;
  }

  /**
   * Get the number of workers in the pool.
   * @returns The number of workers.
   */
  public getWorkerCount(): number {
    return this.workers.length;
  }

  /**
   * Submits a new task to the worker pool.
   * @param data - The data payload to send to the worker.
   * @param priority - The priority of the task (lower number is higher priority).
   * @returns A promise that resolves with the worker's result.
   */
  public submitTask(data: any, priority: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const taskId = this.taskIdCounter++;
      const task: WorkerTask = { taskId, worker: null as any, resolve, reject, priority, data };
      this.activeTasks.set(taskId, task);

      if (this.availableWorkers.length > 0) {
        this.assignTaskToWorker(task);
      } else {
        this.taskQueue.push(task);
        // Sort queue by priority (lower number = higher priority)
        this.taskQueue.sort((a, b) => a.priority - b.priority);
      }
    });
  }

  /**
   * Assigns a task to an available worker or queues it if no workers are available.
   * @param task - The WorkerTask to be assigned.
   */
  private assignTaskToWorker(task: WorkerTask): void {
    const worker = this.availableWorkers.shift();
    if (worker) {
      task.worker = worker;
      // Include the taskId in the data sent to the worker
      worker.postMessage({ ...task.data, taskId: task.taskId });
    } else {
      // This case should ideally not be hit if called only when availableWorkers > 0
      // but as a safeguard, re-queue the task and sort.
      this.taskQueue.push(task);
      this.taskQueue.sort((a, b) => a.priority - b.priority);
    }
  }

  /**
   * Handles messages received from a worker.
   * @param event - The MessageEvent from the worker.
   */
  private handleWorkerMessage(event: MessageEvent<CollisionWorkerResult>): void {
    const { taskId, collisions } = event.data;
    const task = this.activeTasks.get(taskId);

    if (task) {
      task.resolve(collisions);
      this.activeTasks.delete(taskId);
      this.availableWorkers.push(task.worker);
      this.processQueue();
    } else {
      console.warn(`WorkerPoolManager: Received message for unknown task ID: ${taskId}`);
    }
  }

  /**
   * Handles errors reported by a worker.
   * @param event - The ErrorEvent from the worker.
   */
  private handleWorkerError(event: ErrorEvent): void {
    // Find the task associated with the worker that errored
    // This might require iterating through activeTasks or maintaining a worker-to-task map
    console.error('WorkerPoolManager: Worker error:', event);
    // For simplicity, we'll just log and potentially re-enable the worker.
    // In a more robust system, you might want to terminate and replace the faulty worker.
  }

  /**
   * Processes the task queue, assigning tasks to available workers.
   */
  private processQueue(): void {
    while (this.taskQueue.length > 0 && this.availableWorkers.length > 0) {
      const task = this.taskQueue.shift();
      if (task) {
        this.assignTaskToWorker(task);
      }
    }
  }

  /**
   * Terminates all workers in the pool.
   */
  public terminateAllWorkers(): void {
    this.workers.forEach((worker) => worker.terminate());
    this.workers = [];
    this.availableWorkers = [];
    this.taskQueue = [];
    this.activeTasks.clear();
    this.taskIdCounter = 0;
  }
}
