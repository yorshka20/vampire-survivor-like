interface SimpleEntity {
  id: string;
  numericId: number;
  isAsleep: boolean;
  position: [number, number];
  collisionArea: [number, number, number, number];
  size: [number, number];
  type: string;
}

/**
 * The data payload received from the main thread.
 * Added pairMode parameter to support multiple pair detection modes
 */
interface WorkerData {
  entities: Record<string, SimpleEntity & { type: string }>;
  cellKeys: string[];
  grid: Map<string, { objects: Set<string>; obstacles?: Set<string> }>;
  pairMode?: 'object-object' | 'object-obstacle' | 'all';
  taskId: string; // Add taskId to WorkerData
}

/**
 * A pair of entity IDs that are colliding, with type, normal, and penetration
 */
type CollisionPair = {
  a: string;
  b: string;
  type: 'object-object' | 'object-obstacle';
  normal?: [number, number];
  penetration?: number;
};

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
 * Compute collision normal and penetration depth for separation and velocity reflection.
 * Supports rect-rect, circle-circle, and rect-circle collisions.
 * @returns { normal: [nx, ny], penetration: number } or null if not colliding
 */
const getCollisionNormalAndPenetration = (
  posA: [number, number],
  sizeA: [number, number],
  typeA: string,
  posB: [number, number],
  sizeB: [number, number],
  typeB: string,
): { normal: [number, number]; penetration: number } | null => {
  // --- rect-rect (AABB) ---
  if (typeA === 'rect' && typeB === 'rect') {
    // AABB collision detection
    const dx = posA[0] - posB[0];
    const dy = posA[1] - posB[1];
    const px = (sizeA[0] + sizeB[0]) / 2 - Math.abs(dx);
    const py = (sizeA[1] + sizeB[1]) / 2 - Math.abs(dy);
    if (px < 0 || py < 0) return null; // no overlap
    // Find axis of minimum penetration and return normal and penetration depth
    if (px < py) {
      return { normal: [dx < 0 ? -1 : 1, 0], penetration: px };
    } else {
      return { normal: [0, dy < 0 ? -1 : 1], penetration: py };
    }
  }
  // --- circle-circle ---
  if (typeA === 'circle' && typeB === 'circle') {
    // Both are circles: pos is center, size[0] is diameter
    const rA = sizeA[0] / 2;
    const rB = sizeB[0] / 2;
    const dx = posA[0] - posB[0];
    const dy = posA[1] - posB[1];
    const distSq = dx * dx + dy * dy;
    const rSum = rA + rB;
    if (distSq >= rSum * rSum) return null; // no overlap
    const dist = Math.sqrt(distSq) || 1e-6; // avoid div by zero
    // Normal points from B to A
    const normal: [number, number] = [dx / dist, dy / dist];
    const penetration = rSum - dist;
    return { normal, penetration };
  }
  // --- rect-circle (or circle-rect) ---
  // Always treat A as moving, B as obstacle
  if ((typeA === 'rect' && typeB === 'circle') || (typeA === 'circle' && typeB === 'rect')) {
    // Swap so that A is always circle, B is always rect
    let circlePos: [number, number],
      circleRadius: number,
      rectPos: [number, number],
      rectSize: [number, number];
    if (typeA === 'circle') {
      circlePos = posA;
      circleRadius = sizeA[0] / 2;
      rectPos = posB;
      rectSize = sizeB;
    } else {
      circlePos = posB;
      circleRadius = sizeB[0] / 2;
      rectPos = posA;
      rectSize = sizeA;
    }
    // Find closest point on rect to circle center
    const halfW = rectSize[0] / 2;
    const halfH = rectSize[1] / 2;
    const dx = circlePos[0] - rectPos[0];
    const dy = circlePos[1] - rectPos[1];
    // Clamp dx/dy to rect bounds
    const closestX = Math.max(-halfW, Math.min(dx, halfW));
    const closestY = Math.max(-halfH, Math.min(dy, halfH));
    // Closest point in world coords
    const nearestX = rectPos[0] + closestX;
    const nearestY = rectPos[1] + closestY;
    // Vector from closest point to circle center
    const distX = circlePos[0] - nearestX;
    const distY = circlePos[1] - nearestY;
    const distSq = distX * distX + distY * distY;
    if (distSq > circleRadius * circleRadius) return null; // no overlap
    const dist = Math.sqrt(distSq) || 1e-6;
    // Normal: from rect to circle
    const normal: [number, number] = [distX / dist, distY / dist];
    const penetration = circleRadius - dist;
    return { normal, penetration };
  }
  // Not supported
  return null;
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

/**
 * Handle object-object collision pairs.
 * @param allObjects - Array of object IDs.
 * @param entities - Map of entity ID to SimpleEntity.
 * @param checkedPairs - Set of checked pair keys.
 * @param collisions - Array to collect collision pairs.
 */
const handleObjectObjectPairs = (
  allObjects: string[],
  entities: Record<string, SimpleEntity>,
  checkedPairs: Set<number>,
  collisions: CollisionPair[],
) => {
  if (allObjects.length >= 2) {
    for (let i = 0; i < allObjects.length; i++) {
      for (let j = i + 1; j < allObjects.length; j++) {
        const entityA = entities[allObjects[i]];
        const entityB = entities[allObjects[j]];
        if (!entityA || !entityB) continue;
        const pairKey = getNumericPairKey(entityA.numericId, entityB.numericId);
        if (checkedPairs.has(pairKey)) continue;
        checkedPairs.add(pairKey);
        if (entityA.isAsleep && entityB.isAsleep) continue;
        if (checkAABBCollision(entityA, entityB)) {
          collisions.push({ a: entityA.id, b: entityB.id, type: 'object-object' });
        }
      }
    }
  }
};

/**
 * Handle object-obstacle collision pairs.
 * @param allObjects - Array of object IDs.
 * @param allObstacles - Array of obstacle IDs.
 * @param entities - Map of entity ID to SimpleEntity.
 * @param checkedPairs - Set of checked pair keys.
 * @param collisions - Array to collect collision pairs.
 */
const handleObjectObstaclePairs = (
  allObjects: string[],
  allObstacles: string[],
  entities: Record<string, SimpleEntity>,
  checkedPairs: Set<number>,
  collisions: CollisionPair[],
) => {
  if (allObjects.length && allObstacles.length) {
    for (let i = 0; i < allObjects.length; i++) {
      for (let j = 0; j < allObstacles.length; j++) {
        const entityA = entities[allObjects[i]];
        const entityB = entities[allObstacles[j]];
        if (!entityA || !entityB) continue;
        // The pairKey order is fixed for object-obstacle
        const pairKey = getNumericPairKey(entityA.numericId, entityB.numericId);
        if (checkedPairs.has(pairKey)) continue;
        checkedPairs.add(pairKey);
        if (entityA.isAsleep) continue; // Skip if only the object is asleep
        // Use the new getCollisionNormalAndPenetration for detailed collision info
        const collision = getCollisionNormalAndPenetration(
          entityA.position,
          entityA.size,
          entityA.type,
          entityB.position,
          entityB.size,
          entityB.type,
        );
        if (collision) {
          collisions.push({
            a: entityA.id,
            b: entityB.id,
            type: 'object-obstacle',
            normal: collision.normal,
            penetration: collision.penetration,
          });
        }
      }
    }
  }
};

// Listen for messages from the main thread
self.onmessage = (event: MessageEvent<WorkerData>) => {
  const { entities, cellKeys, grid, pairMode = 'object-object', taskId } = event.data;
  const collisions: CollisionPair[] = [];
  const checkedPairs = new Set<number>();

  for (const cellKey of cellKeys) {
    const neighborKeys = getNeighborCellKeys(cellKey);
    const uniqueObjects = new Set<string>();
    const uniqueObstacles = new Set<string>();

    // Collect all unique objects/obstacles from the cell and its neighbors
    for (const key of neighborKeys) {
      const neighborCell = grid.get(key);
      if (neighborCell) {
        if (neighborCell.objects) {
          for (const objId of neighborCell.objects) uniqueObjects.add(objId);
        }
        if (neighborCell.obstacles) {
          for (const obsId of neighborCell.obstacles) uniqueObstacles.add(obsId);
        }
      }
    }

    const allObjects = Array.from(uniqueObjects);
    const allObstacles = Array.from(uniqueObstacles);

    // Use switch-case to handle different pair modes for clarity and maintainability
    switch (pairMode) {
      case 'object-object':
        handleObjectObjectPairs(allObjects, entities, checkedPairs, collisions);
        break;
      case 'object-obstacle':
        handleObjectObstaclePairs(allObjects, allObstacles, entities, checkedPairs, collisions);
        break;
      case 'all':
        handleObjectObjectPairs(allObjects, entities, checkedPairs, collisions);
        handleObjectObstaclePairs(allObjects, allObstacles, entities, checkedPairs, collisions);
        break;
      default:
        // No action for unknown pairMode
        break;
    }
  }

  self.postMessage({ taskId, collisions });
};
