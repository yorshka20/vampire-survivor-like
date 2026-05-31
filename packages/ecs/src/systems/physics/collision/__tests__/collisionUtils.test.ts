import { describe, expect, it } from 'vitest';
import {
  getCollisionNormalAndPenetration,
  getCollisionNormalAndPenetrationScalar,
} from '../collisionUtils';

describe('getCollisionNormalAndPenetration', () => {
  describe('rect-rect (AABB)', () => {
    it('detects overlap and returns the minimum-penetration axis', () => {
      // A at origin, B shifted right by 8; both 10x10 → overlap 2 on x, 10 on y.
      const result = getCollisionNormalAndPenetration([0, 0], [10, 10], 'rect', [8, 0], [10, 10], 'rect');
      expect(result).not.toBeNull();
      expect(result!.penetration).toBeCloseTo(2);
      // A is left of B, so the separating normal points along -x.
      expect(result!.normal).toEqual([-1, 0]);
    });

    it('returns null when the boxes do not overlap', () => {
      const result = getCollisionNormalAndPenetration([0, 0], [10, 10], 'rect', [50, 0], [10, 10], 'rect');
      expect(result).toBeNull();
    });

    it('resolves along the y axis when it is the shallower overlap', () => {
      const result = getCollisionNormalAndPenetration([0, 0], [10, 10], 'rect', [0, 8], [10, 10], 'rect');
      expect(result!.penetration).toBeCloseTo(2);
      expect(result!.normal).toEqual([0, -1]);
    });
  });

  describe('circle-circle', () => {
    it('detects overlap with a normalized normal', () => {
      // r5 + r5 = 10, centers 8 apart → penetration 2, normal from B to A.
      const result = getCollisionNormalAndPenetration([0, 0], [10, 10], 'circle', [8, 0], [10, 10], 'circle');
      expect(result!.penetration).toBeCloseTo(2);
      expect(result!.normal[0]).toBeCloseTo(-1);
      expect(result!.normal[1]).toBeCloseTo(0);
    });

    it('returns null when circles are apart', () => {
      const result = getCollisionNormalAndPenetration([0, 0], [10, 10], 'circle', [20, 0], [10, 10], 'circle');
      expect(result).toBeNull();
    });
  });

  describe('rect-circle', () => {
    it('detects overlap regardless of argument order', () => {
      // 10x10 rect at origin (right edge x=5), circle r2 centered at x=6 → overlap 1.
      const rectFirst = getCollisionNormalAndPenetration([0, 0], [10, 10], 'rect', [6, 0], [4, 4], 'circle');
      expect(rectFirst!.penetration).toBeCloseTo(1);

      const circleFirst = getCollisionNormalAndPenetration([6, 0], [4, 4], 'circle', [0, 0], [10, 10], 'rect');
      expect(circleFirst!.penetration).toBeCloseTo(1);
    });
  });

  describe('unsupported type combinations', () => {
    it('returns null for unknown shapes', () => {
      expect(
        getCollisionNormalAndPenetration([0, 0], [10, 10], 'polygon', [0, 0], [10, 10], 'rect'),
      ).toBeNull();
    });
  });

  describe('scalar variant parity', () => {
    // The scalar variant is what the SAB worker calls; it must be byte-for-byte
    // equivalent to the tuple API the rest of the engine uses.
    const cases: Array<{
      a: [number, number, number, number, string];
      b: [number, number, number, number, string];
    }> = [
      { a: [0, 0, 10, 10, 'rect'], b: [8, 0, 10, 10, 'rect'] },
      { a: [0, 0, 10, 10, 'rect'], b: [0, 8, 10, 10, 'rect'] },
      { a: [0, 0, 10, 10, 'rect'], b: [50, 0, 10, 10, 'rect'] }, // no overlap
      { a: [0, 0, 10, 10, 'circle'], b: [8, 3, 10, 10, 'circle'] },
      { a: [0, 0, 10, 10, 'circle'], b: [40, 40, 10, 10, 'circle'] }, // no overlap
      { a: [0, 0, 10, 10, 'rect'], b: [6, 0, 4, 4, 'circle'] },
      { a: [6, 0, 4, 4, 'circle'], b: [0, 0, 10, 10, 'rect'] },
    ];

    it.each(cases)('matches the tuple API for %o', ({ a, b }) => {
      const tuple = getCollisionNormalAndPenetration(
        [a[0], a[1]],
        [a[2], a[3]],
        a[4],
        [b[0], b[1]],
        [b[2], b[3]],
        b[4],
      );
      const scalar = getCollisionNormalAndPenetrationScalar(
        a[0], a[1], a[2], a[3], a[4],
        b[0], b[1], b[2], b[3], b[4],
      );
      expect(scalar).toEqual(tuple);
    });
  });
});
