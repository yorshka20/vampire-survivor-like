import { InteractActiveComponent, InteractComponent, SpatialGridComponent } from '@ecs/components';
import { ShapeComponent } from '@ecs/components/physics/shape/ShapeComponent';
import { TransformComponent } from '@ecs/components/physics/TransformComponent';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { ENTITY_INSPECT_EVENT, buildEntityInspectData } from '@ecs/events/EntityInspect';
import { Point } from '@ecs/types/types';
import { isMobileDevice } from '@ecs/utils/platform';
import { SpatialGridSystem } from '../physics/SpatialGridSystem';
import { RenderSystem } from '../rendering/RenderSystem';

/**
 * Drives pointer interaction for entities that carry an {@link InteractComponent}.
 *
 * Responsibilities:
 * - Listen for mouse/touch events scoped to the renderer canvas only.
 * - Hit-test the pointer against interactive entities and maintain hover/selected
 *   state on their InteractComponent.
 * - While an entity is held, mark it `isDragging` and publish a target world
 *   position (`InteractComponent.setDragPosition`). The actual transform write is
 *   done by TransformSystem so the drag cleanly owns the position without this
 *   system reaching into physics.
 *
 * The rendering of hover/selected borders is handled separately by the render
 * pipeline, which reads the same InteractComponent state.
 */
export class MouseInteractSystem extends System {
  private isMobileDevice: boolean;

  private renderSystem: RenderSystem | null = null;
  private rootElement: HTMLElement | null = null;

  /** Entity being held/dragged by the pointer, null when idle. */
  private draggingEntity: Entity | null = null;

  /**
   * The currently hovered and selected entities. Tracking them directly (instead
   * of re-deriving from a full scan of every interactive entity) keeps both the
   * per-event work and the InteractionLayer's border rendering O(1): the only
   * entities that ever need their flags touched or a border drawn are these two.
   */
  private hovered: Entity | null = null;
  private selected: Entity | null = null;

  /**
   * Spatial hash used to answer "what's under the cursor" without scanning every
   * interactive entity. Resolved lazily from the SpatialGridSystem; null when the
   * world has no grid, in which case hit-testing falls back to a linear scan.
   */
  private interactGrid: SpatialGridComponent | null = null;

  /**
   * Offset (world space) between the entity origin and the pointer at grab time,
   * so the entity keeps its relative grab point while dragging instead of
   * snapping its center to the cursor.
   */
  private grabOffset: Point = [0, 0];

  /**
   * Extra hit radius (world units) added around a shape so tiny entities (e.g. a
   * 2px ball) are still grabbable. Shapes spawned by the general generator can be
   * only a couple pixels wide, which is otherwise impossible to click.
   */
  private readonly HIT_SLOP = 6;

  /** Set to true to print interaction diagnostics. */
  debugInteract = true;

  constructor() {
    super('MouseInteractSystem', SystemPriorities.MOUSE_INTERACT, 'logic');
    this.isMobileDevice = isMobileDevice();
  }

  init(): void {
    super.init();

    // RenderSystem is a singleton initialized before initSystems() runs, so it is
    // available here. We need it for the canvas element (event scoping) and for
    // screen -> world coordinate conversion.
    this.renderSystem = RenderSystem.getInstance();
    this.rootElement = this.renderSystem.getRootElement();

    const target = this.rootElement;
    if (this.isMobileDevice) {
      target.addEventListener('touchstart', this.handleTouchStart, { passive: false });
      target.addEventListener('touchmove', this.handleTouchMove, { passive: false });
      target.addEventListener('touchend', this.handleTouchEnd);
      target.addEventListener('touchcancel', this.handleTouchEnd);
    } else {
      target.addEventListener('mousedown', this.handleMouseDown);
      target.addEventListener('mousemove', this.handleMouseMove);
      target.addEventListener('mouseup', this.handleMouseUp);
      // Leaving the canvas ends any active drag and clears hover so state never
      // gets stuck when the pointer exits the listening area.
      target.addEventListener('mouseleave', this.handleMouseLeave);
    }

    // We don't keep our own list of interactive entities — the World already
    // indexes them in the InteractComponent bucket. We only need notification when
    // an entity disappears so a stale hovered/selected/dragging reference is cleared.
    this.world.onEntityRemoved.subscribe(this.handleEntityRemoved);

    // if (this.debugInteract) {
    //   const rect = this.rootElement.getBoundingClientRect();
    //   console.log('[MouseInteract] init', {
    //     isMobileDevice: this.isMobileDevice,
    //     interactEntities: this.interactEntities.size,
    //     dpr: this.renderSystem.getDevicePixelRatio(),
    //     cameraOffset: this.renderSystem.getCameraOffset(),
    //     rootRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    //   });
    // }
  }

