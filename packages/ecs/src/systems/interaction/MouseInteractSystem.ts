import { InteractComponent } from '@ecs/components';
import { ShapeComponent } from '@ecs/components/physics/shape/ShapeComponent';
import { TransformComponent } from '@ecs/components/physics/TransformComponent';
import { SystemPriorities } from '@ecs/constants/systemPriorities';
import { Entity } from '@ecs/core/ecs/Entity';
import { System } from '@ecs/core/ecs/System';
import { Point } from '@ecs/types/types';
import { isMobileDevice } from '@ecs/utils/platform';
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

  /** Entities currently carrying an InteractComponent (hit-test candidates). */
  private interactEntities: Set<Entity> = new Set();

  private renderSystem: RenderSystem | null = null;
  private rootElement: HTMLElement | null = null;

  /** Entity being held/dragged by the pointer, null when idle. */
  private draggingEntity: Entity | null = null;

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

  /** Last hovered entity id, so hover logs fire only on change (not every move). */
  private lastHoveredId: string | null = null;

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

    this.refreshInteractEntities();

    this.world.onEntityAdded.subscribe(this.handleEntityAdded);
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

    this.world.onEntityAdded.unsubscribe(this.handleEntityAdded);
    this.world.onEntityRemoved.unsubscribe(this.handleEntityRemoved);

    this.interactEntities.clear();
    this.draggingEntity = null;
  }

  update(): void {
    // All interaction state is updated synchronously inside the DOM event
    // handlers; nothing to do per-frame here.
  }

  // ===== Entity bookkeeping =================================================

  private handleEntityAdded = (entity: Entity) => {
    if (entity.hasComponent(InteractComponent.componentName)) {
      this.interactEntities.add(entity);
    }
  };

  private handleEntityRemoved = (entity: Entity) => {
    this.interactEntities.delete(entity);
    if (this.draggingEntity === entity) {
      this.draggingEntity = null;
    }
  };

  private refreshInteractEntities(): void {
    this.interactEntities.clear();
    const entities = this.world.getEntitiesByCondition((entity) =>
      entity.hasComponent(InteractComponent.componentName),
    );
    for (const entity of entities) {
      this.interactEntities.add(entity);
    }
  }

  // ===== Mouse handlers =====================================================

  private handleMouseDown = (event: MouseEvent) => {
    // Only react to the primary (left) button for selection/drag.
    if (event.button !== 0) {
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
      return false;
    }

    const transform = hit.getComponent<TransformComponent>(TransformComponent.componentName);
    const [px, py] = transform.getPosition();
    this.grabOffset[0] = worldX - px;
    this.grabOffset[1] = worldY - py;

    this.draggingEntity = hit;

    for (const entity of this.interactEntities) {
      const interact = this.getInteract(entity);
      const isHit = entity === hit;
      // Clicking an entity makes it the sole selection.
      interact.setState({
        isSelected: isHit,
        isActive: isHit,
        isHovered: isHit,
        isDragging: isHit,
      });
      if (!isHit) {
        interact.setDragPosition(null);
      }
    }

    const hitInteract = this.getInteract(hit);
    hitInteract.setDragPosition([px, py]);

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
    for (const entity of this.interactEntities) {
      this.getInteract(entity).setState({ isHovered: entity === hit });
    }

    // if (this.debugInteract) {
    //   const hitId = hit ? hit.id : null;
    //   if (hitId !== this.lastHoveredId) {
    //     this.lastHoveredId = hitId;
    //     if (hit) {
    //       const transform = hit.getComponent<TransformComponent>(TransformComponent.componentName);
    //       console.log('[MouseInteract] hover', {
    //         id: hit.id,
    //         type: hit.type,
    //         entityPos: transform.getPosition().map(Math.round),
    //         world: [Math.round(worldX), Math.round(worldY)],
    //       });
    //     }
    //   }
    // }
  }

  private clearHover(): void {
    for (const entity of this.interactEntities) {
      this.getInteract(entity).setState({ isHovered: false });
    }
  }

  private deselectAll(): void {
    for (const entity of this.interactEntities) {
      const interact = this.getInteract(entity);
      interact.setState({ isSelected: false, isActive: false, isDragging: false });
      interact.setDragPosition(null);
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

    for (const entity of this.interactEntities) {
      const interact = this.getInteract(entity);
      if (interact.isDisabled) {
        continue;
      }
      if (!this.containsPoint(entity, worldX, worldY)) {
        continue;
      }
      const area = this.footprintArea(entity);
      if (area < bestArea) {
        best = entity;
        bestArea = area;
      }
    }

    return best;
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
    const [offsetX, offsetY] = this.renderSystem.getCameraOffset();
    const worldX = (clientX - rect.left) * dpr - offsetX;
    const worldY = (clientY - rect.top) * dpr - offsetY;
    return [worldX, worldY];
  }
}
