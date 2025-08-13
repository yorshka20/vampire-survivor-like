import { DamageTextComponent } from '@ecs/components';
import { RenderLayerIdentifier, RenderLayerPriority } from '@ecs/constants/renderLayerPriority';
import { Entity } from '@ecs/core/ecs/Entity';
import { RectArea } from '@ecs/utils/types';
import { CanvasRenderLayer } from '../base';

/**
 * Canvas-based damage text layer.
 *
 * Draws floating damage numbers directly onto a canvas context instead of using DOM nodes.
 * This avoids layout/paint overhead from many DOM elements and leverages the existing
 * shared main canvas for z-ordering and clearing.
 */
export class DamageTextCanvasLayer extends CanvasRenderLayer {
  constructor(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
    // Use the shared main canvas so this layer is composited with the rest of the scene
    super(RenderLayerIdentifier.DAMAGE_TEXT, RenderLayerPriority.DAMAGE_TEXT, canvas, context);
  }

  /**
   * Update all damage text entities: advance timers, cull expired, and draw to canvas.
   */
  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void {
    // Do not clear here because we are sharing the main canvas.
    // The RenderSystem clears the main canvas once per frame before layers update.

    const entities = this.getLayerEntities(viewport);
    for (const entity of entities) {
      const dmg = entity.getComponent<DamageTextComponent>(DamageTextComponent.componentName);
      if (!dmg) continue;

      // Advance lifetime
      dmg.elapsed += deltaTime;

      // Remove expired damage text entities
      if (dmg.elapsed >= dmg.lifetime) {
        this.getWorld().removeEntity(entity);
        continue;
      }

      // Draw current frame of the damage text
      this.drawDamageText(dmg, cameraOffset);
    }
  }

  /**
   * Filter only damage text entities. We intentionally skip viewport checks because
   * damage text entities manage their own positions and are short-lived.
   */
  filterEntity(entity: Entity, _viewport: RectArea): boolean {
    return entity.type === 'damageText';
  }

  /**
   * Draws a single damage text instance with fade-out effect based on elapsed time.
   */
  private drawDamageText(dmg: DamageTextComponent, cameraOffset: [number, number]): void {
    const [x, y] = dmg.position;

    // Fade opacity from 1 -> 0 over lifetime
    const alpha = Math.max(0, 1 - dmg.elapsed / dmg.lifetime);

    // Choose font size/weight based on critical flag
    const fontSize = dmg.isCritical ? 20 : 16;
    const fontWeight = dmg.isCritical ? '700' : '600';

    this.ctx.save();
    try {
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = dmg.color; // color already string-based (e.g., 'white', 'yellow')
      this.ctx.font = `${fontWeight} ${fontSize}px Arial, sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';

      // Position with camera offset so text follows the camera
      const dx = x + cameraOffset[0];
      const dy = y + cameraOffset[1];

      // Simple outline for readability over varied backgrounds
      this.ctx.lineWidth = 3;
      this.ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      this.ctx.strokeText(dmg.text, dx, dy);
      this.ctx.fillText(dmg.text, dx, dy);
    } finally {
      this.ctx.restore();
    }
  }
}
