import {
  ChaseComponent,
  RenderComponent,
  ShapeComponent,
  TransformComponent,
} from '@ecs/components';
import { Entity } from '@ecs/core/ecs/Entity';
import { EntityType, IEntity } from '@ecs/core/ecs/types';
import { RectArea } from '@ecs/types/types';
import { RenderLayerIdentifier, RenderLayerPriority } from '../../constant';
import { CanvasRenderLayer, OffscreenLayerCache } from '../base';
import { RenderUtils } from '../utils/RenderUtils';

/**
 * Renders pickup entities using an offscreen-canvas cache.
 *
 * Pickups are mostly static: spawned on enemy death, then immobile until the
 * player walks into pickup range. With many on screen (7000+ has been
 * observed) the per-frame O(N) drawImage cost saturates the render budget and
 * starves the logic tick. This layer caches the static pickups onto an
 * `OffscreenLayerCache`, then each frame just blits that bitmap with the live
 * camera offset.
 *
 * Magnetized pickups (those carrying a `ChaseComponent` — actively moving
 * toward the player) are excluded from the cache and rendered live on top.
 */

const ITEM_LAYER_TYPES: EntityType[] = ['pickup'];

export class ItemRenderLayer extends CanvasRenderLayer {
  private cache = new OffscreenLayerCache(0.25);
  private cachedItemIds: Set<string> = new Set();

  constructor(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
    super(RenderLayerIdentifier.ITEM, RenderLayerPriority.ITEM, canvas, context);
  }

  protected getRelevantEntityTypes(): EntityType[] {
    return ITEM_LAYER_TYPES;
  }

  filterEntity(entity: Entity, viewport: RectArea): boolean {
    // Type guaranteed by getRelevantEntityTypes(); base filter handles components + viewport.
    return super.filterEntity(entity, viewport);
  }

  update(_deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void {
    // Offscreen canvas may need to grow on viewport resize. A resize wipes any
    // cached content → drop the id snapshot so the dirty check below forces a rebuild.
    if (this.cache.ensureSize(viewport)) {
      this.cachedItemIds.clear();
    }

    // Partition pickups: static (goes into cache) vs. magnetized (rendered live).
    const allPickups = this.getWorld().getEntitiesByType('pickup');
    const staticIds = new Set<string>();
    const magnetized: IEntity[] = [];
    for (const p of allPickups) {
      if (!p.active || p.toRemove) continue;
      if (p.hasComponent(ChaseComponent.componentName)) {
        magnetized.push(p);
      } else {
        staticIds.add(p.id);
      }
    }

    const anchor = this.cache.computeAnchor(viewport, cameraOffset);
    const cameraOutside = this.cache.isAnchorOutsideSafeBand(anchor);
    const itemsChanged = !this.setsEqual(this.cachedItemIds, staticIds);

    if (cameraOutside || itemsChanged) {
      this.cache.rebuild(anchor, (cacheCtx, syntheticOffset) => {
        for (const p of allPickups) {
          if (!p.active || p.toRemove) continue;
          if (p.hasComponent(ChaseComponent.componentName)) continue;
          const render = p.getComponent<RenderComponent>(RenderComponent.componentName);
          const transform = p.getComponent<TransformComponent>(TransformComponent.componentName);
          const shape = p.getComponent<ShapeComponent>(ShapeComponent.componentName);
          if (!render || !transform || !shape) continue;
          this.drawPickup(cacheCtx, render, transform, shape, syntheticOffset);
        }
      });
      this.cachedItemIds = staticIds;
    }

    this.cache.blit(this.ctx, cameraOffset);

    // Magnetized pickups: render live on top.
    for (const m of magnetized) {
      const render = m.getComponent<RenderComponent>(RenderComponent.componentName);
      const transform = m.getComponent<TransformComponent>(TransformComponent.componentName);
      const shape = m.getComponent<ShapeComponent>(ShapeComponent.componentName);
      if (!render || !transform || !shape) continue;
      this.drawPickup(this.ctx, render, transform, shape, cameraOffset);
    }
  }

  /**
   * Public render entry kept stable for callers; routes through `drawPickup`.
   */
  renderEntity(
    render: RenderComponent,
    transform: TransformComponent,
    shape: ShapeComponent,
    cameraOffset: [number, number],
  ): void {
    this.drawPickup(this.ctx, render, transform, shape, cameraOffset);
  }

  private drawPickup(
    ctx: CanvasRenderingContext2D,
    render: RenderComponent,
    transform: TransformComponent,
    shape: ShapeComponent,
    cameraOffset: [number, number],
  ): void {
    const position = transform.getPosition();
    const [offsetX, offsetY] = render.getOffset();
    const rotation = render.getRotation();
    const scale = render.getScale();
    const patternImage = shape.getPatternImageForState();

    const dx = cameraOffset[0] + position[0] + offsetX;
    const dy = cameraOffset[1] + position[1] + offsetY;

    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);

    if (patternImage && patternImage.complete) {
      const [sizeX, sizeY] = shape.getSize();
      const aspectRatio = patternImage.width / patternImage.height;
      let drawWidth = sizeX;
      let drawHeight = sizeY;
      if (sizeX / sizeY > aspectRatio) {
        drawWidth = sizeY * aspectRatio;
      } else {
        drawHeight = sizeX / aspectRatio;
      }
      ctx.drawImage(patternImage, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    } else {
      RenderUtils.drawShape(ctx, render, shape);
    }

    ctx.restore();
  }

  private setsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const id of a) {
      if (!b.has(id)) return false;
    }
    return true;
  }
}
