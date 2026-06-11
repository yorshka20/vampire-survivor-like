import { RectArea } from '@ecs/types/types';

/**
 * Per-frame render decision, produced by an optional IdleFrameSkipSystem:
 * - `'skip'`: nothing changed → keep the last frame (no clear, no draw).
 * - `'transform'`: only the camera panned → pan-cache layers may blit their
 *   cached bitmap instead of re-rasterizing.
 * - `'partial'`: content changed in a few localized regions → pan-cache layers
 *   patch just the dirty rects ({@link RenderContext.dirtyRects}) into the cache
 *   instead of re-rasterizing the whole thing.
 * - `'rebuild'`: content (or zoom/viewport) changed broadly → full draw. Default.
 */
export type RenderMode = 'skip' | 'transform' | 'partial' | 'rebuild';

/**
 * Shared render-side blackboard, owned by the {@link World} (one per world).
 *
 * It exists so render systems and layers stop reaching into each other: instead
 * of `IdleFrameSkipSystem` writing decisions back into `RenderSystem` and layers
 * reading them off `RenderSystem`, everyone reads/writes this plain data object.
 * It holds **data only, no logic** — see `documents/render-context-design.md`.
 *
 * Lives in `core/ecs/` (next to World/EventEmitter) because it is stateful runtime
 * machinery owned by the World, not a pure type alias — it only depends on the
 * `RectArea` leaf type, so there is no cycle.
 *
 * Ownership of each field (who writes / who reads):
 */
export class RenderContext {
  // ===== Decision: IdleFrameSkipSystem writes; RenderSystem + layers read ====
  /** This frame's render mode. */
  mode: RenderMode = 'rebuild';
  /** World-space dirty rects for a `'partial'` frame; null otherwise. */
  dirtyRects: RectArea[] | null = null;

  // ===== Config: host (UI/controller) writes; skip system + layers read ======
  /** Whether pan-cache layers may reuse their cache on `'transform'` frames. */
  panCacheEnabled = true;
  /** Whether localized content changes patch dirty rects vs force a full rebuild. */
  partialEnabled = true;

  // ===== View state: RenderSystem writes each frame; others read =============
  readonly cameraOffset: [number, number] = [0, 0];
  zoom = 1;
  readonly viewport: RectArea = [0, 0, 0, 0];
  dpr = 1;

  /** RenderSystem mirrors the current view state here each frame for others to read. */
  setView(cameraOffset: [number, number], zoom: number, viewport: RectArea, dpr: number): void {
    this.cameraOffset[0] = cameraOffset[0];
    this.cameraOffset[1] = cameraOffset[1];
    this.zoom = zoom;
    this.viewport[0] = viewport[0];
    this.viewport[1] = viewport[1];
    this.viewport[2] = viewport[2];
    this.viewport[3] = viewport[3];
    this.dpr = dpr;
  }
}
