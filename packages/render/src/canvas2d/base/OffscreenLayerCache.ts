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
  computeAnchor(
    viewport: RectArea,
    cameraOffset: [number, number],
    zoom = 1,
  ): [number, number] {
    // World point at the viewport center: invert canvasPixel = zoom*(world+offset).
    return [viewport[2] / 2 / zoom - cameraOffset[0], viewport[3] / 2 / zoom - cameraOffset[1]];
  }

  /**
   * World-space rect the cache canvas covers when centered on `anchor`. The
   * canvas holds `width`/`height` *device* px, i.e. `width/zoom` world units, so
   * this is the region to query for entities to draw. Call after {@link ensureSize}.
   */
  viewWorldRect(anchor: [number, number], zoom = 1): RectArea {
    const w = this.width / zoom;
    const h = this.height / zoom;
    return [anchor[0] - w / 2, anchor[1] - h / 2, w, h];
  }

  /**
   * Returns true if `anchor` has drifted outside the margin band relative to
   * the last rebuild — i.e. continuing without a rebuild would expose un-cached
   * area on at least one side.
   */
  isAnchorOutsideSafeBand(anchor: [number, number], zoom = 1): boolean {
    if (this.width === 0 || this.height === 0) return true;
    // `origin` is the world coord of pixel (0,0); the cache spans width/zoom world
    // units, so its world center is origin + (width/2)/zoom.
    const cx = this.origin[0] + this.width / 2 / zoom;
    const cy = this.origin[1] + this.height / 2 / zoom;
    // The anchor (viewport center) may drift by at most the margin before the
    // viewport edge reaches the cached edge: with ratio r the canvas is
    // (1 + 2r) × viewport, so margin = canvas × r/(1 + 2r). In world units that
    // margin is divided by zoom. Rebuilding the moment drift exceeds it keeps the
    // viewport fully covered at any pan speed (rebuild recenters on the anchor).
    const marginPxFraction = this.marginRatio / (1 + 2 * this.marginRatio);
    const safeRadiusX = (this.width * marginPxFraction) / zoom;
    const safeRadiusY = (this.height * marginPxFraction) / zoom;
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
    zoom = 1,
  ): void {
    this.origin = [
      Math.floor(anchor[0] - this.width / 2 / zoom),
      Math.floor(anchor[1] - this.height / 2 / zoom),
    ];
    // Clear in device px (identity), then rasterize at `zoom` so the cache is at
    // screen resolution — a world point lands at zoom*(world - origin). drawFn
    // draws at world+synthetic with no scale of its own, so the ctx carries zoom.
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.width, this.height);
    if (zoom !== 1) {
      this.ctx.setTransform(zoom, 0, 0, zoom, 0, 0);
    }
    drawFn(this.ctx, [-this.origin[0], -this.origin[1]]);
    if (zoom !== 1) {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  /**
   * Partial update: for each world-space `rect`, clear that region of the cache
   * and invoke `drawFn` (clipped to it) to repaint only what overlaps it. Used
   * for localized content changes so the whole cache need not be rebuilt. The
   * cache's `origin` is unchanged, so unaffected pixels stay valid. `drawFn`
   * receives the same `syntheticCameraOffset` as {@link rebuild} plus the rect.
   */
  patch(
    worldRects: RectArea[],
    drawFn: (
      ctx: CanvasRenderingContext2D,
      syntheticCameraOffset: [number, number],
      worldRect: RectArea,
    ) => void,
    zoom = 1,
  ): void {
    if (this.width === 0 || this.height === 0) return;
    const synthetic: [number, number] = [-this.origin[0], -this.origin[1]];
    for (const rect of worldRects) {
      // Device-pixel rect = zoom*(world - origin). Snap to whole device pixels —
      // floor the top-left, ceil the bottom-right — so clip/clearRect fall exactly
      // on pixel boundaries. With fractional bounds the clip anti-aliases the edge
      // pixels (partial coverage) while clearRect wipes them to transparent, so a
      // clipped redraw can only partly repaint them and the layer below bleeds
      // through as a 1px seam wherever a shape straddles a rect edge. Rounding
      // outward also makes neighboring rects overlap rather than leave a gap.
      const x0 = Math.floor((rect[0] - this.origin[0]) * zoom);
      const y0 = Math.floor((rect[1] - this.origin[1]) * zoom);
      const x1 = Math.ceil((rect[0] + rect[2] - this.origin[0]) * zoom);
      const y1 = Math.ceil((rect[1] + rect[3] - this.origin[1]) * zoom);
      const dx = x0;
      const dy = y0;
      const dw = x1 - x0;
      const dh = y1 - y0;
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.beginPath();
      this.ctx.rect(dx, dy, dw, dh);
      this.ctx.clip();
      this.ctx.clearRect(dx, dy, dw, dh);
      if (zoom !== 1) {
        this.ctx.setTransform(zoom, 0, 0, zoom, 0, 0);
      }
      drawFn(this.ctx, synthetic, rect);
      this.ctx.restore();
    }
  }

  /**
   * Blit the offscreen canvas onto `target` honoring the live world camera
   * offset. After this call the cached content sits at the same canvas pixel
   * positions it would have if the items had been drawn live.
   */
  blit(target: CanvasRenderingContext2D, cameraOffset: [number, number], zoom = 1): void {
    if (this.width === 0 || this.height === 0) return;
    // World point W appears at device px zoom*(W + cameraOffset); the cache holds
    // W at pixel zoom*(W - origin); so the image goes at zoom*(origin + cameraOffset).
    const x = (this.origin[0] + cameraOffset[0]) * zoom;
    const y = (this.origin[1] + cameraOffset[1]) * zoom;
    if (zoom === 1) {
      // Cache px == world units; draw under the target's current transform (this
      // is also the path other layers/ItemRenderLayer rely on — unchanged).
      target.drawImage(this.canvas, x, y);
      return;
    }
    // Cache is device-resolution at this zoom; blit 1:1, bypassing the target's
    // scale(zoom) so it isn't scaled a second time.
    target.save();
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.drawImage(this.canvas, x, y);
    target.restore();
  }
}
