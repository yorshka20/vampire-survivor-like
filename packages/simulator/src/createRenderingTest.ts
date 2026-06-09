import {
  MouseInteractSystem,
  PhysicsSystem,
  RenderSystem,
  SpatialGridSystem,
  TransformSystem,
  World,
} from '@ecs';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { randomRgb } from '@ecs/utils/color';
import { createCanvas2dRenderer } from '@render/canvas2d';
import { createGeneralShape } from './entities/generalShape';
import { Game } from './game/Game';

export interface RenderingTestOptions {
  /** How many random entities to spawn. */
  count?: number;
  /** Base entity size; each entity is randomized to baseSize ±20%. */
  baseSize?: number;
  /**
   * Size (in CSS px) of the rectangular world region the entities are scattered
   * across, centered on the world origin. Defaults to 9x the "Large" viewport
   * (a 3x3 grid of 960x600). Converted to world units internally by the device
   * pixel ratio. The viewport is a *window* into this region — how much of it is
   * on screen, and therefore rendered, depends on viewport size + zoom.
   */
  regionCssWidth?: number;
  regionCssHeight?: number;
  /** Called as entities stream in (and on clear), with (loaded, target). */
  onProgress?: (loaded: number, target: number) => void;
}

/** "Large" viewport footprint (CSS px); the default region is a 3x3 grid of these. */
const LARGE_VIEWPORT = { width: 960, height: 600 };
const DEFAULT_REGION_CSS = { width: LARGE_VIEWPORT.width * 3, height: LARGE_VIEWPORT.height * 3 };

/** Per-frame spawn time budget (ms). Keeps the page responsive while loading. */
const SPAWN_BUDGET_MS = 6;
/** Spawn this many entities between wall-clock checks (clock reads aren't free). */
const SPAWN_CHUNK = 256;

export interface RenderingTestController {
  game: Game;
  world: World;
  renderSystem: RenderSystem;
  /** Rebuild the population: clear, then progressively load `n` entities (optionally at a new base size). */
  regenerate: (n: number, baseSize?: number) => void;
  /** Remove every spawned 'object' entity and stop any in-flight load. */
  clearEntities: () => void;
  /** Entities currently in the world. */
  getLoadedCount: () => number;
  /** Entities drawn on the last rendered frame (i.e. inside the viewport). */
  getVisibleCount: () => number;
  /** Entities the in-flight (or last) load is aiming for. */
  getTargetCount: () => number;
  /** Re-fit the renderer + culling viewport to the current canvas size (view-preserving). */
  syncViewport: () => void;
  /** Put the given world point at the center of the viewport. */
  centerOn: (worldX: number, worldY: number) => void;
  /** Current region extent (world units). */
  getRegionSize: () => { width: number; height: number };
  /** Stop the loader (call before tearing the harness down). */
  dispose: () => void;
}

/** Random float in [min, max). */
function randFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Bootstraps a stripped-down ECS world dedicated to render benchmarking.
 *
 * The entities occupy a fixed world region centered on the origin; the camera is
 * centered on that origin and the viewport is just a window onto it. Shrinking the
 * viewport (or zooming in) puts fewer of the entities on screen, so the number
 * actually rendered tracks the viewport — it is NOT pinned to the full population.
 *
 * Entities stream in under a per-frame time budget rather than all at once, so the
 * first screen is interactive immediately and a live "loaded" count can be shown.
 *
 * Collision / border / force-field / ray-tracing are all omitted: the only load
 * measured is the renderer drawing whatever falls inside the viewport, plus the
 * cost of panning/zooming. Entities are static; the camera is the moving part.
 * MouseInteract + Transform are kept so entities stay selectable and drag-movable.
 */
