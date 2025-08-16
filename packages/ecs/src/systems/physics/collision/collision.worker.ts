/**
 * @file collision.worker.ts
 * @description This web worker is responsible for performing collision detection in a separate thread.
 * It receives entity data from the main thread, calculates collisions for its assigned portion of the spatial grid,
 * and sends the list of colliding pairs back.
 */

/**
 * Represents the simplified data structure for an entity, containing only what's necessary for collision checks.
 * This is to minimize the amount of data transferred between the main thread and the worker.
 */
interface SimpleEntity {
  id: string;
  numericId: number;
  isAsleep: boolean;
  position: [number, number];
  collisionArea: [number, number, number, number];
  size: [number, number];
}

/**
 * The data payload received from the main thread.
 */
interface WorkerData {
  entities: Record<string, SimpleEntity>;
  cellKeys: string[];
  grid: Map<string, { objects: Set<string> }>;
}

/**
 * A pair of entity IDs that are colliding.
 */
type CollisionPair = [string, string];

/**
 * Generate a numeric key for a pair of entities using their numericId.
 * This is much faster than string operations and Set lookups.
 * Ensures order independence (A,B == B,A).
 * @param id1 - The numeric ID of the first entity.
 * @param id2 - The numeric ID of the second entity.
 * @returns A unique numeric key for the pair.
 */
const getNumericPairKey = (id1: number, id2: number): number => {
  const a = Math.min(id1, id2);
  const b = Math.max(id1, id2);
  // A bitwise operation to combine two 16-bit numbers into a 32-bit number.
  // This is a common technique for generating unique pair keys.
  return (a << 16) | b;
};

/**
 * Get the keys of the 3x3 neighborhood (including self) for a given cellKey.
 * @param cellKey - A string in the format 'x,y'.
 * @returns An array of neighbor cell keys.
 */
const getNeighborCellKeys = (cellKey: string): string[] => {
  const [cellX, cellY] = cellKey.split(',').map(Number);
  const keys: string[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      keys.push(`${cellX + dx},${cellY + dy}`);
    }
  }
  return keys;
};

/**
 * Simple AABB collision check between two entities.
 * @param entity1 - The first entity.
 * @param entity2 - The second entity.
 * @returns True if the entities are colliding, false otherwise.
 */
const checkAABBCollision = (entity1: SimpleEntity, entity2: SimpleEntity): boolean => {
  const area1 = entity1.collisionArea;
  const area2 = entity2.collisionArea;

  return (
    area1[0] < area2[0] + area2[2] &&
    area1[0] + area1[2] > area2[0] &&
    area1[1] < area2[1] + area2[3] &&
    area1[1] + area1[3] > area2[1]
  );
};

// Listen for messages from the main thread
self.onmessage = (event: MessageEvent<WorkerData>) => {
  const { entities, cellKeys, grid } = event.data;
  const collisions: CollisionPair[] = [];
  const checkedPairs = new Set<number>();

  // Process each cell assigned to this worker
  for (const cellKey of cellKeys) {
    const neighborKeys = getNeighborCellKeys(cellKey);
    const uniqueObjects = new Set<string>();

    // Collect all unique objects from the cell and its neighbors
    for (const key of neighborKeys) {
      const neighborCell = grid.get(key);
      if (neighborCell && neighborCell.objects) {
        for (const objId of neighborCell.objects) {
          uniqueObjects.add(objId);
        }
      }
    }

    const allObjects = Array.from(uniqueObjects);
    if (allObjects.length < 2) continue;

    // Perform pairwise collision checks
    for (let i = 0; i < allObjects.length; i++) {
      for (let j = i + 1; j < allObjects.length; j++) {
        const entityA = entities[allObjects[i]];
        const entityB = entities[allObjects[j]];

        if (!entityA || !entityB) continue;

        // Use numericId for a fast pair key
        const pairKey = getNumericPairKey(entityA.numericId, entityB.numericId);
        if (checkedPairs.has(pairKey)) {
          continue;
        }
        checkedPairs.add(pairKey);

        // Skip collision check if both entities are sleeping
        if (entityA.isAsleep && entityB.isAsleep) {
          continue;
        }

        // Check for AABB collision
        if (checkAABBCollision(entityA, entityB)) {
          collisions.push([entityA.id, entityB.id]);
        }
      }
    }
  }

  // Send the detected collisions back to the main thread
  self.postMessage(collisions);
};
