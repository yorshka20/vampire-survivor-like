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
import { RenderContext, RenderMode } from '@ecs/core/ecs/RenderContext';
import { RectArea } from '@ecs/types/types';

/**
 * Buckets whose entities can change every frame (interaction: hover / select /
 * drag). The cheap detection hashes only these; everything else is assumed
 * static and tracked structurally via the add/remove content epoch. Extend this
 * list with any other genuinely per-frame-dynamic bucket (e.g. AnimationComponent).
 */
const DYNAMIC_BUCKETS: { componentName: string }[] = [InteractActiveComponent];

/** Above this many dirty rects in a frame, fall back to a full rebuild. */
const MAX_DIRTY_RECTS = 64;
/** Pad each dirty rect so stroke/anti-alias bleed outside the fill AABB is covered. */
const DIRTY_PAD = 4;

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
  private hasLast = false;
  private lastContent = 0;
  private lastStruct = 0;
  private lastOffsetX = 0;
  private lastOffsetY = 0;

  /**
   * Bumped on every entity add/remove so spawn/clear/recycle force a redraw even
   * if the dirty-rect list overflows (the content signature folds it in).
   */
  private contentEpoch = 0;
  /** This frame's accumulated dirty rects from add/remove (world space). */
  private pendingDirty: RectArea[] = [];
  /** Set when too many add/remove rects piled up → fall back to full rebuild. */
  private dirtyOverflow = false;
  /** Last rendered AABB of each dynamic-bucket entity, to compute move rects. */
  private readonly lastDynAabb = new Map<string, RectArea>();

  private readonly onContentChanged = (entity: Entity): void => {
    this.contentEpoch = (this.contentEpoch + 1) | 0;
    if (this.pendingDirty.length >= MAX_DIRTY_RECTS) {
      this.dirtyOverflow = true;
      return;
    }
    const rect = this.entityAabb(entity);
    if (rect) {
      this.pendingDirty.push(rect);
    }
  };

  constructor() {
    super('IdleFrameSkipSystem', SystemPriorities.RENDER_SKIP, 'render');
  }

  init(): void {
    super.init();
    this.world.onEntityAdded.subscribe(this.onContentChanged);
    this.world.onEntityRemoved.subscribe(this.onContentChanged);
  }

  destroy(): void {
    this.world.onEntityAdded.unsubscribe(this.onContentChanged);
    this.world.onEntityRemoved.unsubscribe(this.onContentChanged);
  }

  update(_deltaTime: number, _systemType: SystemType): void {
    // Read view state (written last frame by RenderSystem) and config off the shared
    // context; write this frame's decision back to it. No reach into RenderSystem.
    const ctx = this.world.renderContext;

    const content = this.contentSig();
    const struct = this.structSig(ctx);
    const offset = ctx.cameraOffset;

    // Build this frame's dirty rects (add/remove + dynamic-entity moves) and keep
    // lastDynAabb current. Done every frame so a later 'partial' has correct deltas.
    const dirty = this.collectDirtyRects();

    const { mode, dirtyRects } = this.classifyMode(content, struct, offset, dirty, ctx);
    ctx.mode = mode;
    ctx.dirtyRects = dirtyRects;

    this.pendingDirty = [];
    this.dirtyOverflow = false;
    this.lastContent = content;
    this.lastStruct = struct;
    this.lastOffsetX = offset[0];
    this.lastOffsetY = offset[1];
    this.hasLast = true;
  }

  /**
   * Decide this frame's render mode from the current signatures vs last frame:
   * structural/first → rebuild; content changed → partial (localized & enabled)
   * or rebuild (too broad / disabled); camera-only → transform; else skip.
   */
  private classifyMode(
    content: number,
    struct: number,
    offset: [number, number],
    dirty: RectArea[],
    ctx: RenderContext,
  ): { mode: RenderMode; dirtyRects: RectArea[] | null } {
    if (!this.hasLast || struct !== this.lastStruct) {
      // First frame, or zoom/viewport/dpr changed (cache invalid at new scale).
      return { mode: 'rebuild', dirtyRects: null };
    }
    if (content !== this.lastContent) {
      // Content changed. Patch just the dirty rects when enabled and localized;
      // otherwise (disabled, overflow, or too many rects) a full rebuild is cheaper.
      if (ctx.partialEnabled && !this.dirtyOverflow && dirty.length <= MAX_DIRTY_RECTS) {
        return { mode: 'partial', dirtyRects: dirty };
      }
      return { mode: 'rebuild', dirtyRects: null };
    }
    if (offset[0] !== this.lastOffsetX || offset[1] !== this.lastOffsetY) {
      // Only the camera panned → pan-cache layers can blit instead of re-raster.
      return { mode: 'transform', dirtyRects: null };
    }
    // Nothing changed at all.
    return { mode: 'skip', dirtyRects: null };
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
  private structSig(ctx: RenderContext): number {
    const vp = ctx.viewport;
    let h = mixNumber(0, ctx.zoom);
    h = mixNumber(h, vp[0]);
    h = mixNumber(h, vp[1]);
    h = mixNumber(h, vp[2]);
    h = mixNumber(h, vp[3]);
    h = mixNumber(h, ctx.dpr);
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

  /**
   * Dirty rects for this frame: pending add/remove rects plus the old∪new AABB of
   * any dynamic-bucket entity that moved/resized (and the last AABB of any that
   * left the bucket). Updates {@link lastDynAabb} as a side effect.
   */
  private collectDirtyRects(): RectArea[] {
    const rects: RectArea[] = [];
    for (let i = 0; i < this.pendingDirty.length; i++) {
      rects.push(this.pendingDirty[i]);
    }

    const dynamic = this.world.getEntitiesWithComponents(DYNAMIC_BUCKETS);
    const seen = new Set<string>();
    for (let i = 0; i < dynamic.length; i++) {
      const entity = dynamic[i];
      seen.add(entity.id);
      const aabb = this.entityAabb(entity);
      const last = this.lastDynAabb.get(entity.id);
      if (!aabb) {
        if (last) {
          rects.push(last);
          this.lastDynAabb.delete(entity.id);
        }
        continue;
      }
      if (!last || !rectEq(last, aabb)) {
        if (last) {
          rects.push(last); // repaint the area it left
        }
        rects.push(aabb); // repaint the area it now occupies
        this.lastDynAabb.set(entity.id, aabb);
      }
    }
    // Entities that left the dynamic bucket since last frame: repaint their area.
    for (const [id, last] of this.lastDynAabb) {
      if (!seen.has(id)) {
        rects.push(last);
        this.lastDynAabb.delete(id);
      }
    }
    return rects;
  }

  /** Padded world-space AABB of an entity's rendered footprint, or null if it has no geometry. */
  private entityAabb(entity: Entity): RectArea | null {
    if (
      !entity.hasComponent(TransformComponent.componentName) ||
      !entity.hasComponent(ShapeComponent.componentName)
    ) {
      return null;
    }
    const t = entity.getComponent<TransformComponent>(TransformComponent.componentName);
    const s = entity.getComponent<ShapeComponent>(ShapeComponent.componentName);
    const [w, h] = s.getSize();
    const scale = t.scale;
    let ox = 0;
    let oy = 0;
    if (entity.hasComponent(RenderComponent.componentName)) {
      const off = entity.getComponent<RenderComponent>(RenderComponent.componentName).getOffset();
      ox = off[0];
      oy = off[1];
    }
    const cw = w * scale + 2 * DIRTY_PAD;
    const ch = h * scale + 2 * DIRTY_PAD;
    return [t.position[0] + ox - cw / 2, t.position[1] + oy - ch / 2, cw, ch];
  }
}

function rectEq(a: RectArea, b: RectArea): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
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
