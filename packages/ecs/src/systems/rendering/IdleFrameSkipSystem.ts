import {
  InteractActiveComponent,
  InteractComponent,
  RenderComponent,
  ShapeComponent,
  TransformComponent,
} from '@ecs/components';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { IComponent, SystemType } from '@ecs/core/ecs/types';
import { RenderMode, RenderSystem } from './RenderSystem';

/**
 * Buckets whose entities can change every frame (interaction: hover / select /
 * drag). The cheap detection hashes only these; everything else is assumed
 * static and tracked structurally via the add/remove content epoch. Extend this
 * list with any other genuinely per-frame-dynamic bucket (e.g. AnimationComponent).
 */
const DYNAMIC_BUCKETS: { componentName: string }[] = [InteractActiveComponent];

/**
 * Optional idle-frame-skip system.
 *
 * Each render tick it derives a signature of everything that affects the next
 * frame's pixels and compares it to last tick. If identical, it asks the
 * RenderSystem (running right after, at a lower priority) to skip its clear+draw.
 *
 * The signature is O(dynamic changes), NOT O(total entities): camera/viewport/dpr
 * + a content epoch bumped on entity add/remove + a hash of only the small
 * per-frame-dynamic buckets (interaction). A full per-frame hash of the whole
 * population was measured at 15–20 ms at 150k and is unusable, so the static
 * majority is tracked structurally (add/remove epoch) instead of re-hashed.
 *
 * Design notes:
 * - **Add it to get the skip; don't add it and there is zero cost.** All the
 *   logic lives here; components stay plain data. The RenderSystem only carries
 *   a default-false skip flag (one branch/frame) when this system is absent.
 * - **Fail-safe direction.** A superset / collision only causes an extra redraw
 *   (safe); a missed redraw needs a 2^-32 hash collision (one stale frame). The
 *   cheap path additionally assumes static entities change only via add/remove.
 * - Intended for near-static, grid-backed scenes (e.g. the render bench).
 */
export class IdleFrameSkipSystem extends System {
  private renderSystem: RenderSystem | null = null;
  private hasLast = false;
  private lastContent = 0;
  private lastStruct = 0;
  private lastOffsetX = 0;
  private lastOffsetY = 0;

  /**
   * Bumped on every entity add/remove. The cheap path folds this in instead of
   * re-hashing the static majority, so spawn/clear/recycle still force a redraw.
   */
  private contentEpoch = 0;
  private readonly bumpEpoch = (): void => {
    this.contentEpoch = (this.contentEpoch + 1) | 0;
  };

  constructor() {
    super('IdleFrameSkipSystem', SystemPriorities.RENDER_SKIP, 'render');
  }

  private getRenderSystem() {
    if (!this.renderSystem) {
      this.renderSystem = RenderSystem.getInstance();
    }
    return this.renderSystem;
  }

  init(): void {
    super.init();
    this.world.onEntityAdded.subscribe(this.bumpEpoch);
    this.world.onEntityRemoved.subscribe(this.bumpEpoch);
  }

  destroy(): void {
    this.world.onEntityAdded.unsubscribe(this.bumpEpoch);
    this.world.onEntityRemoved.unsubscribe(this.bumpEpoch);
  }

  update(_deltaTime: number, _systemType: SystemType): void {
    const renderSystem = this.getRenderSystem();

    const content = this.contentSig();
    const struct = this.structSig(renderSystem);
    const offset = renderSystem.getCameraOffset();

    let mode: RenderMode;
    if (!this.hasLast || content !== this.lastContent || struct !== this.lastStruct) {
      // Content changed, or zoom/viewport/dpr changed → must re-raster.
      mode = 'rebuild';
    } else if (offset[0] !== this.lastOffsetX || offset[1] !== this.lastOffsetY) {
      // Only the camera panned → pan-cache layers can blit instead of re-raster.
      mode = 'transform';
    } else {
      // Nothing changed at all.
      mode = 'skip';
    }
    renderSystem.setRenderMode(mode);

    this.lastContent = content;
    this.lastStruct = struct;
    this.lastOffsetX = offset[0];
    this.lastOffsetY = offset[1];
    this.hasLast = true;
  }

  /**
   * Camera-independent content signature. Cost is O(dynamic-bucket size),
   * independent of total entity count: content epoch (structural add/remove) +
   * a hash of only the per-frame-dynamic buckets (interaction). Assumes the
   * static majority changes only via add/remove — true for the near-static
   * scenes this system targets.
   */
  private contentSig(): number {
    let h = mixInt(0, this.contentEpoch);
    const dynamic = this.world.getEntitiesWithComponents(DYNAMIC_BUCKETS);
    let acc = 0;
    for (let i = 0; i < dynamic.length; i++) {
      acc = (acc + this.hashEntity(dynamic[i])) | 0;
    }
    h = mixInt(h, acc);
    return mixInt(h, dynamic.length);
  }

  /**
   * Scale/structure signature (zoom, viewport, dpr). A change here forces a
   * rebuild because the pan cache is only valid at a fixed zoom/size. Camera
   * *offset* (pan) is compared separately so it can yield 'transform' instead.
   */
  private structSig(rs: RenderSystem): number {
    const vp = rs.getViewport();
    let h = mixNumber(0, rs.getZoom());
    h = mixNumber(h, vp[0]);
    h = mixNumber(h, vp[1]);
    h = mixNumber(h, vp[2]);
    h = mixNumber(h, vp[3]);
    h = mixNumber(h, rs.getDevicePixelRatio());
    return h;
  }

  private hashEntity(entity: Entity): number {
    let h = mixString(0, entity.id);
    for (const ex of EXTRACTORS) {
      if (entity.hasComponent(ex.name)) {
        h = mixInt(h, ex.extract(entity.getComponent(ex.name)));
      }
    }
    return h;
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
