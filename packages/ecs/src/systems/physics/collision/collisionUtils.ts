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
): CollisionResult =>
  getCollisionNormalAndPenetrationScalar(
    posA[0],
    posA[1],
    sizeA[0],
    sizeA[1],
    typeA,
    posB[0],
    posB[1],
    sizeB[0],
    sizeB[1],
    typeB,
  );

/**
 * Scalar-argument variant of {@link getCollisionNormalAndPenetration}.
 *
 * Takes positions/sizes as primitive numbers instead of `[number, number]`
 * tuples so callers reading from flat (Shared)ArrayBuffers can run the broad
 * phase without allocating two-element arrays per check. Only the (sparse)
 * positive result allocates a `normal` array, matching the tuple API.
 */
export const getCollisionNormalAndPenetrationScalar = (
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  typeA: string,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  typeB: string,
): CollisionResult => {
  // --- rect-rect (AABB) ---
  if (typeA === 'rect' && typeB === 'rect') {
    return handleRectRectCollision(ax, ay, aw, ah, bx, by, bw, bh);
  }
  // --- circle-circle ---
  if (typeA === 'circle' && typeB === 'circle') {
    return handleCircleCircleCollision(ax, ay, aw, bx, by, bw);
  }
  // --- rect-circle (or circle-rect) ---
  // Swap so that the circle is always treated as A, the rect as B.
  if ((typeA === 'rect' && typeB === 'circle') || (typeA === 'circle' && typeB === 'rect')) {
    if (typeA === 'circle') {
      return handleRectCircleCollision(bx, by, bw, bh, ax, ay, aw / 2);
    }
    return handleRectCircleCollision(ax, ay, aw, ah, bx, by, bw / 2);
  }
  // Not supported
  return null;
};

function handleRectRectCollision(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): CollisionResult {
  // AABB collision detection
  const dx = ax - bx;
  const dy = ay - by;
  const px = (aw + bw) / 2 - Math.abs(dx);
  const py = (ah + bh) / 2 - Math.abs(dy);
  if (px < 0 || py < 0) return null; // no overlap
  // Find axis of minimum penetration and return normal and penetration depth
  if (px < py) {
    return { normal: [dx < 0 ? -1 : 1, 0], penetration: px };
  } else {
    return { normal: [0, dy < 0 ? -1 : 1], penetration: py };
  }
}

function handleCircleCircleCollision(
  ax: number,
  ay: number,
  aDiameter: number,
  bx: number,
  by: number,
  bDiameter: number,
): CollisionResult {
  // Both are circles: pos is center, size[0] is diameter
  const rA = aDiameter / 2;
  const rB = bDiameter / 2;
  const dx = ax - bx;
  const dy = ay - by;
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
  rectX: number,
  rectY: number,
  rectW: number,
  rectH: number,
  circleX: number,
  circleY: number,
  circleRadius: number,
): CollisionResult {
  // Find closest point on rect to circle center
  const halfW = rectW / 2;
  const halfH = rectH / 2;
  const dx = circleX - rectX;
  const dy = circleY - rectY;
  // Clamp dx/dy to rect bounds
  const closestX = Math.max(-halfW, Math.min(dx, halfW));
  const closestY = Math.max(-halfH, Math.min(dy, halfH));
  // Closest point in world coords
  const nearestX = rectX + closestX;
  const nearestY = rectY + closestY;
  // Vector from closest point to circle center
  const distX = circleX - nearestX;
  const distY = circleY - nearestY;
  const distSq = distX * distX + distY * distY;
  if (distSq > circleRadius * circleRadius) return null; // no overlap
  const dist = Math.sqrt(distSq) || 1e-6;
  // Normal: from rect to circle
  const normal: [number, number] = [distX / dist, distY / dist];
  const penetration = circleRadius - dist;
  return { normal, penetration };
}
