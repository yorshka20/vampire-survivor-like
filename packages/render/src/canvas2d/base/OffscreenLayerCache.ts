import { RectArea } from '@ecs/types/types';

/**
 * Reusable offscreen-canvas cache for render layers whose contents are mostly
 * static between frames but live in a world with a moving camera.
 *
 * The basic deal: instead of re-drawing every item on the main canvas every
 * frame, draw them once onto an offscreen canvas that covers the viewport plus
 * a margin band, then each frame just blit that bitmap onto the main canvas
 * with the live camera offset. As long as the underlying items don't change
 * and the camera stays inside the margin band, no rebuild is needed.
 *
 * Typical usage:
 *
 * ```ts
 * private cache = new OffscreenLayerCache(0.25);
 *
 * update(_dt, viewport, cameraOffset) {
 *   if (this.cache.ensureSize(viewport)) {
 *     // canvas was resized → previous contents wiped; force a rebuild below.
 *   }
 *   const anchor = this.cache.computeAnchor(viewport, cameraOffset);
 *   if (this.cache.isAnchorOutsideSafeBand(anchor) || itemsChanged) {
 *     this.cache.rebuild(anchor, (ctx, syntheticOffset) => {
 *       for (const item of items) {
 *         drawItem(ctx, item, syntheticOffset);
 *       }
 *     });
 *   }
 *   this.cache.blit(this.ctx, cameraOffset);
 * }
 * ```
 *
 * The cache is intentionally identity-agnostic: it does NOT track which items
 * are currently in the cache. Detecting "items changed" is the caller's job
 * (Set diff, dirty flag from world events, etc.) — the cache just responds to
 * `rebuild()` calls.
 */
export class OffscreenLayerCache {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  /** World coords of the offscreen canvas's (0, 0) pixel after last rebuild. */
  private origin: [number, number] = [0, 0];
  private width: number = 0;
  private height: number = 0;

  /**
   * Ratio of margin to viewport on each side. With ratio 0.25, the canvas
   * covers 1 + 2*0.25 = 1.5× the viewport. Larger margin = less frequent
   * rebuilds when the camera moves, at the cost of more memory and slower
   * per-rebuild.
   */
  private readonly marginRatio: number;

  constructor(marginRatio: number = 0.25) {
    this.marginRatio = marginRatio;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }

  /**
   * Resize the offscreen canvas to cover `viewport * (1 + 2*marginRatio)`.
   * Returns `true` if the canvas was actually resized — callers should treat
   * this as an invalidation signal (the resize wipes the canvas contents).
   */
  ensureSize(viewport: RectArea): boolean {
    const targetW = Math.ceil(viewport[2] * (1 + 2 * this.marginRatio));
    const targetH = Math.ceil(viewport[3] * (1 + 2 * this.marginRatio));
    if (targetW === this.width && targetH === this.height) return false;
    this.canvas.width = targetW;
    this.canvas.height = targetH;
    this.width = targetW;
    this.height = targetH;
    return true;
  }

  /**
   * Convenience: the world point currently at the center of the viewport.
   * This is the natural choice for the cache anchor — pass into `rebuild()`
   * and `isAnchorOutsideSafeBand()`.
   */
  computeAnchor(viewport: RectArea, cameraOffset: [number, number]): [number, number] {
    return [viewport[2] / 2 - cameraOffset[0], viewport[3] / 2 - cameraOffset[1]];
  }

  /**
   * World-space rect the cache canvas covers when centered on `anchor`. At
   * zoom = 1 (cache px == world units) this is the region to query for entities
   * so that panning within the margin band reveals already-cached content. Call
   * after {@link ensureSize} so width/height are current.
   */
  viewWorldRect(anchor: [number, number]): RectArea {
    return [anchor[0] - this.width / 2, anchor[1] - this.height / 2, this.width, this.height];
  }

  /**
   * Returns true if `anchor` has drifted outside the margin band relative to
   * the last rebuild — i.e. continuing without a rebuild would expose un-cached
   * area on at least one side.
   */
  isAnchorOutsideSafeBand(anchor: [number, number]): boolean {
    if (this.width === 0 || this.height === 0) return true;
    const cx = this.origin[0] + this.width / 2;
    const cy = this.origin[1] + this.height / 2;
    // The anchor (viewport center) may drift by at most the margin before the
    // viewport edge reaches the cached edge: with ratio r the canvas is
    // (1 + 2r) × viewport, so margin = canvas × r/(1 + 2r). Rebuilding the moment
    // drift exceeds that keeps the viewport fully covered at any pan speed
    // (rebuild recenters on the current anchor), so no edge is ever left blank.
    const marginPxFraction = this.marginRatio / (1 + 2 * this.marginRatio);
    const safeRadiusX = this.width * marginPxFraction;
    const safeRadiusY = this.height * marginPxFraction;
    return Math.abs(anchor[0] - cx) > safeRadiusX || Math.abs(anchor[1] - cy) > safeRadiusY;
  }

  /**
   * Recenter the cache on `anchor`, clear the offscreen canvas, and invoke
   * `drawFn` to populate it. `drawFn` receives:
   *
   *   - `ctx`: the offscreen canvas's 2D context.
   *   - `syntheticCameraOffset`: pass this where the caller would normally
   *     pass `cameraOffset` to a draw routine. Drawing a world point (wx, wy)
   *     with this offset lands at the correct offscreen-local pixel — the math
   *     is identical: `wx + syntheticCameraOffset[0]` is the offscreen pixel
   *     representing world `wx`.
   */
  rebuild(
    anchor: [number, number],
    drawFn: (ctx: CanvasRenderingContext2D, syntheticCameraOffset: [number, number]) => void,
  ): void {
    this.origin = [
      Math.floor(anchor[0] - this.width / 2),
      Math.floor(anchor[1] - this.height / 2),
    ];
    this.ctx.clearRect(0, 0, this.width, this.height);
    drawFn(this.ctx, [-this.origin[0], -this.origin[1]]);
  }

  /**
   * Blit the offscreen canvas onto `target` honoring the live world camera
   * offset. After this call the cached content sits at the same canvas pixel
   * positions it would have if the items had been drawn live.
   */
  blit(target: CanvasRenderingContext2D, cameraOffset: [number, number]): void {
    if (this.width === 0 || this.height === 0) return;
    target.drawImage(
      this.canvas,
      this.origin[0] + cameraOffset[0],
      this.origin[1] + cameraOffset[1],
    );
  }
}