  destroy(): void {
    const target = this.rootElement;
    if (target) {
      if (this.isMobileDevice) {
        target.removeEventListener('touchstart', this.handleTouchStart);
        target.removeEventListener('touchmove', this.handleTouchMove);
        target.removeEventListener('touchend', this.handleTouchEnd);
        target.removeEventListener('touchcancel', this.handleTouchEnd);
      } else {
        target.removeEventListener('mousedown', this.handleMouseDown);
        target.removeEventListener('mousemove', this.handleMouseMove);
        target.removeEventListener('mouseup', this.handleMouseUp);
        target.removeEventListener('mouseleave', this.handleMouseLeave);
      }
    }

    this.world.onEntityRemoved.unsubscribe(this.handleEntityRemoved);

    this.draggingEntity = null;
    this.hovered = null;
    this.selected = null;
  }

  update(): void {
    // All interaction state is updated synchronously inside the DOM event
    // handlers; nothing to do per-frame here.
  }

  setEnable(enable: boolean) {
    this.enabled = enable;
    if (!enable) {
      // Drop hover first so the inspect channel emits null and any DOM HUD clears,
      // then tear down the listeners.
      this.clearHover();
      this.destroy();
    } else {
      this.init();
    }
  }

  // ===== Entity bookkeeping =================================================

  private handleEntityRemoved = (entity: Entity) => {
    if (this.draggingEntity === entity) {
      this.draggingEntity = null;
    }
    if (this.hovered === entity) {
      this.hovered = null;
    }
    if (this.selected === entity) {
      this.selected = null;
    }
  };

  /**
   * Reflect an entity's "active" interaction state (hovered or selected) as the
   * presence of an {@link InteractActiveComponent}. This keeps the active set in a
   * dedicated, tiny World bucket so renderers can pull it without scanning the full
   * interactive set. Called whenever this system flips an entity's hover/select.
   */
  private syncActiveTag(entity: Entity): void {
    const interact = this.getInteract(entity);
    const active = interact.isHovered || interact.isSelected;
    const has = entity.hasComponent(InteractActiveComponent.componentName);
    if (active && !has) {
      entity.addComponent(this.world.createComponent(InteractActiveComponent, undefined));
    } else if (!active && has) {
      entity.removeComponent(InteractActiveComponent.componentName);
    }
  }

  // ===== Mouse handlers =====================================================

  private handleMouseDown = (event: MouseEvent) => {
    // Only react to the primary (left) button for selection/drag. Ctrl+left is
    // reserved as a camera-pan gesture by callers, so ignore it here to avoid
    // grabbing an entity at the same time.
    if (event.button !== 0 || event.ctrlKey) {
      return;
    }
    const [worldX, worldY] = this.screenToWorld(event.clientX, event.clientY);
    this.beginInteraction(worldX, worldY);
  };

  private handleMouseMove = (event: MouseEvent) => {
    const [worldX, worldY] = this.screenToWorld(event.clientX, event.clientY);
    this.moveInteraction(worldX, worldY);
  };

  private handleMouseUp = (event: MouseEvent) => {
    if (event.button !== 0) {
      return;
    }
    const [worldX, worldY] = this.screenToWorld(event.clientX, event.clientY);
    this.endInteraction(worldX, worldY);
  };

  private handleMouseLeave = () => {
    // End any drag but keep the current selection; just drop hover.
    this.endDrag();
    this.clearHover();
  };

  // ===== Touch handlers (mirror mouse behavior with the first touch) =======

  private handleTouchStart = (event: TouchEvent) => {
    if (event.touches.length === 0) {
      return;
    }
    const touch = event.touches[0];
    const [worldX, worldY] = this.screenToWorld(touch.clientX, touch.clientY);
    if (this.beginInteraction(worldX, worldY)) {
      // Prevent the page from scrolling while dragging an entity.
      event.preventDefault();
    }
  };

  private handleTouchMove = (event: TouchEvent) => {
    if (event.touches.length === 0) {
      return;
    }
    const touch = event.touches[0];
    const [worldX, worldY] = this.screenToWorld(touch.clientX, touch.clientY);
    this.moveInteraction(worldX, worldY);
    if (this.draggingEntity) {
      event.preventDefault();
    }
  };

  private handleTouchEnd = (event: TouchEvent) => {
    // changedTouches holds the lifted finger; fall back to the last drag target.
    const touch = event.changedTouches[0];
    if (touch) {
      const [worldX, worldY] = this.screenToWorld(touch.clientX, touch.clientY);
      this.endInteraction(worldX, worldY);
    } else {
      this.endDrag();
    }
    this.clearHover();
  };

  // ===== Interaction core ===================================================

