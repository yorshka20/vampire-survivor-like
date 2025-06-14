import { MovementComponent, RenderComponent } from '@ecs/components';
import { RenderLayerIdentifier, RenderLayerPriority } from '@ecs/constants/renderLayerPriority';
import { Entity } from '@ecs/core/ecs/Entity';
import { RectArea } from '@ecs/utils/types';
import { CanvasRenderLayer } from '../base';

export class ItemRenderLayer extends CanvasRenderLayer {
  constructor(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
    super(RenderLayerIdentifier.ITEM, RenderLayerPriority.ITEM, canvas, context);
  }

  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void {
    const items = this.getLayerEntities(viewport);
    for (const item of items) {
      const render = item.getComponent<RenderComponent>(RenderComponent.componentName);
      const movement = item.getComponent<MovementComponent>(MovementComponent.componentName);
      if (render) {
        this.renderEntity(render, movement, cameraOffset);
      }
    }
  }

  filterEntity(entity: Entity, viewport: RectArea): boolean {
    return (
      entity.hasComponent(RenderComponent.componentName) &&
      entity.isType('pickup') &&
      this.isInViewport(entity, viewport)
    );
  }

  renderEntity(
    render: RenderComponent,
    movement: MovementComponent,
    cameraOffset: [number, number],
  ): void {
    const position = movement.getPosition();
    const [offsetX, offsetY] = render.getOffset();
    const [sizeX, sizeY] = render.getSize();
    const color = render.getColor();
    const rotation = render.getRotation();
    const scale = render.getScale();
    const patternImage = render.getPatternImageForState();

    this.ctx.save();
    this.ctx.translate(cameraOffset[0], cameraOffset[1]);
    this.ctx.translate(position[0] + offsetX, position[1] + offsetY);
    this.ctx.rotate(rotation);
    this.ctx.scale(scale, scale);

    if (patternImage && patternImage.complete) {
      // Calculate dimensions to maintain aspect ratio
      const aspectRatio = patternImage.width / patternImage.height;
      let drawWidth = sizeX;
      let drawHeight = sizeY;

      if (sizeX / sizeY > aspectRatio) {
        // Height is the limiting factor
        drawWidth = sizeY * aspectRatio;
      } else {
        // Width is the limiting factor
        drawHeight = sizeX / aspectRatio;
      }

      // Center the image
      const x = -drawWidth / 2;
      const y = -drawHeight / 2;

      // Render pattern image
      this.ctx.drawImage(patternImage, x, y, drawWidth, drawHeight);
    } else {
      // Render shape as fallback
      this.ctx.fillStyle = this.colorToString(color);
      this.ctx.fillRect(-sizeX / 2, -sizeY / 2, sizeX, sizeY);
    }

    this.ctx.restore();
  }
}
