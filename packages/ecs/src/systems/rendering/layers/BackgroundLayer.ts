import { RenderComponent, StatsComponent, TransformComponent } from '@ecs/components';
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
    this.renderEffects(viewport, cameraOffset);
  }

  private renderBackground(viewport: RectArea, cameraOffset: [number, number]): void {
    if (!this.bgImage || !this.bgImage.complete) return;

    const dpr = this.renderSystem!.getDevicePixelRatio();

    // Calculate the visible area of the background
    const visibleX = Math.floor(viewport[0] - cameraOffset[0]);
    const visibleY = Math.floor(viewport[1] - cameraOffset[1]);
    const visibleWidth = Math.ceil(viewport[2]);
    const visibleHeight = Math.ceil(viewport[3]);

    // Calculate tile dimensions maintaining aspect ratio
    const tileWidth = this.bgImage.width;
    const tileHeight = this.bgImage.height;

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

    const playerPos = this.getPlayerPosition();
    if (!playerPos) return;

    // todo: define base pickup range
    const pickupRange = 50 * stats.pickupRangeMultiplier; // base is 50

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

  private renderEffects(viewport: RectArea, cameraOffset: [number, number]): void {
    const effects = this.getWorld().getEntitiesByCondition(
      (entity) =>
        (entity.isType('effect') || entity.isType('areaEffect')) &&
        this.isInViewport(entity, viewport),
    );

    for (const effect of effects) {
      const render = effect.getComponent<RenderComponent>(RenderComponent.componentName);
      const transform = effect.getComponent<TransformComponent>(TransformComponent.componentName);

      const pos = transform.getPosition();
      const size = render.getSize();
      const color = render.getColor();

      this.ctx.save();

      switch (render.getShape()) {
        case 'circle':
          // Calculate position relative to the background
          const relativeX = pos[0] + cameraOffset[0];
          const relativeY = pos[1] + cameraOffset[1];

          this.ctx.translate(relativeX, relativeY);
          this.ctx.fillStyle = this.colorToString(color);
          this.ctx.beginPath();
          this.ctx.arc(0, 0, size[0] / 2, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.closePath();
          break;
        case 'line':
          const laser = render.getLaser();
          if (!laser) {
            this.ctx.restore();
            continue;
          }

          // Calculate laser direction vector
          const dx = laser.aim[0] - pos[0];
          const dy = laser.aim[1] - pos[1];
          const length = Math.sqrt(dx * dx + dy * dy);
          const dirX = dx / length;
          const dirY = dy / length;

          // Calculate start and end points with camera offset
          const startX = pos[0] + cameraOffset[0];
          const startY = pos[1] + cameraOffset[1];
          const endX = startX + dirX * 2000; // Use a large number for "infinite" length
          const endY = startY + dirY * 2000;

          // Calculate laser lifetime (0 to 1)
          const lifeTime = (Date.now() % 1000) / 1000; // Animation cycle of 1 second
          const opacity = Math.sin(lifeTime * Math.PI); // Sine wave for smooth animation

          // Draw outer glow
          this.ctx.beginPath();
          this.ctx.shadowBlur = 20;
          this.ctx.shadowColor = this.colorToString(color);
          this.ctx.lineWidth = 20;
          this.ctx.globalAlpha = 0.3 * opacity;
          this.ctx.strokeStyle = this.colorToString(color);
          this.ctx.moveTo(startX, startY);
          this.ctx.lineTo(endX, endY);
          this.ctx.stroke();

          // Draw middle layer
          this.ctx.beginPath();
          this.ctx.shadowBlur = 10;
          this.ctx.lineWidth = 15;
          this.ctx.globalAlpha = 0.5 * opacity;
          this.ctx.moveTo(startX, startY);
          this.ctx.lineTo(endX, endY);
          this.ctx.stroke();

          // Draw core
          this.ctx.beginPath();
          this.ctx.shadowBlur = 0;
          this.ctx.lineWidth = 5;
          this.ctx.globalAlpha = opacity;
          this.ctx.moveTo(startX, startY);
          this.ctx.lineTo(endX, endY);
          this.ctx.stroke();

          // Reset context properties
          this.ctx.globalAlpha = 1;
          this.ctx.shadowBlur = 0;
          this.ctx.closePath();
          break;
      }

      this.ctx.restore();
    }
  }

  filterEntity(): boolean {
    return false; // Background layer does not filter entities
  }
}
