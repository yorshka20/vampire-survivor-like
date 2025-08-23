import { ProgressiveRayTracingWorkerData } from '@render/rayTracing/worker';
import { handleCollision } from './collision';
import { handleRayTracing } from './rayTracing';
import { CollisionWorkerData, WorkerMessage } from './types';

// Listen for messages from the main thread
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { taskType, taskId } = event.data;
  switch (taskType) {
    case 'collision':
      const collisions = handleCollision(event.data.data as CollisionWorkerData);
      self.postMessage({ taskId, result: collisions });
      break;
    case 'rayTracing':
      const result = handleRayTracing(event.data.data as ProgressiveRayTracingWorkerData);
      self.postMessage({ taskId, result });
      break;
  }
};