  /**
   * Pointer-press: select the hit entity (deselecting others) and start dragging
   * it. A miss clears the current selection. Returns true when an entity was hit.
   */
  private beginInteraction(worldX: number, worldY: number): boolean {
    const hit = this.hitTest(worldX, worldY);

    // if (this.debugInteract) {
    //   console.log('[MouseInteract] press', {
    //     world: [Math.round(worldX), Math.round(worldY)],
    //     candidates: this.interactEntities.size,
    //     hit: hit ? { id: hit.id, type: hit.type } : null,
    //   });
    // }

    if (!hit) {
      this.deselectAll();
      this.clearHover();
      return false;
    }

    const transform = hit.getComponent<TransformComponent>(TransformComponent.componentName);
    const [px, py] = transform.getPosition();
    this.grabOffset[0] = worldX - px;
    this.grabOffset[1] = worldY - py;

    // Clicking an entity makes it the sole selection. Only the previously selected
    // / hovered entities need their flags cleared — no scan over all entities.
    if (this.selected && this.selected !== hit) {
      const prev = this.selected;
      const prevInteract = this.getInteract(prev);
      prevInteract.setState({ isSelected: false, isActive: false, isDragging: false });
      prevInteract.setDragPosition(null);
      this.syncActiveTag(prev);
    }
    if (this.hovered && this.hovered !== hit) {
      const prevHover = this.hovered;
      this.getInteract(prevHover).setState({ isHovered: false });
      this.syncActiveTag(prevHover);
    }

    this.selected = hit;
    this.hovered = hit;
    this.draggingEntity = hit;

    const hitInteract = this.getInteract(hit);
    hitInteract.setState({
      isSelected: true,
      isActive: true,
      isHovered: true,
      isDragging: true,
    });
    hitInteract.setDragPosition([px, py]);
    this.syncActiveTag(hit);

    return true;
  }

  /**
   * Pointer-move: when holding an entity, publish its new target position;
   * otherwise just refresh hover state.
   */
  private moveInteraction(worldX: number, worldY: number): void {
    if (this.draggingEntity) {
      const interact = this.getInteract(this.draggingEntity);
      interact.setDragPosition([worldX - this.grabOffset[0], worldY - this.grabOffset[1]]);
      return;
    }
    this.updateHover(worldX, worldY);
  }

  /**
   * Pointer-release: stop dragging (selection persists) and re-evaluate hover at
   * the release position.
   */
  private endInteraction(worldX: number, worldY: number): void {
    this.endDrag();
    this.updateHover(worldX, worldY);
  }

  private endDrag(): void {
    if (!this.draggingEntity) {
      return;
    }
    const interact = this.getInteract(this.draggingEntity);
    interact.setState({ isActive: false, isDragging: false });
    interact.setDragPosition(null);
    this.draggingEntity = null;
  }

  private updateHover(worldX: number, worldY: number): void {
    const hit = this.hitTest(worldX, worldY);
    if (hit === this.hovered) {
      return; // hover target unchanged — nothing to update
    }
    // Only the entity leaving hover and the one entering it change state.
    const prev = this.hovered;
    this.hovered = hit;
    if (prev) {
      this.getInteract(prev).setState({ isHovered: false });
      this.syncActiveTag(prev);
    }
    if (hit) {
      this.getInteract(hit).setState({ isHovered: true });
      this.syncActiveTag(hit);
    }
    this.emitHovered();
  }

  private clearHover(): void {
    if (this.hovered) {
      const prev = this.hovered;
      this.hovered = null;
      this.getInteract(prev).setState({ isHovered: false });
      this.syncActiveTag(prev);
      this.emitHovered();
    }
  }

  /**
   * Publish the currently hovered entity (or `null` when hover cleared) on the
   * outbound inspect channel for any DOM listener. Lazy + async: if nothing is
   * subscribed, this costs a single map lookup and builds no payload; when it is,
   * the snapshot is delivered on a microtask so the listener's work never runs
   * inside this DOM event handler. Call only on a genuine hover *change*.
   */
  private emitHovered(): void {
    const hovered = this.hovered;
    this.world.emit(ENTITY_INSPECT_EVENT, () =>
      hovered ? buildEntityInspectData(hovered) : null,
    );
  }

  private deselectAll(): void {
    if (this.selected) {
      const prev = this.selected;
      this.selected = null;
      const interact = this.getInteract(prev);
      interact.setState({ isSelected: false, isActive: false, isDragging: false });
      interact.setDragPosition(null);
      this.syncActiveTag(prev);
    }
  }

  // ===== Hit testing ========================================================