export async function createRenderingTest(
  rootElement: HTMLElement,
  options: RenderingTestOptions = {},
): Promise<RenderingTestController> {
  const onProgress = options.onProgress;
  let baseSize = options.baseSize ?? 6;

  const game = new Game();
  const world = game.getWorld();

  world.addSystem(new PhysicsSystem());
  world.addSystem(new TransformSystem());
  world.addSystem(new MouseInteractSystem());
  world.setSpatialGridCellSize(64);

  // rayTracing = false: a 2D shape throughput test, the ray tracer would dominate.
  const renderSystem = new RenderSystem(rootElement);
  const renderer = createCanvas2dRenderer(rootElement, 'rendering-test', false);
  renderSystem.setRenderer(renderer);
  renderSystem.init();
  world.addSystem(renderSystem);

  // World coords live in device pixels (the main canvas ctx is not dpr-scaled), so
  // the region is the requested CSS footprint times the dpr. It is fixed for the
  // lifetime of the harness — regenerating with a different count changes density,
  // not the area the crowd occupies.
  const dpr = renderSystem.getDevicePixelRatio();
  const regionWidth = (options.regionCssWidth ?? DEFAULT_REGION_CSS.width) * dpr;
  const regionHeight = (options.regionCssHeight ?? DEFAULT_REGION_CSS.height) * dpr;

  // NOTE: we do NOT use coarse mode here. RenderSystem.setCoarseMode(1) and
  // Canvas2dRenderer.onResize() (which uses the capped device pixel ratio) would
  // disagree, leaving the canvas backing store at 2x while coords are computed at
  // 1x — that cramps everything into the top-left and offsets pointer hit-testing.
  // Instead the real (capped) DPR flows consistently through both: the canvas
  // backing store, the culling viewport, and screenToWorld all use the same dpr.

  await game.initialize();

  // Keep Performance (HUD reads it); drop the spatial grid — nothing queries it
  // here and rebuilding it every logic frame over 50k entities is pure waste.
  const spatialGrid = world.getSystem<SpatialGridSystem>(
    'SpatialGridSystem',
    SystemPriorities.SPATIAL_GRID,
  );
  if (spatialGrid) {
    // Don't run the per-frame grid maintenance (entities are static, nothing
    // crosses cells), but the grid is still populated on insert via the
    // onEntityAdded subscription — so it stays a valid index for pointer hit-testing
    // and for counting how many entities fall in the viewport.
    spatialGrid.enabled = false;
  }
  const gridComponent = spatialGrid?.getSpatialGridComponent() ?? null;

  // ===== Camera helpers ======================================================

  const getViewCenterWorld = (): [number, number] => {
    const vp = renderSystem.getViewport();
    const z = renderSystem.getZoom();
    const off = renderSystem.getCameraOffset();
    return [vp[2] / 2 / z - off[0], vp[3] / 2 / z - off[1]];
  };

  const centerOn = (worldX: number, worldY: number) => {
    const vp = renderSystem.getViewport();
    const z = renderSystem.getZoom();
    const off = renderSystem.getCameraOffset();
    // canvasPixel = z * (world + off); we want world (worldX,worldY) at vp center.
    off[0] = vp[2] / 2 / z - worldX;
    off[1] = vp[3] / 2 / z - worldY;
  };

  /**
   * Count entities currently inside the viewport by querying the spatial grid for
   * the cells the visible world rect covers, deduping ids that span cells. This is
   * a direct viewport→cells lookup — no per-frame bookkeeping from the renderer.
   */
  const countEntitiesInViewport = (): number => {
    if (!gridComponent) {
      return 0;
    }
    const vp = renderSystem.getViewport();
    const z = renderSystem.getZoom();
    const off = renderSystem.getCameraOffset();
    const cs = gridComponent.cellSize;
    // Visible world rect: invert canvasPixel = z * (world + off).
    const cx0 = Math.floor((vp[0] / z - off[0]) / cs);
    const cx1 = Math.floor(((vp[0] + vp[2]) / z - off[0]) / cs);
    const cy0 = Math.floor((vp[1] / z - off[1]) / cs);
    const cy1 = Math.floor(((vp[1] + vp[3]) / z - off[1]) / cs);

    const seen = new Set<string>();
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const cell = gridComponent.getCellByKey(`${cx},${cy}`);
        if (cell) {
          for (const id of cell.objects) {
            seen.add(id);
          }
        }
      }
    }
    return seen.size;
  };

  const syncViewport = () => {
    // Preserve whatever world point is currently centered, so a viewport resize
    // changes how much is visible without yanking the view around.
    const center = getViewCenterWorld();
    renderSystem.getRenderer().onResize();
    renderSystem.setViewport([
      0,
      0,
      rootElement.clientWidth * renderSystem.getDevicePixelRatio(),
      rootElement.clientHeight * renderSystem.getDevicePixelRatio(),
    ]);
    centerOn(center[0], center[1]);
  };

  // ===== Population (throttled progressive loader) ===========================

  const halfW = regionWidth / 2;
  const halfH = regionHeight / 2;

  const spawnOne = () => {
    const size = randFloat(baseSize * 0.8, baseSize * 1.2);
    const entity = createGeneralShape(world, {
      position: [randFloat(-halfW, halfW), randFloat(-halfH, halfH)],
      size,
      velocity: [0, 0],
      color: randomRgb(1),
    });
    world.addEntity(entity);
  };

  const getLoadedCount = () => world.getEntitiesByType('object').length;

  let target = 0;
  let rafId = 0;

  const tick = () => {
    rafId = 0;
    const startedAt = performance.now();
    let loaded = getLoadedCount();

    while (loaded < target) {
      const stop = Math.min(target, loaded + SPAWN_CHUNK);
      for (let i = loaded; i < stop; i++) {
        spawnOne();
      }
      loaded = stop;
      if (performance.now() - startedAt >= SPAWN_BUDGET_MS) {
        break;
      }
    }

    onProgress?.(loaded, target);
    if (loaded < target) {
      rafId = requestAnimationFrame(tick);
    }
  };

  const startLoading = (total: number) => {
    target = total;
    onProgress?.(getLoadedCount(), target);
    if (!rafId && getLoadedCount() < target) {
      rafId = requestAnimationFrame(tick);
    }
  };

  const cancelLoading = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  const clearEntities = () => {
    cancelLoading();
    world.removeEntitiesByType('object');
    target = 0;
    onProgress?.(0, 0);
  };

  // ===== Initial layout ======================================================

  // Set the viewport first, then center the camera on the region origin so the
  // crowd straddles the screen center, then kick off the progressive load.
  syncViewport();
  centerOn(0, 0);
  startLoading(options.count ?? 50000);

  return {
    game,
    world,
    renderSystem,
    regenerate: (n: number, newBaseSize?: number) => {
      cancelLoading();
      world.removeEntitiesByType('object');
      if (newBaseSize !== undefined) {
        baseSize = newBaseSize;
      }
      centerOn(0, 0);
      startLoading(n);
    },
    clearEntities,
    getLoadedCount,
    getVisibleCount: countEntitiesInViewport,
    getTargetCount: () => target,
    syncViewport,
    centerOn,
    getRegionSize: () => ({ width: regionWidth, height: regionHeight }),
    dispose: cancelLoading,
  };
}
