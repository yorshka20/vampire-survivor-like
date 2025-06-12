import { MovementComponent, RenderComponent, StatsComponent } from '@ecs/components';
import { RenderLayerIdentifier, RenderLayerPriority } from '@ecs/constants/renderLayerPriority';
import { RectArea } from '@ecs/utils/types';
import { CanvasRenderLayer } from '../base';

export class BackgroundRenderLayer extends CanvasRenderLayer {
  private bgImage?: HTMLImageElement;

  constructor(
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    bgImage?: HTMLImageElement,
  ) {
    super(RenderLayerIdentifier.BACKGROUND, RenderLayerPriority.BACKGROUND, canvas, context);
    this.bgImage = bgImage;
  }

  setBackgroundImage(image: HTMLImageElement): void {
    this.bgImage = image;
  }

  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void {
    this.renderBackground(viewport, cameraOffset);
    this.renderPickupRange(viewport, cameraOffset);
    this.renderAreaEffect(viewport, cameraOffset);
  }

  private renderBackground(viewport: RectArea, cameraOffset: [number, number]): void {
    if (!this.bgImage || !this.bgImage.complete) return;

    const [vx, vy, vw, vh] = viewport;
    const [cx, cy] = cameraOffset;
    const dpr = window.devicePixelRatio || 1;

    // Calculate the visible area of the background
    const visibleX = Math.floor(vx - cx);
    const visibleY = Math.floor(vy - cy);
    const visibleWidth = Math.ceil(vw);
    const visibleHeight = Math.ceil(vh);

    // Calculate tile dimensions maintaining aspect ratio
    const tileWidth = this.bgImage.width;
    const tileHeight = this.bgImage.height;
    const aspectRatio = tileWidth / tileHeight;

    // Calculate how many tiles we need to cover the viewport
    const tilesX = Math.ceil(visibleWidth / tileWidth) + 2; // Add extra tiles to prevent gaps
    const tilesY = Math.ceil(visibleHeight / tileHeight) + 2;

    // Calculate the starting position for the first tile
    const startX = Math.floor(visibleX / tileWidth) * tileWidth;
    const startY = Math.floor(visibleY / tileHeight) * tileHeight;

    // Draw the background tiles
    for (let y = 0; y < tilesY; y++) {
      for (let x = 0; x < tilesX; x++) {
        const tileX = startX + x * tileWidth;
        const tileY = startY + y * tileHeight;

        // Calculate the position relative to the viewport
        const drawX = tileX - visibleX;
        const drawY = tileY - visibleY;

        // Draw the tile with pixel-perfect positioning
        this.ctx.drawImage(
          this.bgImage,
          0,
          0,
          tileWidth,
          tileHeight,
          Math.round(drawX * dpr) / dpr, // Round to prevent sub-pixel rendering
          Math.round(drawY * dpr) / dpr,
          tileWidth,
          tileHeight,
        );
      }
    }
  }

  private renderPickupRange(viewport: RectArea, cameraOffset: [number, number]): void {
    const player = this.getWorld().getEntitiesByType('player')[0];
    if (!player) return;

    const stats = player.getComponent<StatsComponent>(StatsComponent.componentName);
    if (!stats) return;

    const movement = player.getComponent<MovementComponent>(MovementComponent.componentName);
    if (!movement) return;

    const render = player.getComponent<RenderComponent>(RenderComponent.componentName);
    if (!render) return;

    const playerPos = movement.getPosition();

    // todo: define base pickup range
    const pickupRange = stats.pickupRangeMultiplier * 50;

    this.ctx.save();
    // apply camera offset
    this.ctx.translate(cameraOffset[0], cameraOffset[1]);
    // set fill style to yellow with opacity
    this.ctx.fillStyle = 'rgba(255, 255, 200, 0.2)';
    this.ctx.beginPath();
    this.ctx.arc(playerPos[0], playerPos[1], pickupRange, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.closePath();
    this.ctx.restore();
  }

  private renderAreaEffect(viewport: RectArea, cameraOffset: [number, number]): void {
    const areaEffects = this.getWorld().getEntitiesByType('areaEffect');
    if (!areaEffects) return;

    for (const areaEffect of areaEffects) {
      const render = areaEffect.getComponent<RenderComponent>(RenderComponent.componentName);
      if (!render) continue;

      const position = areaEffect.getComponent<MovementComponent>(MovementComponent.componentName);
      if (!position) continue;

      if (!this.isInViewport(areaEffect, viewport)) continue;

      const pos = position.getPosition();
      const size = render.getSize();
      const color = render.getColor();

      this.ctx.save();
      // Calculate position relative to the background
      const relativeX = pos[0] + cameraOffset[0];
      const relativeY = pos[1] + cameraOffset[1];

      this.ctx.translate(relativeX, relativeY);
      this.ctx.fillStyle = this.colorToString(color);
      this.ctx.beginPath();
      this.ctx.arc(0, 0, size[0] / 2, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.closePath();
      this.ctx.restore();
    }
  }

  filterEntity(): boolean {
    return false; // Background layer does not filter entities
  }
}
