import { RenderComponent, ShapeComponent, TransformComponent } from '@ecs/components';
import { Entity } from '@ecs/core/ecs/Entity';
import { RectArea } from '@ecs/types/types';
import { RenderLayerIdentifier, RenderLayerPriority } from '../../constant';
import { CanvasRenderLayer } from '../base';
import { RenderUtils } from '../utils/RenderUtils';

export class ItemRenderLayer extends CanvasRenderLayer {
  constructor(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
    super(RenderLayerIdentifier.ITEM, RenderLayerPriority.ITEM, canvas, context);
  }

  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void {
    const items = this.getLayerEntities(viewport);
    for (const item of items) {
      const render = item.getComponent<RenderComponent>(RenderComponent.componentName);
      const transform = item.getComponent<TransformComponent>(TransformComponent.componentName);
      const shape = item.getComponent<ShapeComponent>(ShapeComponent.componentName);
      this.renderEntity(render, transform, shape, cameraOffset);
    }
  }

  filterEntity(entity: Entity, viewport: RectArea): boolean {
    return super.filterEntity(entity, viewport) && entity.isType('pickup');
  }

  renderEntity(
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

    this.ctx.save();
    this.ctx.translate(dx, dy);
    this.ctx.rotate(rotation);
    this.ctx.scale(scale, scale);

    if (patternImage && patternImage.complete) {
      // todo: get shape size.
      const sizeX = shape.descriptor.width;
      const sizeY = shape.descriptor.height;
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
      RenderUtils.drawShape(this.ctx, render, shape);
    }

    this.ctx.restore();
  }
}
