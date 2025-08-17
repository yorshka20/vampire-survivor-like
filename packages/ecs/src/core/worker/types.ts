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
