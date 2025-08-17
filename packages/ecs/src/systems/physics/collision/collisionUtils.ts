export type CollisionResult = { normal: [number, number]; penetration: number } | null;

/**
 * A pair of entity IDs that are colliding, with type, normal, and penetration
 */
export type CollisionPair = {
  a: string;
  b: string;
  type: 'object-object' | 'object-obstacle';
  normal: [number, number];
  penetration: number;
};

/**
 * Compute collision normal and penetration depth for separation and velocity reflection.
 * Supports rect-rect, circle-circle, and rect-circle collisions.
 * @returns { normal: [nx, ny], penetration: number } or null if not colliding
 */
export const getCollisionNormalAndPenetration = (
  posA: [number, number],
  sizeA: [number, number],
  typeA: string,
  posB: [number, number],
  sizeB: [number, number],
  typeB: string,
): CollisionResult => {
  // --- rect-rect (AABB) ---
  if (typeA === 'rect' && typeB === 'rect') {
    return handleRectRectCollision(posA, sizeA, posB, sizeB);
  }
  // --- circle-circle ---
  if (typeA === 'circle' && typeB === 'circle') {
    return handleCircleCircleCollision(posA, sizeA, posB, sizeB);
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
    return handleRectCircleCollision(rectPos, rectSize, circlePos, circleRadius);
  }
  // Not supported
  return null;
};

function handleRectRectCollision(
  posA: [number, number],
  sizeA: [number, number],
  posB: [number, number],
  sizeB: [number, number],
): CollisionResult {
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

function handleCircleCircleCollision(
  posA: [number, number],
  sizeA: [number, number],
  posB: [number, number],
  sizeB: [number, number],
): CollisionResult {
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

function handleRectCircleCollision(
  rectPos: [number, number],
  rectSize: [number, number],
  circlePos: [number, number],
  circleRadius: number,
): CollisionResult {
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
