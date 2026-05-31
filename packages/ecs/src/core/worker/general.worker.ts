import { ProgressiveRayTracingWorkerData } from '@render/rayTracing/worker';
import { handleCollision, handleCollisionSab } from './collision';
import { handleRayTracing } from './rayTracing';
import { CollisionSabWorkerData, CollisionWorkerData, WorkerMessage } from './types';

// Listen for messages from the main thread
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { taskType, taskId } = event.data;
  switch (taskType) {
    case 'collision':
      const collisions = handleCollision(event.data.data as CollisionWorkerData);
      self.postMessage({ taskId, result: collisions });
      break;
    case 'collisionSab':
      // Results are written into the shared result buffer; the message just
      // signals completion so the main thread can resolve its promise.
      handleCollisionSab(event.data.data as CollisionSabWorkerData);
      self.postMessage({ taskId, result: null });
      break;
    case 'rayTracing':
      const result = handleRayTracing(event.data.data as ProgressiveRayTracingWorkerData);
      self.postMessage({ taskId, result });
      break;
  }
};