  /**
   * Return the topmost interactive entity under the given world point, or null.
   * Overlapping candidates resolve to the one with the smallest footprint, which
   * is a good proxy for "on top" for the simple shapes used here.
   */
  private hitTest(worldX: number, worldY: number): Entity | null {
    let best: Entity | null = null;
    let bestArea = Infinity;

    const consider = (entity: Entity | undefined) => {
      if (!entity || !entity.hasComponent(InteractComponent.componentName)) {
        return;
      }
      const interact = this.getInteract(entity);
      if (interact.isDisabled || !this.containsPoint(entity, worldX, worldY)) {
        return;
      }
      const area = this.footprintArea(entity);
      if (area < bestArea) {
        best = entity;
        bestArea = area;
      }
    };

    const grid = this.getGrid();
    if (grid) {
      // Mouse position -> grid cells -> narrow phase. An entity's id is registered
      // in every cell its AABB covers, so a one-cell-radius query around the cursor
      // yields every candidate whose box could contain the point; we then run the
      // exact containsPoint test on that handful. No scan of the interactive set.
      const ids = grid.getNearbyEntities([worldX, worldY], grid.cellSize, 'collision');
      for (const id of ids) {
        consider(this.world.getEntityById(id));
      }
    } else {
      // No spatial grid in this world — fall back to the World's InteractComponent
      // bucket (the canonical "interactive entities" index) rather than a private set.
      for (const entity of this.world.getEntitiesWithComponents([InteractComponent])) {
        consider(entity);
      }
    }

    return best;
  }

  /** Lazily resolve the spatial grid component from the SpatialGridSystem. */
  private getGrid(): SpatialGridComponent | null {
    if (this.interactGrid) {
      return this.interactGrid;
    }
    const gridSystem = this.world.getSystem<SpatialGridSystem>(
      'SpatialGridSystem',
      SystemPriorities.SPATIAL_GRID,
    );
    if (gridSystem) {
      try {
        this.interactGrid = gridSystem.getSpatialGridComponent();
      } catch {
        this.interactGrid = null;
      }
    }
    return this.interactGrid;
  }

  /**
   * Whether (worldX, worldY) lies inside the entity's shape. Rotation is ignored
   * (the interactive shapes here are circles / axis-aligned rects).
   */
  private containsPoint(entity: Entity, worldX: number, worldY: number): boolean {
    if (
      !entity.hasComponent(TransformComponent.componentName) ||
      !entity.hasComponent(ShapeComponent.componentName)
    ) {
      return false;
    }

    const transform = entity.getComponent<TransformComponent>(TransformComponent.componentName);
    const shape = entity.getComponent<ShapeComponent>(ShapeComponent.componentName);
    const [px, py] = transform.getPosition();
    const scale = transform.scale;

    const dx = worldX - px;
    const dy = worldY - py;

    const descriptor = shape.descriptor;
    if (descriptor.type === 'circle') {
      const radius = descriptor.radius * scale + this.HIT_SLOP;
      return dx * dx + dy * dy <= radius * radius;
    }

    // Rect and every other shape fall back to their axis-aligned bounding box.
    const [halfW, halfH] = shape.getHalfExtents();
    return (
      Math.abs(dx) <= halfW * scale + this.HIT_SLOP && Math.abs(dy) <= halfH * scale + this.HIT_SLOP
    );
  }

  private footprintArea(entity: Entity): number {
    const shape = entity.getComponent<ShapeComponent>(ShapeComponent.componentName);
    const [w, h] = shape.getSize();
    return Math.max(1, w * h);
  }

  // ===== Helpers ============================================================

  private getInteract(entity: Entity): InteractComponent {
    return entity.getComponent<InteractComponent>(InteractComponent.componentName);
  }

  /**
   * Convert client (CSS pixel) coordinates into world coordinates.
   *
   * The renderer draws world position `p` at canvas device pixel
   * `p + cameraOffset` (the shared main canvas is not DPR-scaled), so a CSS pixel
   * inside the canvas maps to world space by scaling up by the DPR and undoing
   * the camera offset.
   */
  private screenToWorld(clientX: number, clientY: number): Point {
    if (!this.renderSystem || !this.rootElement) {
      return [clientX, clientY];
    }
    const rect = this.rootElement.getBoundingClientRect();
    const dpr = this.renderSystem.getDevicePixelRatio();
    const zoom = this.renderSystem.getZoom();
    const [offsetX, offsetY] = this.renderSystem.getCameraOffset();
    // Invert canvasPixel = zoom * (worldPos + cameraOffset). The shared main canvas
    // is not DPR-scaled, so first lift CSS pixels to device pixels, then undo zoom
    // and the camera offset.
    const worldX = ((clientX - rect.left) * dpr) / zoom - offsetX;
    const worldY = ((clientY - rect.top) * dpr) / zoom - offsetY;
    return [worldX, worldY];
  }
}
