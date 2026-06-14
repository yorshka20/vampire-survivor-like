/**
 * @file WorkerPoolManager.ts
 * @description Manages a pool of Web Workers for general tasks, distributing tasks and routing results.
 *
 * This manager ensures that worker resources are efficiently shared among different systems
 * (e.g., BorderSystem, ParallelCollisionSystem) that require general tasks.
 * It assigns a unique taskId to each request, allowing results to be accurately returned
 * to the initiating system.
 */

import generalWorker from './general.worker.ts?worker';
import {
  GeneralWorkerTask,
  PickWorkerTaskDataType,
  PickWorkerTaskType,
  WorkerResult,
  WorkerTaskType,
} from './types';

/**
 * Rejection reason used when a task is dropped via {@link WorkerPoolManager.cancelTasksByType}.
 * Callers can `instanceof`-check this to tell an intentional discard apart from a real failure
 * (e.g. when a render layer is hidden, its in-flight work is cancelled, not errored).
 */
export class WorkerTaskCancelledError extends Error {
  constructor(message = 'Worker task cancelled') {
    super(message);
    this.name = 'WorkerTaskCancelledError';
  }
}

export class WorkerPoolManager {
  private static instance: WorkerPoolManager;
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private taskQueue: GeneralWorkerTask<WorkerTaskType>[] = [];
  private activeTasks: Map<number, GeneralWorkerTask<WorkerTaskType>> = new Map();
  private taskIdCounter: number = 0;

  private static workerCount: number = navigator.hardwareConcurrency || 4;

  private constructor() {
    for (let i = 0; i < WorkerPoolManager.workerCount; i++) {
      const worker = new generalWorker();
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
  public submitTask<T extends WorkerTaskType>(
    taskType: T,
    data: PickWorkerTaskDataType<T>,
    priority: number,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const taskId = this.taskIdCounter++;
      const task: GeneralWorkerTask<T> = {
        taskType,
        task: {
          taskId,
          worker: null as any,
          resolve,
          reject,
          priority,
          data,
        } as PickWorkerTaskType<T>,
      };

      this.activeTasks.set(taskId, task);

      if (this.availableWorkers.length > 0) {
        this.assignTaskToWorker(task);
      } else {
        this.taskQueue.push(task);
        this.taskQueue.sort((a, b) => a.task.priority - b.task.priority);
      }
    });
  }

  /**
   * Discards every pending task of the given type.
   *
   * Why this exists: the pool is shared across systems (collision, ray tracing, …).
   * A producer that out-runs the workers — progressive ray tracing submits a fresh
   * batch every frame — can pile up an unbounded backlog. Once that producer is no
   * longer needed (e.g. its render layer is hidden), the backlog keeps the workers
   * busy and starves latency-critical tasks like collision, freezing the game.
   *
   * Queued tasks have not touched a worker yet, so they are removed outright and
   * their promises rejected. In-flight tasks (already `postMessage`d) cannot be
   * aborted mid-computation, so we only flag their result to be ignored and reject
   * the promise now — there are at most `workerCount` of them and each frees its
   * worker the instant it reports back. We deliberately keep them in `activeTasks`
   * so {@link handleWorkerMessage} still returns the worker to the pool.
   *
   * @returns The number of tasks that were cancelled.
   */
  public cancelTasksByType(taskType: WorkerTaskType, reason?: string): number {
    let cancelled = 0;
    const error = new WorkerTaskCancelledError(reason);

    // 1. Drop not-yet-dispatched tasks entirely (no worker assigned → no leak).
    const remaining: GeneralWorkerTask<WorkerTaskType>[] = [];
    for (const queued of this.taskQueue) {
      if (queued.taskType === taskType) {
        this.activeTasks.delete(queued.task.taskId);
        queued.task.cancelled = true;
        queued.task.reject(error);
        cancelled++;
      } else {
        remaining.push(queued);
      }
    }
    this.taskQueue = remaining;

    // 2. Abandon in-flight tasks: flag + reject now, but leave them in activeTasks
    //    so the worker is still recycled when the (now ignored) result arrives.
    for (const task of this.activeTasks.values()) {
      if (task.taskType === taskType && task.task.worker && !task.task.cancelled) {
        task.task.cancelled = true;
        task.task.reject(error);
        cancelled++;
      }
    }

    return cancelled;
  }

  /**
   * Assigns a task to an available worker or queues it if no workers are available.
   * @param task - The WorkerTask to be assigned.
   */
  private assignTaskToWorker(task: GeneralWorkerTask<WorkerTaskType>): void {
    const worker = this.availableWorkers.shift();
    if (worker) {
      task.task.worker = worker;
      // Include the taskId in the data sent to the worker
      worker.postMessage({
        taskType: task.taskType,
        taskId: task.task.taskId,
        data: task.task.data,
      });
    } else {
      // This case should ideally not be hit if called only when availableWorkers > 0
      // but as a safeguard, re-queue the task and sort.
      this.taskQueue.push(task);
      this.taskQueue.sort((a, b) => a.task.priority - b.task.priority);
    }
  }

  /**
   * Handles messages received from a worker.
   * @param event - The MessageEvent from the worker.
   */
  private handleWorkerMessage(event: MessageEvent<WorkerResult>): void {
    const { taskId } = event.data;
    const task = this.activeTasks.get(taskId);
    if (!task) {
      return;
    }

    // A cancelled in-flight task has already had its promise rejected; just drop
    // the result. We still recycle the worker so the pool doesn't leak it.
    if (!task.task.cancelled) {
      task.task.resolve(event.data.result);
    }
    this.activeTasks.delete(taskId);
    this.availableWorkers.push(task.task.worker);
    this.processQueue();
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
