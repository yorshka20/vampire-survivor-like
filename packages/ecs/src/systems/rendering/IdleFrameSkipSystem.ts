import {
  InteractComponent,
  RenderComponent,
  ShapeComponent,
  TransformComponent,
} from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { System } from '@ecs/core/ecs/System';
import { IComponent, SystemType } from '@ecs/core/ecs/types';
import { RectArea } from '@ecs/types/types';
import { RenderSystem } from './RenderSystem';

/**
 * Optional idle-frame-skip system.
 *
 * Each render tick it derives a hash of everything that affects the next frame's
 * pixels — camera/viewport/dpr plus a per-component projection of every visible
 * entity — and compares it to last tick. If identical, it asks the RenderSystem
 * (running right after, at a lower priority) to skip its clear+draw, so a fully
 * static scene costs ~one cheap hash pass instead of a full re-raster.
 *
 * Design notes:
 * - **Add it to get the skip; don't add it and there is zero cost.** All the
 *   hashing lives here; components stay plain data. The RenderSystem only carries
 *   a default-false skip flag (one branch/frame) when this system is absent.
 * - **Change detection, not write interception.** We observe the resulting state
 *   each frame rather than tracking who mutated what, so in-place mutation and
 *   object pooling are unaffected, and nothing can "forget" to mark dirty.
 * - **Fail-safe direction.** Hashing a superset / colliding only ever causes an
 *   extra redraw (safe); the only danger — a missed redraw — needs a 2^-32 hash
 *   collision, and even then it is a single stale frame.
 * - Relies on the spatial grid for the visible set (same query the layers cull
 *   with, so the per-tick result is shared). Intended for grid-backed scenes.
 */
export class IdleFrameSkipSystem extends System {
  private renderSystem: RenderSystem | null = null;
  private lastHash = 0;
  private hasLast = false;

  constructor() {
    super('IdleFrameSkipSystem', SystemPriorities.RENDER_SKIP, 'render');
  }

  update(_deltaTime: number, _systemType: SystemType): void {
    if (!this.renderSystem) {
      try {
        this.renderSystem = RenderSystem.getInstance();
      } catch {
        return; // renderer not ready yet
      }
    }

    const hash = this.computeHash(this.renderSystem);
    if (this.hasLast && hash === this.lastHash) {
      this.renderSystem.requestSkip();
    }
    this.lastHash = hash;
    this.hasLast = true;
  }

  private computeHash(rs: RenderSystem): number {
    const offset = rs.getCameraOffset();
    const zoom = rs.getZoom();
    const viewport = rs.getViewport();
    const dpr = rs.getDevicePixelRatio();

    // Global state that affects every pixel regardless of per-entity data.
    let global = 0;
    global = mixNumber(global, offset[0]);
    global = mixNumber(global, offset[1]);
    global = mixNumber(global, zoom);
    global = mixNumber(global, viewport[0]);
    global = mixNumber(global, viewport[1]);
    global = mixNumber(global, viewport[2]);
    global = mixNumber(global, viewport[3]);
    global = mixNumber(global, dpr);

    // Visible set: same world rect the layers cull with, so this reuses the
    // per-tick viewport-query cache instead of computing a second time.
    const worldRect = toWorldRect(viewport, offset, zoom);
    const entities = this.world.getEntitiesInViewport(worldRect);

    // Commutative combine (order-independent: the grid's iteration order may vary
    // frame to frame). Entity id is folded in so swapping values between two
    // entities still changes the sum.
    let acc = 0;
    let count = 0;
    for (const entity of entities) {
      let h = mixString(0, entity.id);
      for (const ex of EXTRACTORS) {
        if (entity.hasComponent(ex.name)) {
          h = mixInt(h, ex.extract(entity.getComponent(ex.name)));
        }
      }
      acc = (acc + h) | 0;
      count++;
    }

    return mixInt(mixInt(global, acc), count);
  }
}

// ===== Per-component hash extractors =========================================
// The knowledge of which fields are render-relevant lives here, alongside the
// optional feature — not inside the components. Adding a new render-relevant
// component means adding one row; components stay untouched.

type Extractor = { name: string; extract: (c: IComponent) => number };

const EXTRACTORS: Extractor[] = [
  {
    name: TransformComponent.componentName,
    extract: (c) => {
      const t = c as TransformComponent;
      let h = mixNumber(0, t.position[0]);
      h = mixNumber(h, t.position[1]);
      h = mixNumber(h, t.rotation);
      h = mixNumber(h, t.scale);
      return h;
    },
  },
  {
    name: RenderComponent.componentName,
    extract: (c) => {
      const r = c as RenderComponent;
      const color = r.getColor(); // stored ref, no allocation
      const off = r.getOffset();
      let h = mixNumber(0, color.r);
      h = mixNumber(h, color.g);
      h = mixNumber(h, color.b);
      h = mixNumber(h, color.a);
      h = mixNumber(h, off[0]);
      h = mixNumber(h, off[1]);
      h = mixNumber(h, r.getRotation());
      h = mixInt(h, r.isVisible() ? 1 : 0);
      return h;
    },
  },
  {
    // Descriptor changes (incl. pooled recreate) bump `version`; cheaper and
    // safer than re-hashing geometry each frame.
    name: ShapeComponent.componentName,
    extract: (c) => mixInt(0, (c as ShapeComponent).version),
  },
  {
    // Hover/selected borders are drawn from this state, so changes must redraw.
    name: InteractComponent.componentName,
    extract: (c) => {
      const i = c as InteractComponent;
      return mixInt(0, (i.isHovered ? 1 : 0) | (i.isSelected ? 2 : 0));
    },
  },
];

// ===== Hashing helpers =======================================================
// 32-bit integer mixing (MurmurHash3 finalizer-style). Floats are hashed by
// their exact bits via a shared buffer so there is no tolerance to tune.

const _f64 = new Float64Array(1);
const _i32 = new Int32Array(_f64.buffer);

function mixInt(h: number, x: number): number {
  x = Math.imul(x, 0xcc9e2d51);
  x = (x << 15) | (x >>> 17);
  x = Math.imul(x, 0x1b873593);
  h ^= x;
  h = (h << 13) | (h >>> 19);
  h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  return h;
}

function mixNumber(h: number, n: number): number {
  _f64[0] = n;
  return mixInt(mixInt(h, _i32[0]), _i32[1]);
}

function mixString(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) {
    h = mixInt(h, s.charCodeAt(i));
  }
  return h;
}

/** Visible world rect: invert canvasPixel = zoom * (world + cameraOffset). */
function toWorldRect(viewport: RectArea, offset: [number, number], zoom: number): RectArea {
  return [
    viewport[0] / zoom - offset[0],
    viewport[1] / zoom - offset[1],
    viewport[2] / zoom,
    viewport[3] / zoom,
  ];
}
