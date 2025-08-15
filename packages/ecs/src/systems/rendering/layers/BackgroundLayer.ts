import {
  RenderComponent,
  ShapeComponent,
  StatsComponent,
  TransformComponent,
} from '@ecs/components';
import { RenderLayerIdentifier, RenderLayerPriority } from '@ecs/constants/renderLayerPriority';
import { RectArea } from '@ecs/utils/types';
import { CanvasRenderLayer } from '../base';
import { RenderUtils } from '../utils/RenderUtils';

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
    this.renderBackground(deltaTime, viewport, cameraOffset);
    this.renderPickupRange(deltaTime, viewport, cameraOffset);
    this.renderEffects(deltaTime, viewport, cameraOffset);
  }

  private renderBackground(
    deltaTime: number,
    viewport: RectArea,
    cameraOffset: [number, number],
  ): void {
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

  private renderPickupRange(
    deltaTime: number,
    viewport: RectArea,
    cameraOffset: [number, number],
  ): void {
    const player = this.getWorld().getEntitiesByType('player')[0];
    if (!player) return;

    const stats = player.getComponent<StatsComponent>(StatsComponent.componentName);
    if (!stats) return;

    const playerPos = this.getPlayerPosition();
    if (!playerPos) return;

    // todo: define base pickup range
    const pickupRange = Math.min(50 * stats.pickupRangeMultiplier, 200); // base is 50

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

  private renderEffects(
    deltaTime: number,
    viewport: RectArea,
    cameraOffset: [number, number],
  ): void {
    const effects = this.getWorld().getEntitiesByCondition(
      (entity) =>
        (entity.isType('effect') || entity.isType('areaEffect')) &&
        this.isInViewport(entity, viewport),
    );

    for (const effect of effects) {
      const render = effect.getComponent<RenderComponent>(RenderComponent.componentName);
      const transform = effect.getComponent<TransformComponent>(TransformComponent.componentName);
      const shape = effect.getComponent<ShapeComponent>(ShapeComponent.componentName);

      const pos = transform.getPosition();
      const color = render.getColor();
      const shapeType = shape.getType();

      this.ctx.save();

      switch (shapeType) {
        case 'circle':
          // Calculate position relative to the background
          const relativeX = pos[0] + cameraOffset[0];
          const relativeY = pos[1] + cameraOffset[1];
          const size = shape.descriptor.radius;

          this.ctx.translate(relativeX, relativeY);
          this.ctx.fillStyle = this.colorToString(color);
          this.ctx.beginPath();
          this.ctx.arc(0, 0, size, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.closePath();
          break;
        case 'line':
          const laser = render.getLaser();
          if (!laser) {
            this.ctx.restore();
            continue;
          }

          // Get rotation from transform component
          const rotation = transform.rotation * deltaTime * (Math.PI / 180); // Convert to radians

          // Calculate start point with camera offset
          const startX = pos[0] + cameraOffset[0];
          const startY = pos[1] + cameraOffset[1];

          // Calculate laser direction vector, considering rotation
          let dirX, dirY;
          if (laser.aim) {
            // If we have an aim point, use it to calculate direction
            const dx = laser.aim[0] - pos[0];
            const dy = laser.aim[1] - pos[1];
            const length = Math.sqrt(dx * dx + dy * dy);
            dirX = dx / length;
            dirY = dy / length;
          } else {
            // If no aim point, use rotation directly
            dirX = Math.cos(rotation);
            dirY = Math.sin(rotation);
          }

          // Apply rotation to the direction vector if we have an aim point
          if (laser.aim) {
            const currentAngle = Math.atan2(dirY, dirX);
            const finalAngle = currentAngle + rotation;
            dirX = Math.cos(finalAngle);
            dirY = Math.sin(finalAngle);
          }

          // Calculate end point
          const endX = startX + dirX * 2000; // Use a large number for "infinite" length
          const endY = startY + dirY * 2000;

          // draw laser
          RenderUtils.drawLaser(this.ctx, startX, startY, endX, endY, color);
          break;
      }

      this.ctx.restore();
    }
  }

  filterEntity(): boolean {
    return false; // Background layer does not filter entities
  }
}
