export interface SimpleEntity {
  id: string;
  numericId: number;
  isAsleep: boolean;
  position: [number, number];
  collisionArea: [number, number, number, number];
  size: [number, number];
  type: string;
}

export interface CollisionPair {
  a: string;
  b: string;
  type: 'object-object' | 'object-obstacle';
  normal?: [number, number];
  penetration?: number;
}

export interface WorkerData {
  entities: Record<string, SimpleEntity & { type: string }>;
  cellKeys: string[];
  grid: Map<string, { objects: Set<string>; obstacles?: Set<string> }>;
  pairMode?: 'object-object' | 'object-obstacle' | 'all';
  taskId: string;
}
